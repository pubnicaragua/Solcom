import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getAuthenticatedProfile } from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';
import {
    canCreateVentasDocument,
    createPermissionDeniedMessage,
    resolveRoleForPermissionChecks,
} from '@/lib/auth/ventas-document-permissions';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { withWarrantyInDescription } from '@/lib/ventas/fiscal';
import {
    applyReservedSerialsToItems,
    assertSerialsReservedForOrder,
    consumeOrderSerialReservations,
    getActiveOrderSerialReservations,
    SerialReservationError,
} from '@/lib/ventas/serial-reservations';
import {
    beginIdempotentRequest,
    failIdempotentRequest,
    finalizeIdempotentRequest,
} from '@/lib/ventas/idempotency';
import { enqueueDocumentForSync } from '@/lib/ventas/sync-processor';
import {
    buildSyncStatusPayload,
    markDocumentSyncState,
    normalizeSyncErrorCodeFromError,
} from '@/lib/ventas/sync-state';
import { cancelPickOrderForSalesOrder, isMissingPickingInfraError } from '@/lib/ventas/picking';

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeUuid(value: unknown): string | null {
    const text = normalizeText(value);
    if (!text) return null;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
        ? text
        : null;
}

function extractMissingColumn(message: string): string | null {
    const text = String(message || '');
    let match = text.match(/Could not find the '([^']+)' column/i);
    if (match?.[1]) return match[1];
    match = text.match(/column "?([a-zA-Z0-9_]+)"? does not exist/i);
    if (match?.[1]) return match[1];
    return null;
}

async function insertInvoiceItemsWithColumnFallback(supabase: any, rows: any[]): Promise<{ error: any }> {
    if (!Array.isArray(rows) || rows.length === 0) return { error: null };
    const mutableRows = rows.map((row) => ({ ...row }));
    let retry = 0;
    while (retry < 12) {
        const result = await supabase.from('sales_invoice_items').insert(mutableRows);
        if (!result.error) return { error: null };

        const missingColumn = extractMissingColumn(result.error?.message || '');
        if (!missingColumn) return { error: result.error };

        let removed = false;
        for (const row of mutableRows) {
            if (Object.prototype.hasOwnProperty.call(row, missingColumn)) {
                delete row[missingColumn];
                removed = true;
            }
        }
        if (!removed) return { error: result.error };
        retry += 1;
    }
    return { error: new Error('No se pudieron insertar items de factura por columnas faltantes.') };
}

function isSerialTracked(detail: any): boolean {
    return Boolean(
        detail?.track_serial_number ??
        detail?.is_serial_number_tracking_enabled ??
        detail?.is_serial_number_enabled ??
        detail?.is_serial_number
    );
}

function parseSerialInput(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((entry) => normalizeText(entry))
            .filter(Boolean);
    }

    return String(value ?? '')
        .replace(/[\n;]/g, ',')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function shouldRetryZohoLocationVariant(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return (
        message.includes('warehouse_id') ||
        message.includes('location_id') ||
        message.includes('sucursal') ||
        message.includes('branch') ||
        message.includes('does not belong to the specified')
    );
}

async function tryCreateZohoInvoiceDirect(params: {
    supabase: any;
    order: any;
    fallbackReference: string;
}) {
    const { supabase, order, fallbackReference } = params;
    const zohoClient = createZohoBooksClient();
    if (!zohoClient) {
        throw new Error('Configuración de Zoho Books incompleta. Verifica ZOHO_BOOKS_*.');
    }

    const customerId = normalizeText(order?.customer_id);
    if (!customerId) {
        throw new Error('La orden no tiene cliente y no se puede crear la factura en Zoho.');
    }

    const customerLookup = await supabase
        .from('customers')
        .select('id, name, zoho_contact_id')
        .eq('id', customerId)
        .single();

    if (customerLookup.error) {
        throw new Error(`No se pudo leer cliente para Zoho: ${customerLookup.error.message}`);
    }

    const zohoCustomerId = normalizeText(customerLookup.data?.zoho_contact_id);
    const customerName = normalizeText(customerLookup.data?.name) || 'cliente';
    if (!zohoCustomerId) {
        throw new Error(`El cliente "${customerName}" no está vinculado con Zoho.`);
    }

    let parentZohoLocationId: string | undefined;       // Siempre el padre empresarial (transaction-level location_id)
    let defaultChildWarehouseId: string | undefined;     // Bodega hija para line items sin warehouse explícito
    const localWarehouseToZoho = new Map<string, string>();
    const familyZohoLocations: Array<{ id: string; code: string; name: string; zohoWarehouseId: string; isParent: boolean }> = [];
    const warehouseId = normalizeText(order?.warehouse_id);
    if (warehouseId) {
        const whLookup = await supabase
            .from('warehouses')
            .select('id, code, name, parent_warehouse_id, warehouse_type, zoho_warehouse_id')
            .eq('id', warehouseId)
            .maybeSingle();

        if (whLookup.error) {
            throw new Error(`No se pudo leer bodega para Zoho: ${whLookup.error.message}`);
        }

        const selectedWarehouse = whLookup.data || null;
        const selectedZohoWarehouseId = normalizeText(selectedWarehouse?.zoho_warehouse_id);
        if (selectedZohoWarehouseId) {
            localWarehouseToZoho.set(String(selectedWarehouse?.id || ''), selectedZohoWarehouseId);

            if (selectedWarehouse?.warehouse_type === 'empresarial') {
                // El warehouse seleccionado ES el padre empresarial
                parentZohoLocationId = selectedZohoWarehouseId;
                familyZohoLocations.push({
                    id: String(selectedWarehouse?.id || ''),
                    code: String(selectedWarehouse?.code || ''),
                    name: String(selectedWarehouse?.name || ''),
                    zohoWarehouseId: selectedZohoWarehouseId,
                    isParent: true,
                });
            } else {
                // El warehouse seleccionado es un hijo (almacen) — usar como default para line items
                defaultChildWarehouseId = selectedZohoWarehouseId;
                familyZohoLocations.push({
                    id: String(selectedWarehouse?.id || ''),
                    code: String(selectedWarehouse?.code || ''),
                    name: String(selectedWarehouse?.name || ''),
                    zohoWarehouseId: selectedZohoWarehouseId,
                    isParent: false,
                });
            }
        }

        const familyRootWarehouseId = normalizeText(selectedWarehouse?.parent_warehouse_id) || String(selectedWarehouse?.id || '');
        if (familyRootWarehouseId) {
            const familyLookup = await supabase
                .from('warehouses')
                .select('id, code, name, warehouse_type, zoho_warehouse_id')
                .or(`id.eq.${familyRootWarehouseId},parent_warehouse_id.eq.${familyRootWarehouseId}`)
                .eq('active', true);

            if (!familyLookup.error) {
                for (const row of familyLookup.data || []) {
                    const zohoId = normalizeText(row?.zoho_warehouse_id);
                    if (!zohoId) continue;
                    localWarehouseToZoho.set(String(row?.id || ''), zohoId);
                    const rowIsParent = row.warehouse_type === 'empresarial' || row.id === familyRootWarehouseId;
                    if (!familyZohoLocations.some((entry) => entry.id === row.id)) {
                        familyZohoLocations.push({
                            id: String(row?.id || ''),
                            code: String(row?.code || ''),
                            name: String(row?.name || ''),
                            zohoWarehouseId: zohoId,
                            isParent: rowIsParent,
                        });
                    }
                    // Asignar parentZohoLocationId desde el padre de la familia
                    if (rowIsParent && !parentZohoLocationId) {
                        parentZohoLocationId = zohoId;
                    }
                }
            }

            // Fallback: si aún no hay defaultChildWarehouseId, usar el primer hijo de la familia
            if (!defaultChildWarehouseId) {
                const firstChild = familyZohoLocations.find((entry) => !entry.isParent);
                defaultChildWarehouseId = firstChild?.zohoWarehouseId;
            }
        }
    }

    const itemIds = Array.from(new Set((order.items || [])
        .map((line: any) => normalizeText(line?.item_id))
        .filter(Boolean)));

    const mappedItems = new Map<string, { name: string; sku: string; zoho_item_id: string | null; price: number }>();
    if (itemIds.length > 0) {
        const itemLookup = await supabase
            .from('items')
            .select('id, name, sku, zoho_item_id, price')
            .in('id', itemIds);
        if (itemLookup.error) {
            throw new Error(`No se pudo leer artículos para Zoho: ${itemLookup.error.message}`);
        }
        for (const row of itemLookup.data || []) {
            mappedItems.set(row.id, {
                name: row.name || row.sku || row.id,
                sku: row.sku || '',
                zoho_item_id: row.zoho_item_id || null,
                price: Math.max(0, normalizeNumber(row.price, 0)),
            });
        }
    }

    const itemMetaByZohoItemId = new Map<string, { serialTracked: boolean; loaded: boolean }>();
    const serialPoolByItemAndLocation = new Map<string, string[]>();
    const parseAvailableSerials = (serialResponse: any): string[] =>
        (Array.isArray(serialResponse?.serial_numbers) ? serialResponse.serial_numbers : [])
            .filter((entry: any) => String(entry?.status || '').toLowerCase() === 'active')
            .map((entry: any) => normalizeText(entry?.serialnumber))
            .filter(Boolean);

    const fetchSerialPool = async (zohoItemId: string, locationId: string): Promise<string[]> => {
        const key = `${zohoItemId}::${locationId}`;
        if (serialPoolByItemAndLocation.has(key)) {
            return serialPoolByItemAndLocation.get(key) || [];
        }
        const serialResponse = await zohoClient.request(
            'GET',
            `/inventory/v1/items/serialnumbers?item_id=${encodeURIComponent(zohoItemId)}&show_transacted_out=false&location_id=${encodeURIComponent(locationId)}`
        );
        const pool = parseAvailableSerials(serialResponse);
        serialPoolByItemAndLocation.set(key, pool);
        return pool;
    };

    const rawZohoLineItems = (order.items || []).map((line: any, index: number) => {
        const localItemId = normalizeText(line?.item_id);
        if (!localItemId) {
            throw new Error(`La línea ${index + 1} no está vinculada a un producto local.`);
        }

        const mapped = mappedItems.get(localItemId);
        if (!mapped) {
            throw new Error(`No se encontró artículo local (${localItemId}) para enviar a Zoho.`);
        }

        const zohoItemId = normalizeText(mapped.zoho_item_id);
        if (!zohoItemId) {
            throw new Error(`El artículo "${mapped.name}" (${mapped.sku || localItemId}) no tiene zoho_item_id.`);
        }

        const quantity = Math.max(0.01, normalizeNumber(line?.quantity, 1));
        const lineUnitPrice = Math.max(0, normalizeNumber(line?.unit_price, 0));
        const discountPercent = Math.max(0, Math.min(100, normalizeNumber(line?.discount_percent, 0)));
        const lineSubtotal = Math.max(0, normalizeNumber(line?.subtotal, 0));
        const fallbackRateFromSubtotal = quantity > 0 ? lineSubtotal / quantity : 0;
        const fallbackCatalogRate = Math.max(0, normalizeNumber(mapped.price, 0));
        const resolvedUnitRate = lineUnitPrice > 0
            ? lineUnitPrice
            : (fallbackRateFromSubtotal > 0 ? fallbackRateFromSubtotal : fallbackCatalogRate);
        const taxId = normalizeText(line?.tax_id);
        const warranty = normalizeText(line?.warranty);
        const expectedSerialCount = Math.round(quantity);
        let serials = parseSerialInput(
            line?.serial_number_value ?? line?.serial_numbers ?? line?.serials
        );
        const lineWarehouseId = normalizeText(line?.line_warehouse_id);
        const lineZohoWarehouseId = normalizeText(line?.line_zoho_warehouse_id);

        return {
            item_id: zohoItemId,
            quantity,
            rate: Number(Math.max(0, resolvedUnitRate).toFixed(6)),
            ...(taxId ? { tax_id: taxId } : {}),
            description: withWarrantyInDescription(normalizeText(line?.description || mapped.name), warranty || null),
            ...(discountPercent > 0 ? { discount: `${Number(discountPercent.toFixed(2))}%` } : {}),
            __serials: serials,
            __expectedSerialCount: expectedSerialCount,
            __mappedName: mapped.name,
            __zohoItemId: zohoItemId,
            __lineWarehouseId: lineWarehouseId,
            __lineZohoWarehouseId: lineZohoWarehouseId,
            __warranty: warranty,
        } as any;
    });

    const zohoLineItems: any[] = [];
    // Resolve serial-tracking metadata + serialize line payload.
    for (const line of rawZohoLineItems as any[]) {
        const zohoItemId = line.__zohoItemId as string;
        const mappedName = line.__mappedName as string;
        const explicitLineWarehouseId = normalizeText(line.__lineWarehouseId);
        const explicitLineZohoWarehouseId = normalizeText(line.__lineZohoWarehouseId);

        // Candidatos de ubicación para validar/autoasignar seriales en bodegas hijas de la familia.
        const locationCandidates = Array.from(
            new Set(
                [
                    explicitLineZohoWarehouseId,
                    explicitLineWarehouseId ? normalizeText(localWarehouseToZoho.get(explicitLineWarehouseId)) : '',
                    parentZohoLocationId || '',
                    defaultChildWarehouseId || '',
                    ...familyZohoLocations.map((entry) => entry.zohoWarehouseId),
                ].filter(Boolean)
            )
        );

        let itemMeta = itemMetaByZohoItemId.get(zohoItemId);
        if (!itemMeta || !itemMeta.loaded) {
            const detail = await zohoClient.getItemDetails(zohoItemId);
            itemMeta = {
                serialTracked: isSerialTracked(detail),
                loaded: true,
            };
            itemMetaByZohoItemId.set(zohoItemId, itemMeta);
        }

        const serialTracked = Boolean(itemMeta.serialTracked);
        const quantity = normalizeNumber(line.quantity, 0);
        const expectedSerialCount = normalizeNumber(line.__expectedSerialCount, 0);
        let serials: string[] = Array.isArray(line.__serials) ? line.__serials : [];
        const explicitLineLocationId = explicitLineZohoWarehouseId
            || (explicitLineWarehouseId ? normalizeText(localWarehouseToZoho.get(explicitLineWarehouseId)) : '')
            || '';
        let resolvedLineLocationId = explicitLineLocationId || locationCandidates[0] || '';

        if (serialTracked && !Number.isInteger(quantity)) {
            throw new Error(`El artículo "${mappedName}" usa seriales y requiere cantidad entera.`);
        }

        if (serialTracked) {
            if (locationCandidates.length === 0) {
                throw new Error(`El artículo "${mappedName}" requiere seriales y la OV no tiene ubicación Zoho válida.`);
            }

            if (serials.length !== expectedSerialCount) {
                throw new Error(
                    `El artículo "${mappedName}" requiere ${expectedSerialCount} serial(es) reservado(s). ` +
                    `Seleccionados: ${serials.length}.`
                );
            }

            // Permite seriales en múltiples bodegas de la misma familia: se divide la línea por ubicación.
            const byLocation = new Map<string, string[]>();
            for (const serial of serials) {
                let foundLocationForSerial = '';
                for (const locationId of locationCandidates) {
                    const pool = await fetchSerialPool(zohoItemId, locationId);
                    const idx = pool.indexOf(serial);
                    if (idx >= 0) {
                        pool.splice(idx, 1);
                        foundLocationForSerial = locationId;
                        break;
                    }
                }

                if (!foundLocationForSerial) {
                    throw new Error(
                        `El serial "${serial}" del artículo "${mappedName}" no está disponible en la familia seleccionada.`
                    );
                }

                if (!byLocation.has(foundLocationForSerial)) {
                    byLocation.set(foundLocationForSerial, []);
                }
                byLocation.get(foundLocationForSerial)!.push(serial);
            }

            for (const [locationId, serialList] of byLocation.entries()) {
                const clonedLine: any = {
                    item_id: line.item_id,
                    quantity: serialList.length,
                    rate: line.rate,
                    tax_id: line.tax_id,
                    description: line.description,
                    ...(line.discount ? { discount: line.discount } : {}),
                    serial_number_value: serialList.join(','),
                    serial_numbers: serialList,
                    __resolvedLineLocationId: locationId,
                    __warranty: line.__warranty,
                };
                zohoLineItems.push(clonedLine);
            }
            continue;
        } else if (serials.length > 0 && serials.length !== expectedSerialCount) {
            throw new Error(
                `Seriales inválidos para "${mappedName}": cantidad ${expectedSerialCount}, seriales ${serials.length}.`
            );
        }

        if (serials.length > 0) {
            line.serial_number_value = serials.join(',');
            line.serial_numbers = serials;
        }

        if (resolvedLineLocationId) {
            line.__resolvedLineLocationId = resolvedLineLocationId;
        }

        delete line.__serials;
        delete line.__expectedSerialCount;
        delete line.__mappedName;
        delete line.__zohoItemId;
        delete line.__lineWarehouseId;
        delete line.__lineZohoWarehouseId;
        zohoLineItems.push(line);
    }

    if (zohoLineItems.length === 0) {
        throw new Error('La orden no contiene líneas válidas para crear factura en Zoho.');
    }

    const invoiceDate = normalizeText(order?.date) || new Date().toISOString().slice(0, 10);
    const warrantyCustomFieldId = normalizeText(process.env.ZOHO_BOOKS_WARRANTY_CUSTOMFIELD_ID);
    const payloadBase: any = {
        customer_id: zohoCustomerId,
        date: invoiceDate,
        reference_number: normalizeText(order?.order_number) || fallbackReference,
        discount_type: 'item_level',
        is_discount_before_tax: true,
    };

    const notes = normalizeText(order?.notes);
    if (notes) payloadBase.notes = notes;
    const salespersonName = normalizeText(order?.salesperson_name);
    if (salespersonName) payloadBase.salesperson_name = salespersonName;

    const hasLineLocation = zohoLineItems.some((line) => Boolean(normalizeText(line?.__resolvedLineLocationId)));
    const buildLineItems = (lineFieldMode: 'warehouse_id' | 'location_id' | 'none', includeCustomFields: boolean) =>
        zohoLineItems.map((line) => {
            const locationId = normalizeText(line?.__resolvedLineLocationId);
            const nextLine: any = { ...line };
            const warranty = normalizeText(line?.__warranty);
            delete nextLine.__resolvedLineLocationId;
            delete nextLine.__warranty;
            if (locationId && lineFieldMode === 'warehouse_id') {
                nextLine.warehouse_id = locationId;
            }
            if (locationId && lineFieldMode === 'location_id') {
                nextLine.location_id = locationId;
            }
            if (includeCustomFields && warrantyCustomFieldId && warranty) {
                nextLine.item_custom_fields = [
                    {
                        customfield_id: warrantyCustomFieldId,
                        value: warranty,
                    },
                ];
            }
            return nextLine;
        });

    const attempts = hasLineLocation
        ? [
            { mode: 'warehouse_id' as const, includeParentLocation: true, label: 'line.warehouse_id + location_id padre' },
            { mode: 'location_id' as const, includeParentLocation: true, label: 'line.location_id + location_id padre' },
            { mode: 'warehouse_id' as const, includeParentLocation: false, label: 'line.warehouse_id sin location padre' },
            { mode: 'location_id' as const, includeParentLocation: false, label: 'line.location_id sin location padre' },
            { mode: 'none' as const, includeParentLocation: true, label: 'sin ubicación por línea + location_id padre' },
            { mode: 'none' as const, includeParentLocation: false, label: 'sin ubicación por línea y sin padre' },
        ]
        : [
            { mode: 'none' as const, includeParentLocation: true, label: 'solo location_id padre' },
            { mode: 'none' as const, includeParentLocation: false, label: 'sin location_id padre' },
        ];

    const errors: string[] = [];
    for (const attempt of attempts) {
        const payload: any = {
            ...payloadBase,
            line_items: buildLineItems(attempt.mode, true),
        };

        if (attempt.includeParentLocation && parentZohoLocationId) {
            payload.location_id = parentZohoLocationId;
        } else {
            delete payload.location_id;
        }

        try {
            return await zohoClient.createInvoice(payload);
        } catch (error: any) {
            const message = normalizeText(error?.message) || 'Error desconocido';
            errors.push(`${attempt.label}: ${message}`);
            const customFieldRejected = message.toLowerCase().includes('customfield')
                || message.toLowerCase().includes('item_custom_fields');
            if (customFieldRejected) {
                try {
                    return await zohoClient.createInvoice({
                        ...payload,
                        line_items: buildLineItems(attempt.mode, false),
                    });
                } catch {
                    // Sigue flujo normal de variantes si falla sin custom fields.
                }
            }
            if (!shouldRetryZohoLocationVariant(error)) {
                throw error;
            }
        }
    }

    throw new Error(errors.slice(0, 4).join(' | ') || 'Zoho rechazó la factura con todas las variantes de ubicación.');
}

// POST /api/ventas/sales-orders/[id]/convert — convert to invoice
export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    let idempotencyRecordId = '';
    let externalRequestId = '';
    let idempotencyPayloadHash = '';
    let idempotencyKey = '';
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const auth = await getAuthenticatedProfile(supabase);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const moduleAccess = await getEffectiveModuleAccess(supabase, auth.userId, auth.role);
        if (!hasModuleAccess(moduleAccess, 'ventas')) {
            return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
        }

        const roleForPermission = await resolveRoleForPermissionChecks(
            supabase,
            auth.userId,
            auth.role
        );
        const canCreateInvoice = await canCreateVentasDocument(
            supabase,
            roleForPermission,
            'invoice'
        );
        if (!canCreateInvoice) {
            return NextResponse.json(
                { error: createPermissionDeniedMessage('invoice') },
                { status: 403 }
            );
        }

        const idempotencyStart = await beginIdempotentRequest({
            supabase,
            req,
            endpoint: `/api/ventas/sales-orders/${params.id}/convert`,
            payload: { order_id: params.id },
            required: false,
        });

        if (idempotencyStart.kind === 'error' || idempotencyStart.kind === 'replay') {
            return idempotencyStart.response;
        }

        idempotencyRecordId = idempotencyStart.recordId;
        externalRequestId = idempotencyStart.externalRequestId;
        idempotencyPayloadHash = idempotencyStart.payloadHash;
        idempotencyKey = idempotencyStart.key;

        const failWith = async (bodyData: any, statusCode: number) => {
            await failIdempotentRequest({
                supabase,
                recordId: idempotencyRecordId,
                responseStatus: statusCode,
                responseBody: bodyData,
            });
            return NextResponse.json(bodyData, { status: statusCode });
        };

        const succeedWith = async (
            bodyData: any,
            statusCode: number,
            documentId?: string | null
        ) => {
            await finalizeIdempotentRequest({
                supabase,
                recordId: idempotencyRecordId,
                responseStatus: statusCode,
                responseBody: bodyData,
                documentType: 'sales_invoice',
                documentId: documentId || null,
                externalRequestId: externalRequestId || null,
            });
            const response = NextResponse.json(bodyData, { status: statusCode });
            if (idempotencyKey) {
                response.headers.set('X-Idempotency-Key', idempotencyKey);
            }
            return response;
        };

        const { data: order, error: orderError } = await supabase
            .from('sales_orders')
            .select(`
                *,
                items:sales_order_items(*)
            `)
            .eq('id', params.id)
            .order('sort_order', { referencedTable: 'sales_order_items', ascending: true })
            .single();

        if (orderError || !order) {
            return failWith({ error: orderError?.message || 'Orden no encontrada' }, 404);
        }

        if (order.status === 'convertida') {
            return failWith({ error: 'Esta orden ya fue convertida a factura' }, 400);
        }

        if (order.status === 'cancelada') {
            return failWith({ error: 'No se puede convertir una orden cancelada' }, 400);
        }

        const orderItems = Array.isArray(order.items) ? order.items : [];
        if (orderItems.length === 0) {
            return failWith({ error: 'La orden no tiene líneas para convertir.' }, 400);
        }

        const orderSerialReservations = await getActiveOrderSerialReservations({
            supabase,
            orderId: params.id,
        });

        const serialAwareItems = applyReservedSerialsToItems({
            items: orderItems,
            reservations: orderSerialReservations,
        });

        try {
            await assertSerialsReservedForOrder({
                supabase,
                orderId: params.id,
                items: serialAwareItems,
            });
        } catch (reservationError: any) {
            if (reservationError instanceof SerialReservationError) {
                return failWith(
                    {
                        error: reservationError.message,
                        code: reservationError.code,
                        details: reservationError.details || null,
                    },
                    reservationError.status || 409
                );
            }
            return failWith(
                { error: reservationError?.message || 'No se pudieron validar reservas de seriales para facturar.' },
                500
            );
        }

        const orderForInvoice = {
            ...order,
            items: serialAwareItems,
        };

        const year = new Date().getFullYear();
        let invoiceNumber = `FAC-OV-${year}-${Date.now().toString(36).toUpperCase()}`;

        if (order.warehouse_id) {
            const { data: wh } = await supabase
                .from('warehouses')
                .select('code')
                .eq('id', order.warehouse_id)
                .maybeSingle();
            if (wh?.code) {
                invoiceNumber = `FAC-${String(wh.code).trim().toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
            }
        }

        const invoiceInsert: any = {
            invoice_number: invoiceNumber,
            customer_id: order.customer_id || null,
            warehouse_id: order.warehouse_id || null,
            order_number: order.order_number || null,
            terms: normalizeText((order as any).payment_terms) || null,
            salesperson_id: normalizeUuid((order as any).salesperson_id),
            date: new Date().toISOString().slice(0, 10),
            due_date: null,
            status: 'enviada',
            subtotal: normalizeNumber(order.subtotal, 0),
            tax_rate: normalizeNumber(order.tax_rate, 0),
            tax_amount: normalizeNumber(order.tax_amount, 0),
            discount_amount: normalizeNumber(order.discount_amount, 0),
            total: normalizeNumber(order.total, 0),
            notes: order.notes
                ? `Convertida desde OV: ${order.order_number}. ${order.notes}`
                : `Convertida desde OV: ${order.order_number}`,
            source: 'sales_order_conversion',
            sync_status: 'pending_sync',
            sync_error_code: null,
            sync_error_message: null,
            last_sync_attempt_at: new Date().toISOString(),
            external_request_id: externalRequestId || null,
        };

        let invoice: any = null;
        let invoiceError: any = null;
        let invoiceColumnRetry = 0;
        while (invoiceColumnRetry < 12) {
            const result = await supabase
                .from('sales_invoices')
                .insert(invoiceInsert)
                .select()
                .single();
            invoice = result.data;
            invoiceError = result.error;

            if (!invoiceError || invoice) break;

            const missingColumn = extractMissingColumn(invoiceError?.message || '');
            if (missingColumn && Object.prototype.hasOwnProperty.call(invoiceInsert, missingColumn)) {
                delete invoiceInsert[missingColumn];
                invoiceColumnRetry += 1;
                continue;
            }
            break;
        }

        if (invoiceError || !invoice) {
            return failWith({ error: invoiceError?.message || 'No se pudo crear la factura local' }, 500);
        }

        const invoiceItems = serialAwareItems.map((item: any, index: number) => ({
            invoice_id: invoice.id,
            item_id: item.item_id || null,
            description: item.description || 'Artículo',
            quantity: normalizeNumber(item.quantity, 0),
            unit_price: normalizeNumber(item.unit_price, 0),
            discount_percent: normalizeNumber(item.discount_percent, 0),
            tax_id: normalizeText(item.tax_id) || null,
            tax_name: normalizeText(item.tax_name) || null,
            tax_percentage: Math.max(0, normalizeNumber(item.tax_percentage, 0)),
            warranty: normalizeText(item.warranty) || null,
            serial_number_value: normalizeText(item.serial_number_value) || null,
            price_profile_code: normalizeText(item.price_profile_code) || null,
            subtotal: normalizeNumber(item.subtotal, 0),
            sort_order: index,
        }));

        const { error: itemsError } = await insertInvoiceItemsWithColumnFallback(supabase, invoiceItems);

        if (itemsError) {
            await supabase.from('sales_invoices').delete().eq('id', invoice.id);
            return failWith({ error: itemsError.message }, 500);
        }

        const zohoClient = createZohoBooksClient();
        let zohoInvoice: { invoice_id: string; invoice_number: string } | null = null;
        let directError: any = null;
        let convertError: any = null;
        let syncWarning: string | null = null;
        let responseStatus = 201;
        let syncState: {
            sync_status: string;
            sync_error_code: string | null;
            sync_error_message: string | null;
            last_sync_attempt_at: string | null;
            last_synced_at: string | null;
        } = {
            sync_status: 'pending_sync',
            sync_error_code: null as string | null,
            sync_error_message: null as string | null,
            last_sync_attempt_at: new Date().toISOString() as string | null,
            last_synced_at: null as string | null,
        };

        if (!zohoClient) {
            directError = new Error('No se pudo sincronizar con Zoho porque la configuración ZOHO_BOOKS_* está incompleta.');
        }

        if (zohoClient) {
            try {
                // Prefer direct invoice creation to keep ERP prices and serial logic aligned.
                zohoInvoice = await tryCreateZohoInvoiceDirect({
                    supabase,
                    order: orderForInvoice,
                    fallbackReference: invoice.invoice_number,
                });
            } catch (error: any) {
                directError = error;
            }
        }

        if (!zohoInvoice && zohoClient && normalizeText(orderForInvoice.zoho_salesorder_id)) {
            try {
                zohoInvoice = await zohoClient.convertSalesOrderToInvoice(orderForInvoice.zoho_salesorder_id);
            } catch (error: any) {
                convertError = error;
            }
        }

        if (!zohoInvoice) {
            const firstError = normalizeText(directError?.message);
            const secondError = normalizeText(convertError?.message);
            const secondErrorLower = secondError.toLowerCase();
            const ovConvertUnsupportedByZoho = secondErrorLower.includes('"code":1000')
                || secondErrorLower.includes('no se puede convertir')
                || secondErrorLower.includes('cannot be converted');
            const combinedError = firstError && secondError
                ? (
                    ovConvertUnsupportedByZoho
                        ? `Zoho rechazó la creación directa (${firstError}). Nota: Zoho no permite convertir automáticamente OV con artículos serializados/lotes.`
                        : `Zoho rechazó la creación directa (${firstError}) y también la conversión por OV (${secondError}).`
                )
                : firstError || secondError || 'No se pudo crear factura en Zoho.';
            syncWarning = combinedError;
            responseStatus = 202;
            const errorCode = normalizeSyncErrorCodeFromError(new Error(combinedError));

            const syncUpdate = await markDocumentSyncState({
                supabase,
                documentType: 'sales_invoice',
                documentId: invoice.id,
                status: 'pending_sync',
                errorCode,
                errorMessage: combinedError,
                externalRequestId: externalRequestId || null,
                incrementAttempts: true,
            });

            if (!syncUpdate.error && syncUpdate.data) {
                syncState = buildSyncStatusPayload(syncUpdate.data);
            } else {
                syncState = {
                    sync_status: 'pending_sync',
                    sync_error_code: errorCode,
                    sync_error_message: combinedError,
                    last_sync_attempt_at: new Date().toISOString(),
                    last_synced_at: null,
                };
            }

            await enqueueDocumentForSync({
                supabase,
                documentType: 'sales_invoice',
                documentId: invoice.id,
                idempotencyKey: idempotencyKey || null,
                payloadHash: idempotencyPayloadHash || null,
                externalRequestId: externalRequestId || null,
                errorCode,
                errorMessage: combinedError,
                priority: 10,
            });
        } else {
            const syncUpdate = await markDocumentSyncState({
                supabase,
                documentType: 'sales_invoice',
                documentId: invoice.id,
                status: 'synced',
                externalRequestId: externalRequestId || null,
                incrementAttempts: true,
            });

            if (!syncUpdate.error && syncUpdate.data) {
                syncState = buildSyncStatusPayload(syncUpdate.data);
            } else {
                syncState = {
                    sync_status: 'synced',
                    sync_error_code: null,
                    sync_error_message: null,
                    last_sync_attempt_at: new Date().toISOString(),
                    last_synced_at: new Date().toISOString(),
                };
            }
        }

        if (zohoInvoice) {
            const invoiceMetaUpdate: any = {
                zoho_invoice_id: zohoInvoice.invoice_id || null,
                zoho_invoice_number: zohoInvoice.invoice_number || null,
                zoho_synced_at: new Date().toISOString(),
            };

            let metaRetry = 0;
            while (metaRetry < 8) {
                const metaResult = await supabase
                    .from('sales_invoices')
                    .update(invoiceMetaUpdate)
                    .eq('id', invoice.id);

                if (!metaResult.error) break;

                const missingColumn = extractMissingColumn(metaResult.error?.message || '');
                if (missingColumn && Object.prototype.hasOwnProperty.call(invoiceMetaUpdate, missingColumn)) {
                    delete invoiceMetaUpdate[missingColumn];
                    metaRetry += 1;
                    continue;
                }
                break;
            }
        }

        const verifyInvoice = await supabase
            .from('sales_invoices')
            .select('id, invoice_number')
            .eq('id', invoice.id)
            .maybeSingle();

        if (verifyInvoice.error || !verifyInvoice.data) {
            return failWith(
                { error: 'La factura se procesó pero no fue posible verificar su persistencia local.' },
                500
            );
        }

        const orderUpdatePayload: any = {
            status: 'convertida',
            converted_invoice_id: invoice.id,
            updated_at: new Date().toISOString(),
        };

        let orderUpdateError: any = null;
        let updateRetry = 0;
        while (updateRetry < 8) {
            const updateResult = await supabase
                .from('sales_orders')
                .update(orderUpdatePayload)
                .eq('id', params.id);

            orderUpdateError = updateResult.error;
            if (!orderUpdateError) break;

            const missingColumn = extractMissingColumn(orderUpdateError?.message || '');
            if (missingColumn && Object.prototype.hasOwnProperty.call(orderUpdatePayload, missingColumn)) {
                delete orderUpdatePayload[missingColumn];
                updateRetry += 1;
                continue;
            }
            break;
        }

        if (orderUpdateError) {
            return failWith(
                {
                    error: `Factura creada (${invoice.invoice_number}) pero no se pudo actualizar la orden: ${orderUpdateError.message}`,
                    invoice_id: invoice.id,
                    invoice_number: invoice.invoice_number,
                },
                500
            );
        }

        const pickCancel = await cancelPickOrderForSalesOrder({
            supabase,
            salesOrderId: params.id,
            actorUserId: user.id || null,
            reason: 'sales_order_converted_to_invoice',
        });
        if (pickCancel.error && !isMissingPickingInfraError(pickCancel.error)) {
            console.warn(
                `[sales-orders/convert] OV ${params.id} convertida, pero no se pudo cancelar alistamiento: ${
                    pickCancel.error?.message || 'error desconocido'
                }`
            );
        }

        try {
            await consumeOrderSerialReservations({
                supabase,
                orderId: params.id,
                invoiceId: invoice.id,
            });
        } catch (consumeError: any) {
            if (consumeError instanceof SerialReservationError) {
                return failWith(
                    {
                        error: `Factura creada (${invoice.invoice_number}) pero no se pudieron consumir reservas: ${consumeError.message}`,
                        code: consumeError.code,
                        details: consumeError.details || null,
                        invoice_id: invoice.id,
                        invoice_number: invoice.invoice_number,
                    },
                    500
                );
            }
            return failWith(
                {
                    error: `Factura creada (${invoice.invoice_number}) pero no se pudieron consumir reservas: ${consumeError?.message || 'Error desconocido'}`,
                    invoice_id: invoice.id,
                    invoice_number: invoice.invoice_number,
                },
                500
            );
        }

        const responseBody = {
            success: true,
            order_id: params.id,
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            zoho: zohoInvoice,
            warning: syncWarning,
            code: responseStatus === 202 ? 'SYNC_PENDING' : undefined,
            ...syncState,
            external_request_id: externalRequestId || invoice.external_request_id || null,
        };

        return succeedWith(responseBody, responseStatus, invoice.id);
    } catch (error: any) {
        if (idempotencyRecordId) {
            const errorBody = error instanceof SerialReservationError
                ? { error: error.message, code: error.code, details: error.details || null }
                : { error: error.message || 'Error interno' };
            const errorStatus = error instanceof SerialReservationError ? (error.status || 409) : 500;
            try {
                await failIdempotentRequest({
                    supabase: createRouteHandlerClient({ cookies }),
                    recordId: idempotencyRecordId,
                    responseStatus: errorStatus,
                    responseBody: errorBody,
                });
            } catch {
                // no-op
            }
        }
        if (error instanceof SerialReservationError) {
            return NextResponse.json(
                {
                    error: error.message,
                    code: error.code,
                    details: error.details || null,
                },
                { status: error.status || 409 }
            );
        }
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}
