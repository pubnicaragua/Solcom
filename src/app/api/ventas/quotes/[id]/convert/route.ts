import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

async function generateInvoiceNumber(supabase: any): Promise<string> {
    const { data, error } = await supabase.rpc('generate_invoice_number');
    if (!error && data) {
        return String(data);
    }

    const year = new Date().getFullYear();
    const { count } = await supabase
        .from('sales_invoices')
        .select('*', { count: 'exact', head: true });

    return `FAC-${year}-${String((count || 0) + 1).padStart(5, '0')}`;
}

// POST /api/ventas/quotes/[id]/convert — convert quote to invoice
export async function POST(
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

        const { data: quote, error: quoteError } = await supabase
            .from('sales_quotes')
            .select(`
                id,
                quote_number,
                customer_id,
                warehouse_id,
                date,
                valid_until,
                status,
                subtotal,
                tax_rate,
                tax_amount,
                discount_amount,
                total,
                notes,
                converted_invoice_id,
                source,
                items:sales_quote_items(*)
            `)
            .eq('id', params.id)
            .single();

        if (quoteError || !quote) {
            return NextResponse.json({ error: quoteError?.message || 'Cotización no encontrada' }, { status: 404 });
        }

        // Block conversion for cart-generated quotes
        if (quote.source === 'inventory_cart') {
            return NextResponse.json(
                { error: 'Las cotizaciones generadas desde el inventario no pueden convertirse a factura. Usa el módulo de facturación directamente.' },
                { status: 400 }
            );
        }

        if (quote.converted_invoice_id || quote.status === 'convertida') {
            return NextResponse.json(
                {
                    error: 'Esta cotización ya fue convertida previamente.',
                    converted_invoice_id: quote.converted_invoice_id || null,
                },
                { status: 400 }
            );
        }

        const quoteItems = Array.isArray(quote.items) ? quote.items : [];
        if (quoteItems.length === 0) {
            return NextResponse.json({ error: 'La cotización no tiene líneas para convertir.' }, { status: 400 });
        }

        const invoiceNumber = await generateInvoiceNumber(supabase);
        const nowIso = new Date().toISOString();

        const { data: invoice, error: invoiceError } = await supabase
            .from('sales_invoices')
            .insert({
                invoice_number: invoiceNumber,
                customer_id: quote.customer_id || null,
                warehouse_id: quote.warehouse_id || null,
                order_number: quote.quote_number,
                date: quote.date || new Date().toISOString().slice(0, 10),
                due_date: quote.valid_until || null,
                status: 'borrador',
                subtotal: Math.round(normalizeNumber(quote.subtotal, 0) * 100) / 100,
                tax_rate: Math.round(normalizeNumber(quote.tax_rate, 15) * 100) / 100,
                tax_amount: Math.round(normalizeNumber(quote.tax_amount, 0) * 100) / 100,
                discount_amount: Math.round(normalizeNumber(quote.discount_amount, 0) * 100) / 100,
                shipping_charge: 0,
                total: Math.round(normalizeNumber(quote.total, 0) * 100) / 100,
                payment_method: null,
                notes: [
                    `Convertida desde cotización ${quote.quote_number}`,
                    quote.notes ? String(quote.notes).trim() : '',
                ].filter(Boolean).join(' | '),
                terms: null,
                salesperson_id: null,
                delivery_requested: false,
                delivery_id: null,
                credit_detail: null,
                cancellation_reason_id: null,
                cancellation_comments: null,
                created_at: nowIso,
                updated_at: nowIso,
            })
            .select()
            .single();

        if (invoiceError || !invoice) {
            return NextResponse.json({ error: invoiceError?.message || 'No se pudo crear la factura' }, { status: 500 });
        }

        const invoiceItems = quoteItems.map((item: any, index: number) => {
            const quantity = Math.max(0, normalizeNumber(item?.quantity, 0));
            const unitPrice = Math.max(0, normalizeNumber(item?.unit_price, 0));
            const discountPercent = Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0)));
            return {
                invoice_id: invoice.id,
                item_id: item?.item_id || null,
                description: String(item?.description || 'Artículo').trim(),
                quantity,
                unit_price: unitPrice,
                discount_percent: discountPercent,
                subtotal: Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100,
                sort_order: index,
                created_at: nowIso,
            };
        });

        const { error: itemsError } = await supabase
            .from('sales_invoice_items')
            .insert(invoiceItems);

        if (itemsError) {
            await supabase.from('sales_invoices').delete().eq('id', invoice.id);
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        const { error: quoteUpdateError } = await supabase
            .from('sales_quotes')
            .update({
                status: 'convertida',
                converted_invoice_id: invoice.id,
                updated_at: nowIso,
            })
            .eq('id', quote.id);

        if (quoteUpdateError) {
            return NextResponse.json({ error: quoteUpdateError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            quote_id: quote.id,
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}
