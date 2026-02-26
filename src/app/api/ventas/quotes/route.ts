import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const QUOTE_STATUSES = new Set(['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida', 'convertida']);

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStatus(value: unknown, fallback = 'borrador'): string {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return QUOTE_STATUSES.has(text) ? text : fallback;
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

async function generateQuoteNumber(supabase: any): Promise<string> {
    const { data, error } = await supabase.rpc('generate_quote_number');
    if (!error && data) {
        return String(data);
    }

    const year = new Date().getFullYear();
    const { count } = await supabase
        .from('sales_quotes')
        .select('*', { count: 'exact', head: true });

    return `COT-${year}-${String((count || 0) + 1).padStart(5, '0')}`;
}

// GET /api/ventas/quotes — list quotes
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
            .from('sales_quotes')
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
            query = query.or(`quote_number.ilike.%${term}%,notes.ilike.%${term}%`);
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
            quotes: data || [],
            total: count || 0,
            page,
            per_page: perPage,
            total_pages: Math.ceil((count || 0) / perPage),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}

// POST /api/ventas/quotes — create quote with line items
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
            valid_until,
            status = 'borrador',
            tax_rate = 15,
            discount_amount = 0,
            notes,
            template_key,
            items = [],
        } = body || {};

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'La cotización debe tener al menos un artículo' }, { status: 400 });
        }

        const quoteNumber = await generateQuoteNumber(supabase);

        const normalizedTaxRate = Math.max(0, normalizeNumber(tax_rate, 15));
        const normalizedDiscount = Math.max(0, normalizeNumber(discount_amount, 0));
        const totals = calculateTotals(items, normalizedTaxRate, normalizedDiscount);

        const insertQuote = {
            quote_number: quoteNumber,
            customer_id: customer_id || null,
            warehouse_id: warehouse_id || null,
            date: date || new Date().toISOString().slice(0, 10),
            valid_until: valid_until || null,
            status: normalizeStatus(status, 'borrador'),
            subtotal: totals.subtotal,
            tax_rate: normalizedTaxRate,
            tax_amount: totals.tax_amount,
            discount_amount: normalizedDiscount,
            total: totals.total,
            notes: notes || null,
            template_key: template_key || null,
        };

        const { data: quote, error: quoteError } = await supabase
            .from('sales_quotes')
            .insert(insertQuote)
            .select()
            .single();

        if (quoteError || !quote) {
            return NextResponse.json({ error: quoteError?.message || 'No se pudo crear la cotización' }, { status: 500 });
        }

        const quoteItems = items.map((item: any, index: number) => {
            const quantity = Math.max(0, normalizeNumber(item?.quantity, 0));
            const unitPrice = Math.max(0, normalizeNumber(item?.unit_price, 0));
            const discountPercent = Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0)));
            return {
                quote_id: quote.id,
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
            .from('sales_quote_items')
            .insert(quoteItems);

        if (itemsError) {
            await supabase.from('sales_quotes').delete().eq('id', quote.id);
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        return NextResponse.json({ quote }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}
