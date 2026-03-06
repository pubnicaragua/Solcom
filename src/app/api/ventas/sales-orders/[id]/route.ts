import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { buildTaxCatalogMap, getZohoTaxCatalog } from '@/lib/zoho/tax-catalog';
import {
    computeFiscalTotals,
    FiscalValidationError,
    normalizeFiscalLine,
    withWarrantyInDescription,
} from '@/lib/ventas/fiscal';
import {
    releaseOrderSerialReservations,
    replaceOrderSerialReservations,
    SerialReservationError,
} from '@/lib/ventas/serial-reservations';
import {
    buildVersionConflictResponse,
    getCurrentRowVersion,
    getExpectedRowVersion,
} from '@/lib/ventas/version-conflict';

const ORDER_STATUSES = new Set(['borrador', 'confirmada', 'convertida', 'cancelada']);

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeSerialInput(value: unknown): string {
    if (Array.isArray(value)) {
        return value
            .map((entry) => String(entry ?? '').trim())
            .filter(Boolean)
            .join(',');
    }
    return String(value ?? '')
        .replace(/[\n;]/g, ',')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join(',');
}

function normalizeWarranty(value: unknown): string | null {
    const text = normalizeText(value);
    return text || null;
}

function normalizeStatus(value: unknown, fallback = 'borrador'): string {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return ORDER_STATUSES.has(text) ? text : fallback;
}

function extractMissingColumn(message: string): string | null {
    const text = String(message || '');
    let match = text.match(/Could not find the '([^']+)' column/i);
    if (match?.[1]) return match[1];
    match = text.match(/column "?([a-zA-Z0-9_]+)"? does not exist/i);
    if (match?.[1]) return match[1];
    return null;
}

function isMissingRelationshipBetween(message: string, left: string, right: string): boolean {
    const text = String(message || '').toLowerCase();
    return (
        text.includes('could not find a relationship between') &&
        text.includes(String(left || '').toLowerCase()) &&
        text.includes(String(right || '').toLowerCase())
    );
}

async function insertSalesOrderItemsWithColumnFallback(supabase: any, rows: any[]): Promise<{ error: any }> {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { error: null };
    }

    const mutableRows = rows.map((row) => ({ ...row }));
    let retry = 0;
    while (retry < 12) {
        const result = await supabase
            .from('sales_order_items')
            .insert(mutableRows);

        if (!result.error) {
            return { error: null };
        }

        const missingColumn = extractMissingColumn(result.error?.message || '');
        if (!missingColumn) {
            return { error: result.error };
        }

        let removed = false;
        for (const row of mutableRows) {
            if (Object.prototype.hasOwnProperty.call(row, missingColumn)) {
                delete row[missingColumn];
                removed = true;
            }
        }

        if (!removed) {
            return { error: result.error };
        }

        retry += 1;
    }

    return { error: new Error('No se pudieron insertar los items por columnas faltantes') };
}

async function syncUpdatedSalesOrderToZoho(params: {
    supabase: any;
    orderId: string;
}) {
    const { supabase, orderId } = params;
    const zohoClient = createZohoBooksClient();
    if (!zohoClient) {
        throw new Error('No se pudo sincronizar en Zoho: configuración ZOHO_BOOKS_* incompleta.');
    }

    const orderLookup = await supabase
        .from('sales_orders')
        .select('*')
        .eq('id', orderId)
        .single();

    if (orderLookup.error || !orderLookup.data) {
        throw new Error(`No se pudo leer orden para Zoho: ${orderLookup.error?.message || 'Orden no encontrada'}`);
    }

    const order = orderLookup.data as any;
    const zohoSalesOrderId = normalizeText(order?.zoho_salesorder_id);
    if (!zohoSalesOrderId) return;

    const normalizedStatus = normalizeStatus(order?.status, 'borrador');
    if (normalizedStatus === 'cancelada') {
        await zohoClient.voidSalesOrder(zohoSalesOrderId);
        return;
    }

    const orderItemsLookup = await supabase
        .from('sales_order_items')
        .select('item_id, quantity, unit_price, discount_percent, tax_id, tax_name, tax_percentage, warranty, description, serial_number_value')
        .eq('order_id', orderId)
        .order('sort_order', { ascending: true });

    if (orderItemsLookup.error) {
        throw new Error(`No se pudieron leer líneas para Zoho: ${orderItemsLookup.error.message}`);
    }

    const orderItems = Array.isArray(orderItemsLookup.data) ? orderItemsLookup.data : [];
    if (orderItems.length === 0) {
        throw new Error('La OV no tiene líneas válidas para sincronizar en Zoho.');
    }

    const customerId = normalizeText(order?.customer_id);
    if (!customerId) {
        throw new Error('La OV no tiene cliente. Zoho requiere customer_id.');
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
    if (!zohoCustomerId) {
        const customerName = normalizeText(customerLookup.data?.name) || 'cliente';
        throw new Error(`El cliente "${customerName}" no está vinculado con Zoho.`);
    }

    const uniqueLocalItemIds = Array.from(new Set(
        orderItems
            .map((line: any) => normalizeText(line?.item_id))
            .filter(Boolean)
    ));

    const mappedItems = new Map<string, { name: string; sku: string; zoho_item_id: string | null }>();
    if (uniqueLocalItemIds.length > 0) {
        const itemLookup = await supabase
            .from('items')
            .select('id, name, sku, zoho_item_id')
            .in('id', uniqueLocalItemIds);

        if (itemLookup.error) {
            throw new Error(`No se pudo leer catálogo local para Zoho: ${itemLookup.error.message}`);
        }

        for (const row of itemLookup.data || []) {
            mappedItems.set(row.id, {
                name: row.name || row.sku || row.id,
                sku: row.sku || '',
                zoho_item_id: row.zoho_item_id || null,
            });
        }
    }

    const warrantyCustomFieldId = normalizeText(process.env.ZOHO_BOOKS_WARRANTY_CUSTOMFIELD_ID);
    const buildZohoLineItems = (includeCustomFields: boolean) => orderItems.map((line: any, index: number) => {
        const localItemId = normalizeText(line?.item_id);
        if (!localItemId) {
            throw new Error(`La línea ${index + 1} no está vinculada a un producto del catálogo.`);
        }

        const mapped = mappedItems.get(localItemId);
        if (!mapped) {
            throw new Error(`No se encontró el artículo local ${localItemId} para sincronizar en Zoho.`);
        }

        const zohoItemId = normalizeText(mapped.zoho_item_id);
        if (!zohoItemId) {
            throw new Error(`El artículo "${mapped.name}" (${mapped.sku || localItemId}) no tiene zoho_item_id.`);
        }

        const quantity = Math.max(0.01, normalizeNumber(line?.quantity, 1));
        const unitPrice = Math.max(0, normalizeNumber(line?.unit_price, 0));
        const discountPercent = Math.max(0, Math.min(100, normalizeNumber(line?.discount_percent, 0)));
        const taxId = normalizeText(line?.tax_id);
        const warranty = normalizeWarranty(line?.warranty);

        const payloadLine: any = {
            item_id: zohoItemId,
            quantity,
            rate: Number(unitPrice.toFixed(6)),
            description: withWarrantyInDescription(normalizeText(line?.description || mapped.name), warranty),
        };

        if (taxId) {
            payloadLine.tax_id = taxId;
        }

        if (discountPercent > 0) {
            payloadLine.discount = `${Number(discountPercent.toFixed(2))}%`;
        }
        if (line?.serial_number_value) {
            payloadLine.serial_number_value = normalizeSerialInput(line.serial_number_value);
        }
        if (includeCustomFields && warrantyCustomFieldId && warranty) {
            payloadLine.item_custom_fields = [
                {
                    customfield_id: warrantyCustomFieldId,
                    value: warranty,
                },
            ];
        }

        return payloadLine;
    });

    let zohoLocationId: string | undefined;
    const warehouseId = normalizeText(order?.warehouse_id);
    if (warehouseId) {
        const warehouseLookup = await supabase
            .from('warehouses')
            .select('id, zoho_warehouse_id')
            .eq('id', warehouseId)
            .maybeSingle();

        if (warehouseLookup.error) {
            throw new Error(`No se pudo leer bodega para Zoho: ${warehouseLookup.error.message}`);
        }

        const zohoWarehouseId = normalizeText(warehouseLookup.data?.zoho_warehouse_id);
        if (zohoWarehouseId) {
            zohoLocationId = zohoWarehouseId;
        }
    }

    const payload: any = {
        customer_id: zohoCustomerId,
        date: normalizeText(order?.date) || new Date().toISOString().slice(0, 10),
        line_items: buildZohoLineItems(true),
        reference_number: normalizeText(order?.order_number) || undefined,
        discount_type: 'item_level',
        is_discount_before_tax: true,
    };

    const shipmentDate = normalizeText(order?.expected_delivery_date);
    if (shipmentDate) payload.shipment_date = shipmentDate;

    const notes = normalizeText(order?.notes);
    if (notes) payload.notes = notes;

    const salespersonName = normalizeText(order?.salesperson_name);
    if (salespersonName) payload.salesperson_name = salespersonName;

    if (zohoLocationId) {
        payload.location_id = zohoLocationId;
    }

    try {
        await zohoClient.updateSalesOrder(zohoSalesOrderId, payload);
    } catch (error: any) {
        const message = String(error?.message || '').toLowerCase();
        const customFieldRejected = message.includes('customfield')
            || message.includes('item_custom_fields');
        if (!customFieldRejected) throw error;

        await zohoClient.updateSalesOrder(zohoSalesOrderId, {
            ...payload,
            line_items: buildZohoLineItems(false),
        });
    }

    if (normalizedStatus === 'confirmada') {
        await zohoClient.confirmSalesOrder(zohoSalesOrderId);
    }
}

async function restoreOrderItemsSnapshot(params: {
    supabase: any;
    orderId: string;
    previousItemsSnapshot: any[];
}) {
    const { supabase, orderId, previousItemsSnapshot } = params;
    await supabase.from('sales_order_items').delete().eq('order_id', orderId);
    if (previousItemsSnapshot.length > 0) {
        await insertSalesOrderItemsWithColumnFallback(
            supabase,
            previousItemsSnapshot.map((line: any) => {
                const restored = { ...line };
                delete restored.id;
                return restored;
            })
        );
    }
}

// GET /api/ventas/sales-orders/[id] — detail
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const withItemsRelation = await supabase
            .from('sales_orders')
            .select(`
                *,
                customer:customers(id, name, email, phone, ruc, address),
                warehouse:warehouses(id, code, name),
                items:sales_order_items(*, item:items(id, name, sku, zoho_item_id))
            `)
            .eq('id', params.id)
            .order('sort_order', { referencedTable: 'sales_order_items', ascending: true })
            .single();

        if (!withItemsRelation.error && withItemsRelation.data) {
            return NextResponse.json({ order: withItemsRelation.data });
        }

        if (!isMissingRelationshipBetween(withItemsRelation.error?.message || '', 'sales_order_items', 'items')) {
            return NextResponse.json(
                { error: withItemsRelation.error?.message || 'No se pudo cargar la orden de venta' },
                { status: withItemsRelation.error?.code === 'PGRST116' ? 404 : 500 }
            );
        }

        // Fallback when PostgREST schema cache does not know sales_order_items -> items relation.
        const orderFallbackRes = await supabase
            .from('sales_orders')
            .select(`
                *,
                customer:customers(id, name, email, phone, ruc, address),
                warehouse:warehouses(id, code, name),
                items:sales_order_items(*)
            `)
            .eq('id', params.id)
            .order('sort_order', { referencedTable: 'sales_order_items', ascending: true })
            .single();

        if (orderFallbackRes.error || !orderFallbackRes.data) {
            return NextResponse.json(
                { error: orderFallbackRes.error?.message || 'No se pudo cargar la orden de venta' },
                { status: orderFallbackRes.error?.code === 'PGRST116' ? 404 : 500 }
            );
        }

        const orderFallback = orderFallbackRes.data as any;
        const itemIds = Array.from(new Set(
            (Array.isArray(orderFallback.items) ? orderFallback.items : [])
                .map((line: any) => String(line?.item_id || '').trim())
                .filter(Boolean)
        ));

        let itemMap = new Map<string, any>();
        if (itemIds.length > 0) {
            const itemLookup = await supabase
                .from('items')
                .select('id, name, sku, zoho_item_id')
                .in('id', itemIds);

            if (!itemLookup.error) {
                itemMap = new Map(
                    (itemLookup.data || []).map((row: any) => [String(row.id), row])
                );
            }
        }

        const mergedOrder = {
            ...orderFallback,
            items: (Array.isArray(orderFallback.items) ? orderFallback.items : []).map((line: any) => ({
                ...line,
                item: itemMap.get(String(line?.item_id || '').trim()) || null,
            })),
        };

        return NextResponse.json({ order: mergedOrder });
    } catch (error: any) {
        if (error instanceof FiscalValidationError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details || null },
                { status: error.status || 400 }
            );
        }
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}

// PUT /api/ventas/sales-orders/[id] — update status or full order
export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json();
        const expectedRowVersion = getExpectedRowVersion(req, body);

        // Status-only update (e.g., confirmar, cancelar)
        if (body?.status && Object.keys(body).length === 1) {
            const normalizedStatus = normalizeStatus(body.status, 'borrador');

            const { data: currentOrder, error: currentOrderError } = await supabase
                .from('sales_orders')
                .select('id, status, zoho_salesorder_id, row_version')
                .eq('id', params.id)
                .single();

            if (currentOrderError || !currentOrder) {
                return NextResponse.json({ error: currentOrderError?.message || 'Orden no encontrada' }, { status: 404 });
            }

            const currentRowVersion = getCurrentRowVersion(currentOrder);
            if (expectedRowVersion !== null && currentRowVersion !== null && expectedRowVersion !== currentRowVersion) {
                return buildVersionConflictResponse({
                    expectedRowVersion,
                    currentRowVersion,
                    resourceId: params.id,
                });
            }

            const zohoSalesOrderId = normalizeText((currentOrder as any)?.zoho_salesorder_id);
            if (zohoSalesOrderId && (normalizedStatus === 'confirmada' || normalizedStatus === 'cancelada')) {
                const zohoClient = createZohoBooksClient();
                if (!zohoClient) {
                    return NextResponse.json(
                        { error: 'No se pudo sincronizar estado en Zoho: configuración ZOHO_BOOKS_* incompleta.' },
                        { status: 500 }
                    );
                }

                try {
                    if (normalizedStatus === 'confirmada') {
                        await zohoClient.confirmSalesOrder(zohoSalesOrderId);
                    } else if (normalizedStatus === 'cancelada') {
                        await zohoClient.voidSalesOrder(zohoSalesOrderId);
                    }
                } catch (zohoError: any) {
                    return NextResponse.json(
                        { error: `No se pudo actualizar la OV en Zoho: ${zohoError?.message || 'Error desconocido'}` },
                        { status: 400 }
                    );
                }
            }

            if (normalizedStatus === 'cancelada') {
                try {
                    await releaseOrderSerialReservations({
                        supabase,
                        orderId: params.id,
                        reason: 'order_cancelled',
                    });
                } catch (reservationError: any) {
                    if (reservationError instanceof SerialReservationError) {
                        return NextResponse.json(
                            {
                                error: reservationError.message,
                                code: reservationError.code,
                                details: reservationError.details || null,
                            },
                            { status: reservationError.status || 409 }
                        );
                    }
                    return NextResponse.json(
                        { error: reservationError?.message || 'No se pudieron liberar reservas de seriales.' },
                        { status: 500 }
                    );
                }
            }

            let statusUpdateQuery = supabase
                .from('sales_orders')
                .update({ status: normalizedStatus, updated_at: new Date().toISOString() })
                .eq('id', params.id);

            if (expectedRowVersion !== null && currentRowVersion !== null) {
                statusUpdateQuery = statusUpdateQuery.eq('row_version', expectedRowVersion);
            }

            const { data, error } = await statusUpdateQuery.select().maybeSingle();

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            if (!data) {
                return buildVersionConflictResponse({
                    expectedRowVersion: expectedRowVersion ?? -1,
                    currentRowVersion,
                    resourceId: params.id,
                });
            }

            return NextResponse.json({ order: data });
        }

        const {
            customer_id,
            warehouse_id,
            date,
            expected_delivery_date,
            reference_number,
            payment_terms,
            delivery_method,
            shipping_zone,
            status,
            discount_amount,
            notes,
            salesperson_id,
            salesperson_name,
            items,
        } = body || {};

        const { data: currentOrder, error: currentError } = await supabase
            .from('sales_orders')
            .select('*')
            .eq('id', params.id)
            .single();

        if (currentError || !currentOrder) {
            return NextResponse.json({ error: currentError?.message || 'Orden no encontrada' }, { status: 404 });
        }

        const currentRowVersion = getCurrentRowVersion(currentOrder);
        if (expectedRowVersion !== null && currentRowVersion !== null && expectedRowVersion !== currentRowVersion) {
            return buildVersionConflictResponse({
                expectedRowVersion,
                currentRowVersion,
                resourceId: params.id,
            });
        }

        if (currentOrder.status === 'convertida') {
            return NextResponse.json({ error: 'No se puede editar una orden convertida' }, { status: 400 });
        }

        const normalizedDiscountAmount = Math.max(0, normalizeNumber(discount_amount, 0));
        if (discount_amount !== undefined && normalizedDiscountAmount > 0) {
            return NextResponse.json(
                { error: 'El descuento global está deshabilitado en este flujo.', code: 'GLOBAL_DISCOUNT_DISABLED' },
                { status: 400 }
            );
        }

        const previousOrderSnapshot = { ...(currentOrder as any) };

        const updateData: any = {
            updated_at: new Date().toISOString(),
        };

        if (customer_id !== undefined) updateData.customer_id = customer_id || null;
        if (warehouse_id !== undefined) updateData.warehouse_id = warehouse_id || null;
        if (date !== undefined) updateData.date = date;
        if (expected_delivery_date !== undefined) updateData.expected_delivery_date = expected_delivery_date || null;
        if (reference_number !== undefined) updateData.reference_number = normalizeText(reference_number) || null;
        if (payment_terms !== undefined) updateData.payment_terms = normalizeText(payment_terms) || null;
        if (delivery_method !== undefined) updateData.delivery_method = normalizeText(delivery_method) || null;
        if (shipping_zone !== undefined) updateData.shipping_zone = normalizeText(shipping_zone) || null;
        if (status !== undefined) updateData.status = normalizeStatus(status, 'borrador');
        if (discount_amount !== undefined) updateData.discount_amount = 0;
        if (notes !== undefined) updateData.notes = notes || null;
        if (salesperson_id !== undefined) updateData.salesperson_id = normalizeText(salesperson_id) || null;
        if (salesperson_name !== undefined) updateData.salesperson_name = salesperson_name || null;

        const previousItemsResult = await supabase
            .from('sales_order_items')
            .select('*')
            .eq('order_id', params.id)
            .order('sort_order', { ascending: true });

        if (previousItemsResult.error) {
            return NextResponse.json(
                { error: `No se pudieron cargar líneas actuales para actualizar OV: ${previousItemsResult.error.message}` },
                { status: 500 }
            );
        }
        const previousItemsSnapshot = Array.isArray(previousItemsResult.data)
            ? previousItemsResult.data.map((line: any) => ({ ...line }))
            : [];

        if (Array.isArray(items) && items.length > 0) {
            const taxCatalog = await getZohoTaxCatalog();
            const taxCatalogMap = buildTaxCatalogMap(
                (taxCatalog || []).filter((tax) => tax.active && tax.is_editable)
            );

            const normalizedItems = items.map((item: any, index: number) => normalizeFiscalLine({
                line: {
                    item_id: item?.item_id || null,
                    description: item?.description || item?.name || 'Artículo',
                    quantity: normalizeNumber(item?.quantity, NaN),
                    unit_price: Math.max(0, normalizeNumber(item?.unit_price, 0)),
                    discount_percent: Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0))),
                    tax_id: item?.tax_id || null,
                    tax_name: item?.tax_name || null,
                    tax_percentage: item?.tax_percentage,
                    warranty: item?.warranty ?? null,
                },
                taxCatalogMap,
                lineIndex: index,
            }));

            const totals = computeFiscalTotals(normalizedItems, 0);
            updateData.subtotal = totals.subtotal;
            updateData.tax_rate = totals.tax_rate;
            updateData.tax_amount = totals.tax_amount;
            updateData.total = totals.total;
            updateData.discount_amount = 0;

            const deleteItemsResult = await supabase
                .from('sales_order_items')
                .delete()
                .eq('order_id', params.id);

            if (deleteItemsResult.error) {
                return NextResponse.json(
                    { error: `No se pudieron reemplazar líneas de la orden: ${deleteItemsResult.error.message}` },
                    { status: 500 }
                );
            }

            const orderItems = normalizedItems.map((item: any, index: number) => {
                return {
                    order_id: params.id,
                    item_id: item?.item_id || null,
                    description: String(item?.description || item?.name || 'Artículo').trim(),
                    quantity: Math.max(0, normalizeNumber(item?.quantity, 0)),
                    unit_price: Math.max(0, normalizeNumber(item?.unit_price, 0)),
                    discount_percent: Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0))),
                    tax_id: normalizeText(item?.tax_id) || null,
                    tax_name: normalizeText(item?.tax_name) || null,
                    tax_percentage: Math.max(0, normalizeNumber(item?.tax_percentage, 0)),
                    warranty: normalizeWarranty(item?.warranty),
                    serial_number_value: normalizeSerialInput(
                        items[index]?.serial_number_value ?? items[index]?.serial_numbers ?? items[index]?.serials
                    ) || null,
                    line_warehouse_id: normalizeText(items[index]?.line_warehouse_id) || null,
                    line_zoho_warehouse_id: normalizeText(items[index]?.line_zoho_warehouse_id) || null,
                    subtotal: Math.round(Math.max(0, normalizeNumber(item?.line_taxable, item?.subtotal || 0)) * 100) / 100,
                    sort_order: index,
                };
            });

            const { error: itemsError } = await insertSalesOrderItemsWithColumnFallback(supabase, orderItems);

            if (itemsError) {
                await restoreOrderItemsSnapshot({
                    supabase,
                    orderId: params.id,
                    previousItemsSnapshot,
                });
                return NextResponse.json({ error: itemsError.message }, { status: 500 });
            }

            try {
                await replaceOrderSerialReservations({
                    supabase,
                    orderId: params.id,
                    userId: user.id || null,
                    items: orderItems,
                });
            } catch (reservationError: any) {
                await restoreOrderItemsSnapshot({
                    supabase,
                    orderId: params.id,
                    previousItemsSnapshot,
                });

                try {
                    await replaceOrderSerialReservations({
                        supabase,
                        orderId: params.id,
                        userId: user.id || null,
                        items: previousItemsSnapshot,
                    });
                } catch (restoreReservationError: any) {
                    return NextResponse.json(
                        {
                            error: `Falló la reserva de seriales y no se pudieron restaurar reservas previas: ${restoreReservationError?.message || 'Error desconocido'}`,
                        },
                        { status: 500 }
                    );
                }

                if (reservationError instanceof SerialReservationError) {
                    return NextResponse.json(
                        {
                            error: reservationError.message,
                            code: reservationError.code,
                            details: reservationError.details || null,
                        },
                        { status: reservationError.status || 409 }
                    );
                }

                return NextResponse.json(
                    { error: reservationError?.message || 'No se pudieron reservar seriales para la orden.' },
                    { status: 500 }
                );
            }
        }

        let data: any = null;
        let error: any = null;
        let columnRetry = 0;
        while (columnRetry < 12) {
            let updateQuery = supabase
                .from('sales_orders')
                .update(updateData)
                .eq('id', params.id);

            if (expectedRowVersion !== null && currentRowVersion !== null) {
                updateQuery = updateQuery.eq('row_version', expectedRowVersion);
            }

            const result = await updateQuery
                .select(`
                    *,
                    customer:customers(id, name, email, phone, ruc, address),
                    warehouse:warehouses(id, code, name)
                `)
                .maybeSingle();
            data = result.data;
            error = result.error;
            if (!error || data) break;

            const missingColumn = extractMissingColumn(error?.message || '');
            if (missingColumn && Object.prototype.hasOwnProperty.call(updateData, missingColumn)) {
                delete (updateData as any)[missingColumn];
                columnRetry += 1;
                continue;
            }
            break;
        }

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!data) {
            return buildVersionConflictResponse({
                expectedRowVersion: expectedRowVersion ?? -1,
                currentRowVersion,
                resourceId: params.id,
            });
        }

        const existingZohoSalesOrderId = normalizeText(previousOrderSnapshot.zoho_salesorder_id);
        if (existingZohoSalesOrderId) {
            try {
                await syncUpdatedSalesOrderToZoho({
                    supabase,
                    orderId: params.id,
                });
            } catch (zohoSyncError: any) {
                const rollbackOrderPayload: any = {
                    customer_id: previousOrderSnapshot.customer_id || null,
                    warehouse_id: previousOrderSnapshot.warehouse_id || null,
                    date: previousOrderSnapshot.date || null,
                    expected_delivery_date: previousOrderSnapshot.expected_delivery_date || null,
                    reference_number: previousOrderSnapshot.reference_number || null,
                    payment_terms: previousOrderSnapshot.payment_terms || null,
                    delivery_method: previousOrderSnapshot.delivery_method || null,
                    shipping_zone: previousOrderSnapshot.shipping_zone || null,
                    status: normalizeStatus(previousOrderSnapshot.status, 'borrador'),
                    subtotal: normalizeNumber(previousOrderSnapshot.subtotal, 0),
                    tax_rate: Math.max(0, normalizeNumber(previousOrderSnapshot.tax_rate, 0)),
                    tax_amount: normalizeNumber(previousOrderSnapshot.tax_amount, 0),
                    discount_amount: Math.max(0, normalizeNumber(previousOrderSnapshot.discount_amount, 0)),
                    total: normalizeNumber(previousOrderSnapshot.total, 0),
                    notes: previousOrderSnapshot.notes || null,
                    salesperson_id: previousOrderSnapshot.salesperson_id || null,
                    salesperson_name: previousOrderSnapshot.salesperson_name || null,
                    source: previousOrderSnapshot.source || null,
                    updated_at: new Date().toISOString(),
                };

                let rollbackRetry = 0;
                while (rollbackRetry < 12) {
                    const rollbackResult = await supabase
                        .from('sales_orders')
                        .update(rollbackOrderPayload)
                        .eq('id', params.id);

                    if (!rollbackResult.error) break;

                    const missingColumn = extractMissingColumn(rollbackResult.error?.message || '');
                    if (missingColumn && Object.prototype.hasOwnProperty.call(rollbackOrderPayload, missingColumn)) {
                        delete rollbackOrderPayload[missingColumn];
                        rollbackRetry += 1;
                        continue;
                    }
                    break;
                }

                await restoreOrderItemsSnapshot({
                    supabase,
                    orderId: params.id,
                    previousItemsSnapshot,
                });

                try {
                    await replaceOrderSerialReservations({
                        supabase,
                        orderId: params.id,
                        userId: user.id || null,
                        items: previousItemsSnapshot,
                    });
                } catch {
                    // Si no se pudo restaurar la reserva, igual devolvemos error principal de Zoho.
                }

                return NextResponse.json(
                    {
                        error: `Zoho rechazó la actualización de la OV: ${zohoSyncError?.message || 'Error desconocido'}. Se revirtió el cambio local.`,
                    },
                    { status: 400 }
                );
            }
        }

        if (normalizeText(data?.status) === 'cancelada') {
            try {
                await releaseOrderSerialReservations({
                    supabase,
                    orderId: params.id,
                    reason: 'order_cancelled',
                });
            } catch (reservationError: any) {
                if (reservationError instanceof SerialReservationError) {
                    return NextResponse.json(
                        {
                            error: reservationError.message,
                            code: reservationError.code,
                            details: reservationError.details || null,
                        },
                        { status: reservationError.status || 409 }
                    );
                }
                return NextResponse.json(
                    { error: reservationError?.message || 'No se pudieron liberar reservas de seriales.' },
                    { status: 500 }
                );
            }
        }

        return NextResponse.json({ order: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}

// DELETE /api/ventas/sales-orders/[id]
export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { data: order, error: orderError } = await supabase
            .from('sales_orders')
            .select('id, status, converted_invoice_id')
            .eq('id', params.id)
            .single();

        if (orderError || !order) {
            return NextResponse.json({ error: orderError?.message || 'Orden no encontrada' }, { status: 404 });
        }

        if (order.status === 'convertida' || order.converted_invoice_id) {
            return NextResponse.json(
                { error: 'No se puede eliminar una orden convertida a factura' },
                { status: 400 }
            );
        }

        try {
            await releaseOrderSerialReservations({
                supabase,
                orderId: params.id,
                reason: 'order_deleted',
            });
        } catch (reservationError: any) {
            if (reservationError instanceof SerialReservationError) {
                return NextResponse.json(
                    {
                        error: reservationError.message,
                        code: reservationError.code,
                        details: reservationError.details || null,
                    },
                    { status: reservationError.status || 409 }
                );
            }
            return NextResponse.json(
                { error: reservationError?.message || 'No se pudieron liberar reservas de seriales.' },
                { status: 500 }
            );
        }

        const { error } = await supabase
            .from('sales_orders')
            .delete()
            .eq('id', params.id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}
