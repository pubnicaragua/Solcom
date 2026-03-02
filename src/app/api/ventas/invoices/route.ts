import { NextRequest, NextResponse } from 'next/server';


export const dynamic = 'force-dynamic';import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { deterministicUuidFromExternalId, normalizeSalespersonId } from '@/lib/identifiers';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import { fetchZohoSalespeople } from '@/lib/zoho/salespeople';

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

function parseErrorMessage(raw: string): string {
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.message === 'string' && parsed.message.trim()) return parsed.message.trim();
        if (typeof parsed?.error?.message === 'string' && parsed.error.message.trim()) return parsed.error.message.trim();
    } catch {
        // no-op
    }
    return raw.slice(0, 240).trim() || 'Error desconocido';
}

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTrimmed(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
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

async function createZohoInvoiceFromPayload(params: {
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
    discountAmount: number;
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
        discountAmount,
        items,
    } = params;

    if (!customerId) {
        throw new Error('No se puede enviar a Zoho sin cliente. Selecciona un cliente sincronizado.');
    }

    const organizationId = (process.env.ZOHO_BOOKS_ORGANIZATION_ID || '').trim();
    if (!organizationId) {
        throw new Error('Configuración incompleta: falta ZOHO_BOOKS_ORGANIZATION_ID.');
    }

    const auth: any = await getZohoAccessToken();
    if (!auth || auth.error || !auth.accessToken || !auth.apiDomain) {
        throw new Error(auth?.error || 'No se pudo autenticar con Zoho.');
    }

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
            const detailResponse = await fetch(
                `${auth.apiDomain}/books/v3/items/${encodeURIComponent(zohoItemId)}?organization_id=${encodeURIComponent(organizationId)}`,
                {
                    headers: { Authorization: `Zoho-oauthtoken ${auth.accessToken}` },
                    cache: 'no-store',
                }
            );
            if (!detailResponse.ok) continue;
            const detailRaw = await detailResponse.text();
            const detailData = detailRaw ? JSON.parse(detailRaw) : {};
            const detail = detailData?.item || null;
            zohoItemMetaById.set(zohoItemId, { serialTracked: isSerialTracked(detail) });
        } catch {
            // If metadata fetch fails, keep flow and let Zoho validate serials on create.
        }
    }

    const zohoLineItems = (items || []).map((line: any, index: number) => {
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
        const unitPrice = normalizeNumber(line?.unit_price, 0);
        const discountPercent = Math.max(0, Math.min(100, normalizeNumber(line?.discount_percent, 0)));
        const effectiveRate = Math.max(0, unitPrice * (1 - discountPercent / 100));
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
            rate: Number(effectiveRate.toFixed(6)),
        };

        if (serials.length > 0) {
            payloadLine.serial_number_value = normalizedSerials;
            payloadLine.serial_numbers = serials;
        }

        return payloadLine;
    });

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
    };
    if (resolvedDueDate) basePayload.due_date = resolvedDueDate;
    const normalizedReferenceNumber = (orderNumber && orderNumber.trim()) || (invoiceNumber && invoiceNumber.trim()) || '';
    if (normalizedReferenceNumber) basePayload.reference_number = normalizedReferenceNumber;
    if (notes && notes.trim()) basePayload.notes = notes.trim();
    if (discountAmount > 0) {
        basePayload.discount = Number(discountAmount.toFixed(2));
        basePayload.is_discount_before_tax = true;
    }
    if (shippingCharge > 0) basePayload.shipping_charge = Number(shippingCharge.toFixed(2));
    if (zohoLocationId) basePayload.location_id = zohoLocationId;

    const salespersonPayloadCandidates = [
        { salesperson_name: selectedZohoUserName, salesperson_id: selectedZohoSalespersonId || undefined },
        { salesperson_name: selectedZohoUserName },
        selectedZohoSalespersonId ? { salesperson_id: selectedZohoSalespersonId } : null,
        selectedZohoUserId ? { salesperson_name: selectedZohoUserName, salesperson_id: selectedZohoUserId } : null,
        selectedZohoUserId ? { salesperson_id: selectedZohoUserId } : null,
    ].filter(Boolean) as Array<Record<string, string>>;

    let parsed: any = null;
    let lastStatus = 0;
    let lastError = '';

    for (const salespersonVariant of salespersonPayloadCandidates) {
        const payload = { ...basePayload, ...salespersonVariant };
        const response = await fetch(
            `${auth.apiDomain}/books/v3/invoices?organization_id=${encodeURIComponent(organizationId)}`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Zoho-oauthtoken ${auth.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                cache: 'no-store',
            }
        );

        const raw = await response.text();
        lastStatus = response.status;
        const parsedErrorMessage = parseErrorMessage(raw);

        if (!response.ok) {
            lastError = parsedErrorMessage;
            if (response.status === 400 && isInvalidSalespersonMessage(parsedErrorMessage)) {
                continue;
            }
            throw new Error(`Zoho rechazó la factura: ${response.status} - ${parsedErrorMessage}`);
        }

        try {
            parsed = raw ? JSON.parse(raw) : {};
        } catch {
            throw new Error(`Zoho respondió JSON inválido al crear factura: ${raw.slice(0, 180)}`);
        }

        if (parsed?.code === 0) {
            break;
        }

        lastError = String(parsed?.message || 'Error desconocido');
        if (isInvalidSalespersonMessage(lastError)) {
            parsed = null;
            continue;
        }

        throw new Error(`Zoho devolvió error al crear factura: ${lastError}`);
    }

    if (!parsed || parsed?.code !== 0) {
        const sellerSample = sellers
            .slice(0, 6)
            .map((row) => `${row.name} [sp:${row.salespersonId || '-'}|usr:${row.userId || '-'}]`)
            .join(' ; ');

        throw new Error(
            `Zoho rechazó la factura: ${lastStatus || 400} - ${lastError || 'Introduzca un vendedor válido'}. ` +
            `Vendedor seleccionado: "${selectedZohoUserName}" [sp:${selectedZohoSalespersonId || '-'}|usr:${selectedZohoUserId || '-'}]. ` +
            `Disponibles (muestra): ${sellerSample || 'sin datos'}.`
        );
    }

    const zohoInvoice = parsed?.invoice || {};
    const zohoInvoiceId = String(zohoInvoice?.invoice_id || '').trim();
    const zohoInvoiceNumber = String(zohoInvoice?.invoice_number || '').trim();

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
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/ventas/invoices — Create a new invoice with line items
export async function POST(req: NextRequest) {
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
            tax_rate = 15,
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
        } = body;
        const normalizedSalespersonId = normalizeSalespersonId(salesperson_id);

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'La factura debe tener al menos un artículo' }, { status: 400 });
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
        const subtotal = items.reduce((sum: number, item: any) => {
            const lineSubtotal = item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100);
            return sum + lineSubtotal;
        }, 0);

        const tax_amount = subtotal * (tax_rate / 100);
        const total = subtotal + tax_amount + (shipping_charge || 0) - (discount_amount || 0);

        // Insert invoice with all fields
        const insertData: any = {
            invoice_number,
            customer_id: customer_id || null,
            date: date || new Date().toISOString().slice(0, 10),
            due_date: due_date || null,
            status,
            subtotal: Math.round(subtotal * 100) / 100,
            tax_rate,
            tax_amount: Math.round(tax_amount * 100) / 100,
            discount_amount: Math.round((discount_amount || 0) * 100) / 100,
            shipping_charge: Math.round((shipping_charge || 0) * 100) / 100,
            total: Math.round(total * 100) / 100,
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
        };

        const { data: invoice, error: invoiceError } = await supabase
            .from('sales_invoices')
            .insert(insertData)
            .select()
            .single();

        if (invoiceError) {
            return NextResponse.json({ error: invoiceError.message }, { status: 500 });
        }

        // Insert line items
        const lineItems = items.map((item: any, index: number) => ({
            invoice_id: invoice.id,
            item_id: item.item_id || null,
            description: item.description || item.name || 'Artículo',
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            discount_percent: item.discount_percent || 0,
            subtotal: Math.round(
                (item.quantity || 1) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100) * 100
            ) / 100,
            sort_order: index,
        }));

        const { error: itemsError } = await supabase
            .from('sales_invoice_items')
            .insert(lineItems);

        if (itemsError) {
            // Rollback: delete the invoice
            await supabase.from('sales_invoices').delete().eq('id', invoice.id);
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        let zohoSync: { zoho_invoice_id: string | null; zoho_invoice_number: string | null } | null = null;
        if (status === 'enviada') {
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
                    shippingCharge: normalizeNumber(shipping_charge, 0),
                    discountAmount: normalizeNumber(discount_amount, 0),
                    items,
                });
            } catch (zohoError: any) {
                await supabase.from('sales_invoices').delete().eq('id', invoice.id);
                return NextResponse.json({ error: zohoError?.message || 'No se pudo crear factura en Zoho' }, { status: 400 });
            }
        }

        return NextResponse.json({ invoice, zoho: zohoSync }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
