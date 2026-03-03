import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const ORDER_STATUSES = new Set(['borrador', 'confirmada', 'convertida', 'cancelada']);

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStatus(value: unknown, fallback = 'borrador'): string {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return ORDER_STATUSES.has(text) ? text : fallback;
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

        const { data: order, error } = await supabase
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

        if (error) {
            return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 });
        }

        return NextResponse.json({ order });
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
            status,
            tax_rate,
            discount_amount,
            notes,
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
        if (status !== undefined) updateData.status = normalizeStatus(status, 'borrador');
        if (tax_rate !== undefined) updateData.tax_rate = Math.max(0, normalizeNumber(tax_rate, 15));
        if (discount_amount !== undefined) updateData.discount_amount = Math.max(0, normalizeNumber(discount_amount, 0));
        if (notes !== undefined) updateData.notes = notes || null;
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
                    subtotal: Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100,
                    sort_order: index,
                };
            });

            const { error: itemsError } = await supabase
                .from('sales_order_items')
                .insert(orderItems);

            if (itemsError) {
                return NextResponse.json({ error: itemsError.message }, { status: 500 });
            }
        }

        const { data, error } = await supabase
            .from('sales_orders')
            .update(updateData)
            .eq('id', params.id)
            .select(`
                *,
                customer:customers(id, name, email, phone, ruc, address),
                warehouse:warehouses(id, code, name)
            `)
            .single();

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
