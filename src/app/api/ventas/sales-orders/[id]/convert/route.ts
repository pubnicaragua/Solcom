import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createZohoBooksClient } from '@/lib/zoho/books-client';

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function extractMissingColumn(message: string): string | null {
    const text = String(message || '');
    let match = text.match(/Could not find the '([^']+)' column/i);
    if (match?.[1]) return match[1];
    match = text.match(/column "?([a-zA-Z0-9_]+)"? does not exist/i);
    if (match?.[1]) return match[1];
    return null;
}

// POST /api/ventas/sales-orders/[id]/convert — convert to invoice
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

        // 1) Read order + items
        const { data: order, error: orderError } = await supabase
            .from('sales_orders')
            .select(`
                *,
                items:sales_order_items(*)
            `)
            .eq('id', params.id)
            .order('sort_order', { referencedTable: 'sales_order_items', ascending: true })
            .single();

        if (orderError || !order) {
            return NextResponse.json({ error: orderError?.message || 'Orden no encontrada' }, { status: 404 });
        }

        if (order.status === 'convertida') {
            return NextResponse.json({ error: 'Esta orden ya fue convertida a factura' }, { status: 400 });
        }

        if (order.status === 'cancelada') {
            return NextResponse.json({ error: 'No se puede convertir una orden cancelada' }, { status: 400 });
        }

        // 2) Generate invoice number
        const year = new Date().getFullYear();
        let invoiceNumber = `FAC-OV-${year}-${Date.now().toString(36).toUpperCase()}`;

        // Try to get warehouse code for better invoice number
        if (order.warehouse_id) {
            const { data: wh } = await supabase
                .from('warehouses')
                .select('code')
                .eq('id', order.warehouse_id)
                .maybeSingle();
            if (wh?.code) {
                invoiceNumber = `FAC-${String(wh.code).trim().toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
            }
        }

        // 3) Create local invoice
        const invoiceInsert = {
            invoice_number: invoiceNumber,
            customer_id: order.customer_id,
            warehouse_id: order.warehouse_id,
            order_number: order.order_number || null,
            terms: (order as any).payment_terms || null,
            salesperson_id: (order as any).salesperson_id || null,
            date: new Date().toISOString().slice(0, 10),
            due_date: null,
            status: 'enviada',
            subtotal: order.subtotal,
            tax_rate: order.tax_rate,
            tax_amount: order.tax_amount,
            discount_amount: order.discount_amount,
            total: order.total,
            notes: order.notes ? `Convertida desde OV: ${order.order_number}. ${order.notes}` : `Convertida desde OV: ${order.order_number}`,
            source: 'sales_order_conversion',
        };

        let invoice: any = null;
        let invoiceError: any = null;
        let invoiceColumnRetry = 0;
        while (invoiceColumnRetry < 12) {
            const result = await supabase
                .from('sales_invoices')
                .insert(invoiceInsert)
                .select()
                .single();
            invoice = result.data;
            invoiceError = result.error;

            if (!invoiceError || invoice) break;

            const missingColumn = extractMissingColumn(invoiceError?.message || '');
            if (missingColumn && Object.prototype.hasOwnProperty.call(invoiceInsert, missingColumn)) {
                delete (invoiceInsert as any)[missingColumn];
                invoiceColumnRetry += 1;
                continue;
            }
            break;
        }

        if (invoiceError || !invoice) {
            return NextResponse.json({ error: invoiceError?.message || 'No se pudo crear la factura' }, { status: 500 });
        }

        // 4) Create invoice items
        const invoiceItems = (order.items || []).map((item: any, index: number) => ({
            invoice_id: invoice.id,
            item_id: item.item_id || null,
            description: item.description || 'Artículo',
            quantity: normalizeNumber(item.quantity, 0),
            unit_price: normalizeNumber(item.unit_price, 0),
            discount_percent: normalizeNumber(item.discount_percent, 0),
            subtotal: normalizeNumber(item.subtotal, 0),
            sort_order: index,
        }));

        if (invoiceItems.length > 0) {
            const { error: itemsError } = await supabase
                .from('sales_invoice_items')
                .insert(invoiceItems);

            if (itemsError) {
                // Cleanup invoice on failure
                await supabase.from('sales_invoices').delete().eq('id', invoice.id);
                return NextResponse.json({ error: itemsError.message }, { status: 500 });
            }
        }

        // 5) Sync to Zoho
        let zohoInvoice: { invoice_id: string; invoice_number: string } | null = null;

        try {
            const zohoClient = createZohoBooksClient();
            if (zohoClient && order.zoho_salesorder_id) {
                // Convert from existing Zoho sales order
                zohoInvoice = await zohoClient.convertSalesOrderToInvoice(order.zoho_salesorder_id);

                // Save Zoho metadata to invoice
                if (zohoInvoice) {
                    await supabase
                        .from('sales_invoices')
                        .update({
                            zoho_invoice_id: zohoInvoice.invoice_id || null,
                            zoho_invoice_number: zohoInvoice.invoice_number || null,
                            zoho_synced_at: new Date().toISOString(),
                        })
                        .eq('id', invoice.id);
                }
            }
        } catch (zohoErr: any) {
            // Log but don't fail — local conversion succeeded
            console.warn('[sales-orders/convert] Zoho sync error:', zohoErr?.message);
        }

        // 6) Update order status
        await supabase
            .from('sales_orders')
            .update({
                status: 'convertida',
                converted_invoice_id: invoice.id,
                updated_at: new Date().toISOString(),
            })
            .eq('id', params.id);

        return NextResponse.json({
            success: true,
            order_id: params.id,
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            zoho: zohoInvoice,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}
