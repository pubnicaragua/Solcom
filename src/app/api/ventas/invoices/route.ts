import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { deterministicUuidFromExternalId, normalizeSalespersonId } from '@/lib/identifiers';
import { buildTaxCatalogMap, getZohoTaxCatalog } from '@/lib/zoho/tax-catalog';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { fetchZohoSalespeople } from '@/lib/zoho/salespeople';
import {
    computeFiscalTotals,
    FiscalValidationError,
    normalizeFiscalLine,
    withWarrantyInDescription,
} from '@/lib/ventas/fiscal';
import { validateWarehouseFamilyStock } from '@/lib/ventas/stock-validation';
import {
    applyReservedSerialsToItems,
    assertSerialsReservedForOrder,
    buildReservationLines,
    consumeOrderSerialReservations,
    getActiveOrderSerialReservations,
    SerialReservationError,
} from '@/lib/ventas/serial-reservations';
import {
    beginIdempotentRequest,
    failIdempotentRequest,
    finalizeIdempotentRequest,
} from '@/lib/ventas/idempotency';
import {
    buildSyncStatusPayload,
    markDocumentSyncState,
    normalizeSyncErrorCodeFromError,
} from '@/lib/ventas/sync-state';
import { enqueueDocumentForSync } from '@/lib/ventas/sync-processor';

export const dynamic = 'force-dynamic';

const TERMS_DAYS_MAP: Record<string, number> = {
    '1_dia': 1,
    '7_dias': 7,
    '15_dias': 15,
    '30_dias': 30,
    '45_dias': 45,
    '60_dias': 60,
    '90_dias': 90,
    contado: 0,
};

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTrimmed(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeUuid(value: unknown): string | null {
    const text = normalizeTrimmed(value);
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

function equalsIgnoreCase(a: string, b: string): boolean {
    return a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
}

function computeDueDateFromTerms(date: string, terms: string | null | undefined): string | null {
    if (!date || !terms) return null;
    const days = TERMS_DAYS_MAP[terms];
    if (days === undefined) return null;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

function isInvalidSalespersonMessage(message: string): boolean {
    const text = String(message || '').toLowerCase();
    return (
        text.includes('vendedor') ||
        text.includes('salesperson') ||
        text.includes('introduzca un vendedor válido') ||
        text.includes('introduce a valid salesperson')
    );
}

function isNonRecoverableInvoiceSyncError(message: unknown, errorCode?: string | null): boolean {
    const normalizedCode = String(errorCode || '').trim().toUpperCase();
    if (normalizedCode === 'ZOHO_VALIDATION_ERROR') return true;

    const text = String(message || '').toLowerCase();
    if (!text) return false;

    return (
        text.includes('requiere') && text.includes('serial') ||
        text.includes('seriales inválidos') ||
        text.includes('serial invalido') ||
        text.includes('serial inválido') ||
        text.includes('invalid serial') ||
        text.includes('impuesto inválido') ||
        text.includes('invalid tax') ||
        text.includes('tax_id') && text.includes('invalid') ||
        text.includes('no está vinculado con zoho') ||
        text.includes('no tiene zoho_item_id') ||
        text.includes('no se puede enviar a zoho sin cliente') ||
        text.includes('vendedor') && text.includes('válido')
    );
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
    const text = normalizeTrimmed(value);
    return text || null;
}

function serialArray(serialNumberValue?: string): string[] {
    if (!serialNumberValue) return [];
    return serialNumberValue
        .split(',')
        .map((serial) => serial.trim())
        .filter(Boolean);
}

function serialCount(serialNumberValue?: string): number {
    return serialArray(serialNumberValue).length;
}

function isSerialTracked(detail: any): boolean {
    return Boolean(
        detail?.track_serial_number ??
        detail?.is_serial_number_tracking_enabled ??
        detail?.is_serial_number_enabled ??
        detail?.is_serial_number
    );
}

export async function createZohoInvoiceFromPayload(params: {
    supabase: any;
    invoiceId: string;
    invoiceNumber?: string | null;
    customerId: string | null;
    warehouseId: string | null | undefined;
    orderNumber: string | null | undefined;
    notes: string | null | undefined;
    date: string;
    dueDate: string | null | undefined;
    terms: string | null | undefined;
    salespersonLocalId: string | null | undefined;
    salespersonZohoId: string | null | undefined;
    salespersonName: string | null | undefined;
    shippingCharge: number;
    items: any[];
}) {
    const {
        supabase,
        invoiceId,
        invoiceNumber,
        customerId,
        warehouseId,
        orderNumber,
        notes,
        date,
        dueDate,
        terms,
        salespersonLocalId,
        salespersonZohoId,
        salespersonName,
        shippingCharge,
        items,
    } = params;

    if (!customerId) {
        throw new Error('No se puede enviar a Zoho sin cliente. Selecciona un cliente sincronizado.');
    }

    const organizationId = (process.env.ZOHO_BOOKS_ORGANIZATION_ID || '').trim();
    if (!organizationId) {
        throw new Error('Configuración incompleta: falta ZOHO_BOOKS_ORGANIZATION_ID.');
    }

    const zohoClient = createZohoBooksClient();
    if (!zohoClient) {
        throw new Error('Configuración incompleta: no se pudo inicializar cliente Zoho Books.');
    }
    const auth = await zohoClient.getAuthContext();

    const customerLookup = await (supabase as any)
        .from('customers')
        .select('id, name, zoho_contact_id')
        .eq('id', customerId)
        .single();

    if (customerLookup.error) {
        const text = String(customerLookup.error.message || '');
        if (text.includes('zoho_contact_id')) {
            throw new Error('Falta migración de clientes Zoho: columna zoho_contact_id no existe en customers.');
        }
        throw new Error(`No se pudo leer cliente para Zoho: ${text}`);
    }

    const zohoCustomerId = String((customerLookup.data as any)?.zoho_contact_id || '').trim();
    const customerName = String((customerLookup.data as any)?.name || 'cliente').trim();

    if (!zohoCustomerId) {
        throw new Error(`El cliente "${customerName}" no está vinculado con Zoho. Sincroniza clientes y vuelve a intentar.`);
    }

    const localItemIds = Array.from(
        new Set(
            (items || [])
                .map((line: any) => String(line?.item_id || '').trim())
                .filter(Boolean)
        )
    );

    const mappedItems = new Map<string, { name: string; sku: string; zoho_item_id: string | null }>();
    if (localItemIds.length > 0) {
        const itemLookup = await supabase
            .from('items')
            .select('id, name, sku, zoho_item_id')
            .in('id', localItemIds);

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

    const zohoItemMetaById = new Map<string, { serialTracked: boolean }>();
    const uniqueZohoItemIds = Array.from(
        new Set(
            Array.from(mappedItems.values())
                .map((row) => String(row.zoho_item_id || '').trim())
                .filter(Boolean)
        )
    );

    for (const zohoItemId of uniqueZohoItemIds) {
        try {
            const detailData = await zohoClient.request('GET', `/books/v3/items/${encodeURIComponent(zohoItemId)}`);
            const detail = detailData?.item || null;
            zohoItemMetaById.set(zohoItemId, { serialTracked: isSerialTracked(detail) });
        } catch {
            // If metadata fetch fails, keep flow and let Zoho validate serials on create.
        }
    }

    const warrantyCustomFieldId = normalizeTrimmed(process.env.ZOHO_BOOKS_WARRANTY_CUSTOMFIELD_ID);
    const buildZohoLineItems = (includeCustomFields: boolean) => (items || []).map((line: any, index: number) => {
        const localItemId = String(line?.item_id || '').trim();
        if (!localItemId) {
            throw new Error(`La línea ${index + 1} no está vinculada a un producto del catálogo; Zoho requiere item_id.`);
        }

        const mapped = mappedItems.get(localItemId);
        if (!mapped) {
            throw new Error(`No se encontró el artículo local ${localItemId} para enviar a Zoho.`);
        }

        const zohoItemId = String(mapped.zoho_item_id || '').trim();
        if (!zohoItemId) {
            throw new Error(`El artículo "${mapped.name}" (${mapped.sku || localItemId}) no tiene zoho_item_id. Ejecuta la sincronización de ítems.`);
        }

        const quantity = Math.max(0.01, normalizeNumber(line?.quantity, 1));
        const unitPrice = Math.max(0, normalizeNumber(line?.unit_price, 0));
        const discountPercent = Math.max(0, Math.min(100, normalizeNumber(line?.discount_percent, 0)));
        const taxId = normalizeTrimmed(line?.tax_id);
        const warranty = normalizeWarranty(line?.warranty);
        const normalizedSerials = normalizeSerialInput(
            line?.serial_number_value ?? line?.serial_numbers ?? line?.serials
        );
        const serials = serialArray(normalizedSerials);
        const meta = zohoItemMetaById.get(zohoItemId);
        const requiresSerials = Boolean(meta?.serialTracked || serials.length > 0);
        const expectedSerialCount = Math.round(quantity);

        if (requiresSerials && !Number.isInteger(quantity)) {
            throw new Error(`El artículo "${mapped.name}" usa seriales y requiere cantidad entera.`);
        }

        if (serials.length > 0 && serialCount(normalizedSerials) !== expectedSerialCount) {
            throw new Error(
                `Seriales inválidos para "${mapped.name}": cantidad ${expectedSerialCount}, seriales ${serials.length}.`
            );
        }

        if (meta?.serialTracked && serials.length !== expectedSerialCount) {
            throw new Error(
                `El artículo "${mapped.name}" requiere ${expectedSerialCount} serial(es). Selecciona los seriales antes de enviar.`
            );
        }

        const payloadLine: any = {
            item_id: zohoItemId,
            quantity,
            rate: Number(unitPrice.toFixed(6)),
            description: withWarrantyInDescription(normalizeTrimmed(line?.description || mapped.name), warranty),
        };

        if (taxId) {
            payloadLine.tax_id = taxId;
        }

        if (discountPercent > 0) {
            payloadLine.discount = `${Number(discountPercent.toFixed(2))}%`;
        }

        if (serials.length > 0) {
            payloadLine.serial_number_value = normalizedSerials;
            payloadLine.serial_numbers = serials;
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

    const zohoLineItems = buildZohoLineItems(true);
    if (zohoLineItems.length === 0) {
        throw new Error('No hay líneas válidas para enviar a Zoho.');
    }

    let zohoLocationId: string | undefined;
    if (warehouseId) {
        const warehouseLookup = await supabase
            .from('warehouses')
            .select('id, code, name, zoho_warehouse_id')
            .eq('id', warehouseId)
            .maybeSingle();

        if (warehouseLookup.error) {
            throw new Error(`No se pudo leer bodega para Zoho: ${warehouseLookup.error.message}`);
        }

        const zohoWarehouseId = String((warehouseLookup.data as any)?.zoho_warehouse_id || '').trim();
        if (zohoWarehouseId) {
            zohoLocationId = zohoWarehouseId;
        }
    }

    const resolvedDueDate = (dueDate || '').trim() || computeDueDateFromTerms(date, terms) || undefined;

    const sellers = await fetchZohoSalespeople(
        { accessToken: auth.accessToken, apiDomain: auth.apiDomain },
        organizationId
    );

    const requestedZohoId = normalizeTrimmed(salespersonZohoId);
    const requestedLocalId = normalizeTrimmed(salespersonLocalId);
    const requestedName = normalizeTrimmed(salespersonName);

    let selectedSeller = null as null | {
        salespersonId: string;
        userId: string;
        name: string;
    };

    if (requestedZohoId) {
        selectedSeller = sellers.find((row) =>
            row.salespersonId === requestedZohoId || row.userId === requestedZohoId
        ) || null;
    }

    if (!selectedSeller && requestedLocalId) {
        selectedSeller = sellers.find((row) => {
            const keys = [row.salespersonId, row.userId].filter(Boolean);
            return keys.some((key) => deterministicUuidFromExternalId('zoho_salesperson', key) === requestedLocalId);
        }) || null;
    }

    if (!selectedSeller && requestedName) {
        selectedSeller = sellers.find((row) => equalsIgnoreCase(normalizeTrimmed(row.name), requestedName)) || null;
    }

    if (!selectedSeller && requestedName) {
        const compactRequested = requestedName.toLowerCase();
        selectedSeller = sellers.find((row) => row.name.toLowerCase().includes(compactRequested)) || null;
    }

    if (!selectedSeller) {
        throw new Error('No se pudo mapear el vendedor seleccionado con un usuario activo de Zoho.');
    }

    const selectedZohoUserId = normalizeTrimmed(selectedSeller.userId);
    const selectedZohoSalespersonId = normalizeTrimmed(selectedSeller.salespersonId);
    const selectedZohoUserName = normalizeTrimmed(selectedSeller.name);
    if (!selectedZohoUserName) {
        throw new Error('Zoho devolvió un vendedor sin nombre válido.');
    }

    const basePayload: any = {
        customer_id: zohoCustomerId,
        date,
        line_items: zohoLineItems,
        discount_type: 'item_level',
        is_discount_before_tax: true,
    };
    if (resolvedDueDate) basePayload.due_date = resolvedDueDate;
    const normalizedReferenceNumber = (orderNumber && orderNumber.trim()) || (invoiceNumber && invoiceNumber.trim()) || '';
    if (normalizedReferenceNumber) basePayload.reference_number = normalizedReferenceNumber;
    if (notes && notes.trim()) basePayload.notes = notes.trim();
    if (shippingCharge > 0) basePayload.shipping_charge = Number(shippingCharge.toFixed(2));
    if (zohoLocationId) basePayload.location_id = zohoLocationId;

    const salespersonPayloadCandidates = [
        { salesperson_name: selectedZohoUserName, salesperson_id: selectedZohoSalespersonId || undefined },
        { salesperson_name: selectedZohoUserName },
        selectedZohoSalespersonId ? { salesperson_id: selectedZohoSalespersonId } : null,
        selectedZohoUserId ? { salesperson_name: selectedZohoUserName, salesperson_id: selectedZohoUserId } : null,
        selectedZohoUserId ? { salesperson_id: selectedZohoUserId } : null,
    ].filter(Boolean) as Array<Record<string, string>>;

    let createdInvoice: { invoice_id: string; invoice_number: string } | null = null;
    let lastError = '';

    for (const salespersonVariant of salespersonPayloadCandidates) {
        const payload = { ...basePayload, ...salespersonVariant };
        try {
            createdInvoice = await zohoClient.createInvoice(payload);
            break;
        } catch (error: any) {
            const errorMessage = String(error?.message || error || 'Error desconocido');
            lastError = errorMessage;
            const lowered = errorMessage.toLowerCase();
            const customFieldRejected = lowered.includes('customfield')
                || lowered.includes('item_custom_fields');

            if (customFieldRejected) {
                try {
                    const retryPayload = {
                        ...basePayload,
                        ...salespersonVariant,
                        line_items: buildZohoLineItems(false),
                    };
                    createdInvoice = await zohoClient.createInvoice(retryPayload);
                    break;
                } catch (retryError: any) {
                    const retryMessage = String(retryError?.message || retryError || 'Error desconocido');
                    lastError = retryMessage;
                    if (isInvalidSalespersonMessage(retryMessage)) {
                        continue;
                    }
                    throw new Error(`Zoho rechazó la factura: ${retryMessage}`);
                }
            }

            if (isInvalidSalespersonMessage(errorMessage)) {
                continue;
            }

            throw new Error(`Zoho rechazó la factura: ${errorMessage}`);
        }
    }

    if (!createdInvoice) {
        const sellerSample = sellers
            .slice(0, 6)
            .map((row) => `${row.name} [sp:${row.salespersonId || '-'}|usr:${row.userId || '-'}]`)
            .join(' ; ');

        throw new Error(
            `Zoho rechazó la factura: ${lastError || 'Introduzca un vendedor válido'}. ` +
            `Vendedor seleccionado: "${selectedZohoUserName}" [sp:${selectedZohoSalespersonId || '-'}|usr:${selectedZohoUserId || '-'}]. ` +
            `Disponibles (muestra): ${sellerSample || 'sin datos'}.`
        );
    }

    const zohoInvoiceId = String(createdInvoice?.invoice_id || '').trim();
    const zohoInvoiceNumber = String(createdInvoice?.invoice_number || '').trim();

    // Optional metadata update if migration columns exist.
    if (zohoInvoiceId || zohoInvoiceNumber) {
        const maybeUpdate = await (supabase as any)
            .from('sales_invoices')
            .update({
                zoho_invoice_id: zohoInvoiceId || null,
                zoho_invoice_number: zohoInvoiceNumber || null,
                zoho_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', invoiceId);

        if (maybeUpdate?.error) {
            const text = String(maybeUpdate.error.message || '').toLowerCase();
            const missingColumns =
                text.includes('zoho_invoice_id') ||
                text.includes('zoho_invoice_number') ||
                text.includes('zoho_synced_at');
            if (!missingColumns) {
                console.warn('[ventas/invoices] No se pudo guardar metadata Zoho:', maybeUpdate.error.message);
            }
        }
    }

    return {
        zoho_invoice_id: zohoInvoiceId || null,
        zoho_invoice_number: zohoInvoiceNumber || null,
    };
}

// GET /api/ventas/invoices — List invoices with filters
export async function GET(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }
        const { searchParams } = new URL(req.url);

        const status = searchParams.get('status') || '';
        const search = searchParams.get('search') || '';
        const from_date = searchParams.get('from_date') || '';
        const to_date = searchParams.get('to_date') || '';
        const customer_id = searchParams.get('customer_id') || '';
        const page = parseInt(searchParams.get('page') || '1');
        const per_page = parseInt(searchParams.get('per_page') || '20');

        let query = supabase
            .from('sales_invoices')
            .select(`
        *,
        customer:customers(id, name, email, phone, ruc)
      `, { count: 'exact' })
            .order('created_at', { ascending: false });

        if (status && status !== 'todas') {
            query = query.eq('status', status);
        }

        if (search) {
            query = query.or(`invoice_number.ilike.%${search}%`);
        }

        if (from_date) {
            query = query.gte('date', from_date);
        }

        if (to_date) {
            query = query.lte('date', to_date);
        }

        if (customer_id) {
            query = query.eq('customer_id', customer_id);
        }

        // Pagination
        const from = (page - 1) * per_page;
        const to = from + per_page - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            invoices: data || [],
            total: count || 0,
            page,
            per_page,
            total_pages: Math.ceil((count || 0) / per_page),
        });
    } catch (error: any) {
        if (error instanceof FiscalValidationError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details || null },
                { status: error.status || 400 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/ventas/invoices — Create a new invoice with line items
export async function POST(req: NextRequest) {
    let idempotencyRecordId = '';
    let externalRequestId = '';
    let idempotencyPayloadHash = '';
    let idempotencyKey = '';
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }
        const body = await req.json();

        const {
            customer_id,
            date,
            due_date,
            status = 'borrador',
            discount_amount = 0,
            shipping_charge = 0,
            payment_method,
            notes,
            items = [],
            // New fields v2
            warehouse_id,
            order_number,
            terms,
            salesperson_id,
            salesperson_zoho_id,
            salesperson_name,
            delivery_requested = false,
            delivery_id,
            credit_detail,
            cancellation_reason_id,
            cancellation_comments,
            source_sales_order_id,
        } = body;

        const idempotencyStart = await beginIdempotentRequest({
            supabase,
            req,
            endpoint: '/api/ventas/invoices',
            payload: body || {},
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

        const normalizedSalespersonId = normalizeSalespersonId(salesperson_id);
        const normalizedSourceSalesOrderId = normalizeUuid(source_sales_order_id);

        if (!items || items.length === 0) {
            return failWith({ error: 'La factura debe tener al menos un artículo' }, 400);
        }

        const normalizedDiscountAmount = Math.max(0, normalizeNumber(discount_amount, 0));
        const normalizedShippingCharge = Math.max(0, normalizeNumber(shipping_charge, 0));
        if (normalizedDiscountAmount > 0) {
            return failWith(
                { error: 'El descuento global está deshabilitado en este flujo.', code: 'GLOBAL_DISCOUNT_DISABLED' },
                400
            );
        }

        const taxCatalog = await getZohoTaxCatalog();
        const taxCatalogMap = buildTaxCatalogMap(
            (taxCatalog || []).filter((tax) => tax.active && tax.is_editable)
        );

        const normalizedItems = items.map((item: any, index: number) => ({
            ...normalizeFiscalLine({
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
            }),
            serial_number_value: normalizeSerialInput(
                item?.serial_number_value ?? item?.serial_numbers ?? item?.serials
            ) || null,
            price_profile_code: normalizeTrimmed(item?.price_profile_code) || null,
        }));
        let itemsForInvoice = normalizedItems;

        const invalidQuantityIndex = normalizedItems.findIndex(
            (item: any) => !Number.isFinite(item.quantity) || item.quantity <= 0
        );
        if (invalidQuantityIndex >= 0) {
            return failWith(
                { error: `Cantidad inválida en la línea ${invalidQuantityIndex + 1}.` },
                400
            );
        }

        const stockValidation = await validateWarehouseFamilyStock({
            supabase,
            warehouseId: warehouse_id,
            items: normalizedItems,
        });
        if (!stockValidation.ok) {
            return failWith({ error: stockValidation.error }, 400);
        }

        if (normalizedSourceSalesOrderId) {
            try {
                const activeReservations = await getActiveOrderSerialReservations({
                    supabase,
                    orderId: normalizedSourceSalesOrderId,
                });

                itemsForInvoice = applyReservedSerialsToItems({
                    items: normalizedItems,
                    reservations: activeReservations,
                });

                if (activeReservations.length > 0) {
                    const reservedKeySet = new Set(
                        activeReservations.map((reservation) =>
                            `${String(reservation.item_id)}::${String(reservation.serial_code)}`
                        )
                    );
                    const providedKeySet = new Set(
                        buildReservationLines(itemsForInvoice).map(
                            (line) => `${String(line.item_id)}::${String(line.serial_code)}`
                        )
                    );

                    const mismatch = reservedKeySet.size !== providedKeySet.size
                        || Array.from(reservedKeySet).some((key) => !providedKeySet.has(key));

                    if (mismatch) {
                        throw new SerialReservationError(
                            'Los seriales de la OV ya no coinciden con la reserva activa. Vuelve a seleccionar seriales.',
                            'SERIAL_NOT_RESERVED',
                            409
                        );
                    }
                }

                await assertSerialsReservedForOrder({
                    supabase,
                    orderId: normalizedSourceSalesOrderId,
                    items: itemsForInvoice,
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
                    { error: reservationError?.message || 'No se pudieron validar reservas de seriales.' },
                    500
                );
            }
        }

        // Generate invoice number
        const { data: numData, error: numError } = await supabase.rpc('generate_invoice_number');

        let invoice_number: string;
        if (numError || !numData) {
            const year = new Date().getFullYear();
            const { count } = await supabase
                .from('sales_invoices')
                .select('*', { count: 'exact', head: true });
            invoice_number = `FAC-${year}-${String((count || 0) + 1).padStart(5, '0')}`;
        } else {
            invoice_number = numData;
        }

        // Calculate totals (shipping included)
        const totals = computeFiscalTotals(itemsForInvoice as any, normalizedShippingCharge);

        // Insert invoice with all fields
        const insertData: any = {
            invoice_number,
            customer_id: customer_id || null,
            date: date || new Date().toISOString().slice(0, 10),
            due_date: due_date || null,
            status,
            subtotal: totals.subtotal,
            tax_rate: totals.tax_rate,
            tax_amount: totals.tax_amount,
            discount_amount: 0,
            shipping_charge: Math.round(normalizedShippingCharge * 100) / 100,
            total: totals.total,
            payment_method: payment_method || null,
            notes: notes || null,
            warehouse_id: warehouse_id || null,
            order_number: order_number || null,
            terms: terms || null,
            salesperson_id: normalizedSalespersonId,
            delivery_requested: !!delivery_requested,
            delivery_id: delivery_id || null,
            credit_detail: credit_detail || null,
            cancellation_reason_id: cancellation_reason_id || null,
            cancellation_comments: cancellation_comments || null,
            sync_status: String(status).toLowerCase() === 'enviada' ? 'pending_sync' : 'not_requested',
            sync_error_code: null,
            sync_error_message: null,
            last_sync_attempt_at: String(status).toLowerCase() === 'enviada' ? new Date().toISOString() : null,
            external_request_id: externalRequestId || null,
        };

        let invoice: any = null;
        let invoiceError: any = null;
        let invoiceInsertRetry = 0;
        while (invoiceInsertRetry < 12) {
            const result = await supabase
                .from('sales_invoices')
                .insert(insertData)
                .select()
                .single();
            invoice = result.data;
            invoiceError = result.error;

            if (!invoiceError || invoice) break;

            const missingColumn = extractMissingColumn(invoiceError?.message || '');
            if (missingColumn && Object.prototype.hasOwnProperty.call(insertData, missingColumn)) {
                delete insertData[missingColumn];
                invoiceInsertRetry += 1;
                continue;
            }
            break;
        }

        if (invoiceError) {
            return failWith({ error: invoiceError.message }, 500);
        }

        // Insert line items
        const lineItems = itemsForInvoice.map((item: any, index: number) => ({
            invoice_id: invoice.id,
            item_id: item.item_id || null,
            description: item.description || item.name || 'Artículo',
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            discount_percent: item.discount_percent || 0,
            tax_id: normalizeTrimmed(item.tax_id) || null,
            tax_name: normalizeTrimmed(item.tax_name) || null,
            tax_percentage: Math.max(0, normalizeNumber(item.tax_percentage, 0)),
            warranty: normalizeWarranty(item.warranty),
            serial_number_value: item.serial_number_value || null,
            price_profile_code: normalizeTrimmed(item.price_profile_code) || null,
            subtotal: Math.round(Math.max(0, normalizeNumber(item.line_taxable, item.subtotal || 0)) * 100) / 100,
            sort_order: index,
        }));

        const { error: itemsError } = await insertInvoiceItemsWithColumnFallback(supabase, lineItems);

        if (itemsError) {
            // Rollback: delete the invoice
            await supabase.from('sales_invoices').delete().eq('id', invoice.id);
            return failWith({ error: itemsError.message }, 500);
        }

        let zohoSync: { zoho_invoice_id: string | null; zoho_invoice_number: string | null } | null = null;
        let zohoWarning: string | null = null;
        let responseStatus = 201;
        const shouldSyncToZoho = String(status).toLowerCase() === 'enviada';
        let syncState = {
            sync_status: shouldSyncToZoho ? 'pending_sync' : 'not_requested',
            sync_error_code: null as string | null,
            sync_error_message: null as string | null,
            last_sync_attempt_at: shouldSyncToZoho ? new Date().toISOString() : null as string | null,
            last_synced_at: null as string | null,
        };

        if (shouldSyncToZoho) {
            try {
                zohoSync = await createZohoInvoiceFromPayload({
                    supabase,
                    invoiceId: invoice.id,
                    invoiceNumber: invoice_number,
                    customerId: customer_id || null,
                    warehouseId: warehouse_id || null,
                    orderNumber: order_number || null,
                    notes: notes || null,
                    date: date || new Date().toISOString().slice(0, 10),
                    dueDate: due_date || null,
                    terms: terms || null,
                    salespersonLocalId: normalizedSalespersonId,
                    salespersonZohoId: salesperson_zoho_id || null,
                    salespersonName: salesperson_name || null,
                    shippingCharge: normalizedShippingCharge,
                    items: itemsForInvoice,
                });

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
            } catch (zohoError: any) {
                zohoWarning = zohoError?.message || 'No se pudo crear factura en Zoho';
                const errorCode = normalizeSyncErrorCodeFromError(zohoError);
                const isNonRecoverable = isNonRecoverableInvoiceSyncError(zohoWarning, errorCode);

                if (isNonRecoverable) {
                    const nowIso = new Date().toISOString();
                    const draftRollback = await supabase
                        .from('sales_invoices')
                        .update({
                            status: 'borrador',
                            updated_at: nowIso,
                        })
                        .eq('id', invoice.id);

                    if (draftRollback.error) {
                        return failWith(
                            {
                                error: `Zoho rechazó la factura y no se pudo restaurar a borrador: ${draftRollback.error.message}`,
                            },
                            500
                        );
                    }

                    const syncUpdate = await markDocumentSyncState({
                        supabase,
                        documentType: 'sales_invoice',
                        documentId: invoice.id,
                        status: 'failed_sync',
                        errorCode,
                        errorMessage: zohoWarning,
                        externalRequestId: externalRequestId || null,
                        incrementAttempts: true,
                    });

                    const failedSyncState = !syncUpdate.error && syncUpdate.data
                        ? buildSyncStatusPayload(syncUpdate.data)
                        : {
                            sync_status: 'failed_sync' as const,
                            sync_error_code: errorCode,
                            sync_error_message: zohoWarning,
                            last_sync_attempt_at: nowIso,
                            last_synced_at: null as string | null,
                        };

                    return failWith(
                        {
                            error: zohoWarning,
                            code: 'SEND_VALIDATION_ERROR',
                            invoice: {
                                ...invoice,
                                status: 'borrador',
                                ...failedSyncState,
                                external_request_id: externalRequestId || invoice.external_request_id || null,
                            },
                            ...failedSyncState,
                            external_request_id: externalRequestId || invoice.external_request_id || null,
                        },
                        400
                    );
                }

                responseStatus = 202;

                const syncUpdate = await markDocumentSyncState({
                    supabase,
                    documentType: 'sales_invoice',
                    documentId: invoice.id,
                    status: 'pending_sync',
                    errorCode,
                    errorMessage: zohoWarning,
                    externalRequestId: externalRequestId || null,
                    incrementAttempts: true,
                });
                if (!syncUpdate.error && syncUpdate.data) {
                    syncState = buildSyncStatusPayload(syncUpdate.data);
                } else {
                    syncState = {
                        sync_status: 'pending_sync',
                        sync_error_code: errorCode,
                        sync_error_message: zohoWarning,
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
                    errorMessage: zohoWarning,
                    priority: 10,
                });
            }
        } else {
            await markDocumentSyncState({
                supabase,
                documentType: 'sales_invoice',
                documentId: invoice.id,
                status: 'not_requested',
                externalRequestId: externalRequestId || null,
                incrementAttempts: false,
            });
        }

        let salesOrderLinkWarning: string | null = null;
        let reservationWarning: string | null = null;
        if (normalizedSourceSalesOrderId && shouldSyncToZoho) {
            const orderUpdate = await supabase
                .from('sales_orders')
                .update({
                    status: 'convertida',
                    converted_invoice_id: invoice.id,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', normalizedSourceSalesOrderId);

            if (orderUpdate.error) {
                salesOrderLinkWarning = `Factura creada, pero no se pudo actualizar la OV origen: ${orderUpdate.error.message}`;
            } else {
                try {
                    await consumeOrderSerialReservations({
                        supabase,
                        orderId: normalizedSourceSalesOrderId,
                        invoiceId: invoice.id,
                    });
                } catch (consumeError: any) {
                    reservationWarning = `Factura creada, pero no se pudieron consumir reservas de seriales: ${consumeError?.message || 'Error desconocido'}`;
                }
            }
        }

        const finalWarning = [zohoWarning, salesOrderLinkWarning, reservationWarning].filter(Boolean).join(' | ') || null;
        const invoiceResponse = {
            ...invoice,
            ...syncState,
            external_request_id: externalRequestId || invoice.external_request_id || null,
        };

        const responseBody = {
            invoice: invoiceResponse,
            zoho: zohoSync,
            warning: finalWarning,
            code: responseStatus === 202 ? 'SYNC_PENDING' : undefined,
            ...syncState,
            external_request_id: invoiceResponse.external_request_id,
        };

        return succeedWith(responseBody, responseStatus, invoice.id);
    } catch (error: any) {
        if (idempotencyRecordId) {
            const errorBody = error instanceof FiscalValidationError
                ? { error: error.message, code: error.code, details: error.details || null }
                : { error: error.message || 'Error interno' };
            const errorStatus = error instanceof FiscalValidationError ? (error.status || 400) : 500;
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
        if (error instanceof FiscalValidationError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details || null },
                { status: error.status || 400 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
