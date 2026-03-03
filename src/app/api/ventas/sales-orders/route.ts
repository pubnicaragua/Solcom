import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createZohoBooksClient } from '@/lib/zoho/books-client';

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

function normalizeStatus(value: unknown, fallback = 'borrador'): string {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return ORDER_STATUSES.has(text) ? text : fallback;
}

function isDuplicateKeyError(message: string): boolean {
    const text = String(message || '').toLowerCase();
    return text.includes('duplicate key') || text.includes('unique constraint');
}

function extractMissingColumn(message: string): string | null {
    const text = String(message || '');
    let match = text.match(/Could not find the '([^']+)' column/i);
    if (match?.[1]) return match[1];
    match = text.match(/column "?([a-zA-Z0-9_]+)"? does not exist/i);
    if (match?.[1]) return match[1];
    return null;
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

function calculateTotals(items: any[], taxRate: number, discountAmount: number) {
    const subtotal = items.reduce((sum: number, item: any) => {
        const quantity = Math.max(0, normalizeNumber(item?.quantity, 0));
        const unitPrice = Math.max(0, normalizeNumber(item?.unit_price, 0));
        const discountPercent = Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0)));
        const lineSubtotal = quantity * unitPrice * (1 - discountPercent / 100);
        return sum + lineSubtotal;
    }, 0);

    const taxAmount = subtotal * (Math.max(0, taxRate) / 100);
    const total = subtotal + taxAmount - Math.max(0, discountAmount);

    return {
        subtotal: Math.round(subtotal * 100) / 100,
        tax_amount: Math.round(taxAmount * 100) / 100,
        total: Math.round(total * 100) / 100,
    };
}

async function generateOrderNumber(supabase: any, warehouseCode?: string): Promise<string> {
    if (warehouseCode) {
        const prefix = `OV-${warehouseCode}-`;
        const { data: latest } = await supabase
            .from('sales_orders')
            .select('order_number')
            .ilike('order_number', `${prefix}%`)
            .order('order_number', { ascending: false })
            .limit(1)
            .single();

        let nextNum = 1;
        if (latest?.order_number) {
            const match = latest.order_number.match(/(\d+)$/);
            if (match) nextNum = parseInt(match[1], 10) + 1;
        }

        return `${prefix}${String(nextNum).padStart(5, '0')}`;
    }

    const { data, error } = await supabase.rpc('generate_sales_order_number');
    if (!error && data) {
        return String(data);
    }

    const year = new Date().getFullYear();
    const prefix = `OV-${year}-`;

    const { data: latest } = await supabase
        .from('sales_orders')
        .select('order_number')
        .ilike('order_number', `${prefix}%`)
        .order('order_number', { ascending: false })
        .limit(1)
        .single();

    let nextNum = 1;
    if (latest?.order_number) {
        const match = latest.order_number.match(/(\d+)$/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
    }

    return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

async function syncSalesOrderToZoho(params: {
    supabase: any;
    orderId: string;
    orderNumber: string;
    customerId: string;
    warehouseId: string;
    date: string;
    expectedDeliveryDate: string | null;
    discountAmount: number;
    notes: string | null;
    salespersonName: string | null;
    items: any[];
}): Promise<{ zoho_salesorder_id: string; zoho_salesorder_number: string }> {
    const { supabase, orderId, orderNumber, customerId, warehouseId, date, expectedDeliveryDate, discountAmount, notes, salespersonName, items } = params;

    const zohoClient = createZohoBooksClient();
    if (!zohoClient) {
        throw new Error('Configuración de Zoho Books incompleta. Verifica las variables de entorno ZOHO_BOOKS_*.');
    }

    // Resolve zoho_contact_id
    const customerLookup = await supabase
        .from('customers')
        .select('id, name, zoho_contact_id')
        .eq('id', customerId)
        .single();

    if (customerLookup.error) {
        throw new Error(`No se pudo leer cliente para Zoho: ${customerLookup.error.message}`);
    }

    const zohoCustomerId = String(customerLookup.data?.zoho_contact_id || '').trim();
    const customerName = String(customerLookup.data?.name || 'cliente').trim();

    if (!zohoCustomerId) {
        throw new Error(`El cliente "${customerName}" no está vinculado con Zoho. Sincroniza clientes primero.`);
    }

    // Resolve zoho_warehouse_id
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

        const zohoWarehouseId = String(warehouseLookup.data?.zoho_warehouse_id || '').trim();
        if (zohoWarehouseId) {
            zohoLocationId = zohoWarehouseId;
        }
    }

    // Resolve zoho_item_id for each item
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

    // Build Zoho line items
    const zohoLineItems = (items || []).map((line: any, index: number) => {
        const localItemId = String(line?.item_id || '').trim();
        if (!localItemId) {
            throw new Error(`La línea ${index + 1} no está vinculada a un producto del catálogo.`);
        }

        const mapped = mappedItems.get(localItemId);
        if (!mapped) {
            throw new Error(`No se encontró el artículo local ${localItemId} para enviar a Zoho.`);
        }

        const zohoItemId = String(mapped.zoho_item_id || '').trim();
        if (!zohoItemId) {
            throw new Error(`El artículo "${mapped.name}" (${mapped.sku || localItemId}) no tiene zoho_item_id.`);
        }

        const quantity = Math.max(0.01, normalizeNumber(line?.quantity, 1));
        const unitPrice = normalizeNumber(line?.unit_price, 0);
        const discountPercent = Math.max(0, Math.min(100, normalizeNumber(line?.discount_percent, 0)));
        const effectiveRate = Math.max(0, unitPrice * (1 - discountPercent / 100));

        return {
            item_id: zohoItemId,
            quantity,
            rate: Number(effectiveRate.toFixed(6)),
        };
    });

    if (zohoLineItems.length === 0) {
        throw new Error('No hay líneas válidas para enviar a Zoho.');
    }

    // Build sales order payload
    const orderPayload: any = {
        customer_id: zohoCustomerId,
        date,
        line_items: zohoLineItems,
        reference_number: orderNumber,
    };

    if (expectedDeliveryDate) orderPayload.shipment_date = expectedDeliveryDate;
    if (notes && notes.trim()) orderPayload.notes = notes.trim();
    if (salespersonName && salespersonName.trim()) orderPayload.salesperson_name = salespersonName.trim();
    if (discountAmount > 0) {
        orderPayload.discount = Number(discountAmount.toFixed(2));
        orderPayload.is_discount_before_tax = true;
    }
    if (zohoLocationId) orderPayload.location_id = zohoLocationId;

    // Create sales order in Zoho
    const result = await zohoClient.createSalesOrder(orderPayload);

    // Save Zoho metadata back to local order
    if (result.salesorder_id || result.salesorder_number) {
        await supabase
            .from('sales_orders')
            .update({
                zoho_salesorder_id: result.salesorder_id || null,
                zoho_salesorder_number: result.salesorder_number || null,
                zoho_synced_at: new Date().toISOString(),
            })
            .eq('id', orderId);
    }

    return {
        zoho_salesorder_id: result.salesorder_id,
        zoho_salesorder_number: result.salesorder_number,
    };
}

// GET /api/ventas/sales-orders — list orders
export async function GET(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status') || '';
        const search = searchParams.get('search') || '';
        const fromDate = searchParams.get('from_date') || '';
        const toDate = searchParams.get('to_date') || '';
        const customerId = searchParams.get('customer_id') || '';
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const perPage = Math.max(1, Math.min(200, parseInt(searchParams.get('per_page') || '20', 10)));

        let query = supabase
            .from('sales_orders')
            .select(
                `
                *,
                customer:customers(id, name, email, phone, ruc),
                warehouse:warehouses(id, code, name)
            `,
                { count: 'exact' }
            )
            .order('created_at', { ascending: false });

        if (status && status !== 'todas') {
            query = query.eq('status', normalizeStatus(status, 'borrador'));
        }

        if (search.trim()) {
            const term = search.trim();
            query = query.or(`order_number.ilike.%${term}%,notes.ilike.%${term}%`);
        }

        if (fromDate) {
            query = query.gte('date', fromDate);
        }

        if (toDate) {
            query = query.lte('date', toDate);
        }

        if (customerId) {
            query = query.eq('customer_id', customerId);
        }

        const from = (page - 1) * perPage;
        const to = from + perPage - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            orders: data || [],
            total: count || 0,
            page,
            per_page: perPage,
            total_pages: Math.ceil((count || 0) / perPage),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}

// POST /api/ventas/sales-orders — create order with line items
export async function POST(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json();
        const {
            customer_id,
            warehouse_id,
            date,
            expected_delivery_date,
            reference_number,
            payment_terms,
            delivery_method,
            shipping_zone,
            status = 'borrador',
            tax_rate = 15,
            discount_amount = 0,
            notes,
            salesperson_id,
            salesperson_name,
            source,
            items = [],
            sync_to_zoho = false,
        } = body || {};

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'La orden de venta debe tener al menos un artículo' }, { status: 400 });
        }

        // Resolve warehouse code for order number format
        let warehouseCode: string | undefined;
        if (warehouse_id) {
            const { data: wh } = await supabase
                .from('warehouses')
                .select('code')
                .eq('id', warehouse_id)
                .maybeSingle();
            if (wh?.code) {
                warehouseCode = String(wh.code).trim().toUpperCase();
            }
        }

        const orderNumber = await generateOrderNumber(supabase, warehouseCode);

        const normalizedTaxRate = Math.max(0, normalizeNumber(tax_rate, 15));
        const normalizedDiscount = Math.max(0, normalizeNumber(discount_amount, 0));
        const totals = calculateTotals(items, normalizedTaxRate, normalizedDiscount);

        const insertOrder = {
            order_number: orderNumber,
            customer_id: customer_id || null,
            warehouse_id: warehouse_id || null,
            date: date || new Date().toISOString().slice(0, 10),
            expected_delivery_date: expected_delivery_date || null,
            reference_number: normalizeText(reference_number) || null,
            payment_terms: normalizeText(payment_terms) || null,
            delivery_method: normalizeText(delivery_method) || null,
            shipping_zone: normalizeText(shipping_zone) || null,
            status: normalizeStatus(status, 'borrador'),
            subtotal: totals.subtotal,
            tax_rate: normalizedTaxRate,
            tax_amount: totals.tax_amount,
            discount_amount: normalizedDiscount,
            total: totals.total,
            notes: notes || null,
            salesperson_id: normalizeText(salesperson_id) || null,
            salesperson_name: salesperson_name || null,
            source: source || null,
        };

        // Retry loop for duplicate order number conflicts
        let order: any = null;
        let lastError: any = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            if (attempt > 0) {
                const ts = Date.now().toString(36).toUpperCase();
                insertOrder.order_number = warehouseCode
                    ? `OV-${warehouseCode}-${ts}`
                    : `OV-${new Date().getFullYear()}-${ts}`;
            }
            let data: any = null;
            let insertErr: any = null;
            let columnRetry = 0;

            while (columnRetry < 12) {
                const result = await supabase
                    .from('sales_orders')
                    .insert(insertOrder)
                    .select()
                    .single();
                data = result.data;
                insertErr = result.error;

                if (!insertErr || data) break;

                const missingColumn = extractMissingColumn(insertErr?.message || '');
                if (missingColumn && Object.prototype.hasOwnProperty.call(insertOrder, missingColumn)) {
                    delete (insertOrder as any)[missingColumn];
                    columnRetry += 1;
                    continue;
                }
                break;
            }

            if (!insertErr && data) {
                order = data;
                break;
            }

            lastError = insertErr;
            if (!isDuplicateKeyError(insertErr?.message || '')) {
                break;
            }
        }

        if (!order) {
            return NextResponse.json({ error: lastError?.message || 'No se pudo crear la orden de venta' }, { status: 500 });
        }

        const orderItems = items.map((item: any, index: number) => {
            const quantity = Math.max(0, normalizeNumber(item?.quantity, 0));
            const unitPrice = Math.max(0, normalizeNumber(item?.unit_price, 0));
            const discountPercent = Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0)));
            return {
                order_id: order.id,
                item_id: item?.item_id || null,
                description: String(item?.description || item?.name || 'Artículo').trim(),
                quantity,
                unit_price: unitPrice,
                discount_percent: discountPercent,
                serial_number_value: normalizeSerialInput(
                    item?.serial_number_value ?? item?.serial_numbers ?? item?.serials
                ) || null,
                line_warehouse_id: normalizeText(item?.line_warehouse_id) || null,
                line_zoho_warehouse_id: normalizeText(item?.line_zoho_warehouse_id) || null,
                subtotal: Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100,
                sort_order: index,
            };
        });

        const { error: itemsError } = await insertSalesOrderItemsWithColumnFallback(supabase, orderItems);

        if (itemsError) {
            await supabase.from('sales_orders').delete().eq('id', order.id);
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        // Sync to Zoho if requested
        let zohoSync: { zoho_salesorder_id: string; zoho_salesorder_number: string } | null = null;
        let zohoWarning: string | null = null;
        if (sync_to_zoho) {
            try {
                zohoSync = await syncSalesOrderToZoho({
                    supabase,
                    orderId: order.id,
                    orderNumber: order.order_number,
                    customerId: customer_id,
                    warehouseId: warehouse_id,
                    date: date || new Date().toISOString().slice(0, 10),
                    expectedDeliveryDate: expected_delivery_date || null,
                    discountAmount: normalizedDiscount,
                    notes: notes || null,
                    salespersonName: salesperson_name || null,
                    items,
                });
            } catch (zohoError: any) {
                zohoWarning = zohoError?.message || 'No se pudo crear la orden de venta en Zoho';
                console.warn(`[sales-orders] OV local creada sin sincronizar en Zoho (${order.id}): ${zohoWarning}`);
            }
        }

        return NextResponse.json({ order, zoho: zohoSync, warning: zohoWarning }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}
