import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// GET /api/ventas/invoices — List invoices with filters
export async function GET(req: NextRequest) {
    try {
        const supabase = createServerClient();
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
        const supabase = createServerClient();
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
            delivery_requested = false,
            delivery_id,
            credit_detail,
            cancellation_reason_id,
            cancellation_comments,
        } = body;

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
            salesperson_id: salesperson_id || null,
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

        return NextResponse.json({ invoice }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
