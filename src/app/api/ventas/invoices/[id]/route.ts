import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// GET /api/ventas/invoices/[id] — Get invoice detail with items + customer
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createServerClient();
        const { id } = params;

        const { data: invoice, error } = await supabase
            .from('sales_invoices')
            .select(`
        *,
        customer:customers(id, name, email, phone, ruc, address),
        items:sales_invoice_items(*)
      `)
            .eq('id', id)
            .order('sort_order', { referencedTable: 'sales_invoice_items', ascending: true })
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 });
        }

        return NextResponse.json({ invoice });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT /api/ventas/invoices/[id] — Update invoice (status, data, or full edit)
export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createServerClient();
        const { id } = params;
        const body = await req.json();

        // If only changing status
        if (body.status && Object.keys(body).length === 1) {
            const { data, error } = await supabase
                .from('sales_invoices')
                .update({ status: body.status, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            return NextResponse.json({ invoice: data });
        }

        // Full update
        const {
            customer_id,
            date,
            due_date,
            status,
            tax_rate,
            discount_amount,
            payment_method,
            notes,
            items,
        } = body;

        const updateData: any = { updated_at: new Date().toISOString() };
        if (customer_id !== undefined) updateData.customer_id = customer_id || null;
        if (date !== undefined) updateData.date = date;
        if (due_date !== undefined) updateData.due_date = due_date || null;
        if (status !== undefined) updateData.status = status;
        if (tax_rate !== undefined) updateData.tax_rate = tax_rate;
        if (discount_amount !== undefined) updateData.discount_amount = discount_amount;
        if (payment_method !== undefined) updateData.payment_method = payment_method || null;
        if (notes !== undefined) updateData.notes = notes || null;

        // Recalculate totals if items provided
        if (items && items.length > 0) {
            const subtotal = items.reduce((sum: number, item: any) => {
                return sum + (item.quantity || 1) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100);
            }, 0);
            const tr = tax_rate !== undefined ? tax_rate : 15;
            const tax_amount = subtotal * (tr / 100);
            const da = discount_amount !== undefined ? discount_amount : 0;
            const total = subtotal + tax_amount - da;

            updateData.subtotal = Math.round(subtotal * 100) / 100;
            updateData.tax_amount = Math.round(tax_amount * 100) / 100;
            updateData.total = Math.round(total * 100) / 100;

            // Replace line items
            await supabase.from('sales_invoice_items').delete().eq('invoice_id', id);

            const lineItems = items.map((item: any, index: number) => ({
                invoice_id: id,
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

            await supabase.from('sales_invoice_items').insert(lineItems);
        }

        const { data, error } = await supabase
            .from('sales_invoices')
            .update(updateData)
            .eq('id', id)
            .select(`
        *,
        customer:customers(id, name, email, phone, ruc, address)
      `)
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ invoice: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/ventas/invoices/[id] — Delete invoice (only drafts)
export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createServerClient();
        const { id } = params;

        // Verify it's a draft
        const { data: invoice } = await supabase
            .from('sales_invoices')
            .select('status')
            .eq('id', id)
            .single();

        if (!invoice) {
            return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        }

        if (invoice.status !== 'borrador') {
            return NextResponse.json(
                { error: 'Solo se pueden eliminar facturas en borrador' },
                { status: 400 }
            );
        }

        // Items deleted via CASCADE
        const { error } = await supabase
            .from('sales_invoices')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
