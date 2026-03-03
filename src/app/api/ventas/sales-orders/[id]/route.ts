import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

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

function calculateTotals(items: any[], taxRate: number, discountAmount: number) {
    const subtotal = items.reduce((sum: number, item: any) => {
        const quantity = Math.max(0, normalizeNumber(item?.quantity, 0));
        const unitPrice = Math.max(0, normalizeNumber(item?.unit_price, 0));
        const discountPercent = Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0)));
        return sum + quantity * unitPrice * (1 - discountPercent / 100);
    }, 0);

    const taxAmount = subtotal * (Math.max(0, taxRate) / 100);
    const total = subtotal + taxAmount - Math.max(0, discountAmount);

    return {
        subtotal: Math.round(subtotal * 100) / 100,
        tax_amount: Math.round(taxAmount * 100) / 100,
        total: Math.round(total * 100) / 100,
    };
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

        // Status-only update (e.g., confirmar, cancelar)
        if (body?.status && Object.keys(body).length === 1) {
            const normalizedStatus = normalizeStatus(body.status, 'borrador');
            const { data, error } = await supabase
                .from('sales_orders')
                .update({ status: normalizedStatus, updated_at: new Date().toISOString() })
                .eq('id', params.id)
                .select()
                .single();

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
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
            tax_rate,
            discount_amount,
            notes,
            salesperson_id,
            salesperson_name,
            items,
        } = body || {};

        const { data: currentOrder, error: currentError } = await supabase
            .from('sales_orders')
            .select('id, status, tax_rate, discount_amount')
            .eq('id', params.id)
            .single();

        if (currentError || !currentOrder) {
            return NextResponse.json({ error: currentError?.message || 'Orden no encontrada' }, { status: 404 });
        }

        if (currentOrder.status === 'convertida') {
            return NextResponse.json({ error: 'No se puede editar una orden convertida' }, { status: 400 });
        }

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
        if (tax_rate !== undefined) updateData.tax_rate = Math.max(0, normalizeNumber(tax_rate, 15));
        if (discount_amount !== undefined) updateData.discount_amount = Math.max(0, normalizeNumber(discount_amount, 0));
        if (notes !== undefined) updateData.notes = notes || null;
        if (salesperson_id !== undefined) updateData.salesperson_id = normalizeText(salesperson_id) || null;
        if (salesperson_name !== undefined) updateData.salesperson_name = salesperson_name || null;

        if (Array.isArray(items) && items.length > 0) {
            const taxRateForCalc = updateData.tax_rate !== undefined
                ? updateData.tax_rate
                : Math.max(0, normalizeNumber(currentOrder.tax_rate, 15));
            const discountForCalc = updateData.discount_amount !== undefined
                ? updateData.discount_amount
                : Math.max(0, normalizeNumber(currentOrder.discount_amount, 0));

            const totals = calculateTotals(items, taxRateForCalc, discountForCalc);
            updateData.subtotal = totals.subtotal;
            updateData.tax_amount = totals.tax_amount;
            updateData.total = totals.total;

            await supabase.from('sales_order_items').delete().eq('order_id', params.id);

            const orderItems = items.map((item: any, index: number) => {
                const quantity = Math.max(0, normalizeNumber(item?.quantity, 0));
                const unitPrice = Math.max(0, normalizeNumber(item?.unit_price, 0));
                const discountPercent = Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0)));
                return {
                    order_id: params.id,
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
                return NextResponse.json({ error: itemsError.message }, { status: 500 });
            }
        }

        let data: any = null;
        let error: any = null;
        let columnRetry = 0;
        while (columnRetry < 12) {
            const result = await supabase
                .from('sales_orders')
                .update(updateData)
                .eq('id', params.id)
                .select(`
                    *,
                    customer:customers(id, name, email, phone, ruc, address),
                    warehouse:warehouses(id, code, name)
                `)
                .single();
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
