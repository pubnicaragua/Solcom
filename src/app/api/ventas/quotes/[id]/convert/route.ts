import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
    beginIdempotentRequest,
    failIdempotentRequest,
    finalizeIdempotentRequest,
} from '@/lib/ventas/idempotency';

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
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
    let idempotencyRecordId = '';
    let externalRequestId = '';
    let idempotencyKey = '';
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const idempotencyStart = await beginIdempotentRequest({
            supabase,
            req,
            endpoint: `/api/ventas/quotes/${params.id}/convert`,
            payload: { quote_id: params.id },
            required: false,
        });

        if (idempotencyStart.kind === 'error' || idempotencyStart.kind === 'replay') {
            return idempotencyStart.response;
        }

        idempotencyRecordId = idempotencyStart.recordId;
        externalRequestId = idempotencyStart.externalRequestId;
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
            return failWith({ error: quoteError?.message || 'Cotización no encontrada' }, 404);
        }

        // Block conversion for cart-generated quotes
        if (quote.source === 'inventory_cart') {
            return failWith(
                { error: 'Las cotizaciones generadas desde el inventario no pueden convertirse a factura. Usa el módulo de facturación directamente.' },
                400
            );
        }

        if (quote.converted_invoice_id || quote.status === 'convertida') {
            return failWith(
                {
                    error: 'Esta cotización ya fue convertida previamente.',
                    converted_invoice_id: quote.converted_invoice_id || null,
                },
                400
            );
        }

        const quoteItems = Array.isArray(quote.items) ? quote.items : [];
        if (quoteItems.length === 0) {
            return failWith({ error: 'La cotización no tiene líneas para convertir.' }, 400);
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
                tax_rate: Math.round(normalizeNumber(quote.tax_rate, 0) * 100) / 100,
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
            return failWith({ error: invoiceError?.message || 'No se pudo crear la factura' }, 500);
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
                tax_id: normalizeText(item?.tax_id) || null,
                tax_name: normalizeText(item?.tax_name) || null,
                tax_percentage: Math.max(0, normalizeNumber(item?.tax_percentage, 0)),
                warranty: normalizeText(item?.warranty) || null,
                subtotal: Math.round(Math.max(0, normalizeNumber(item?.subtotal, quantity * unitPrice * (1 - discountPercent / 100))) * 100) / 100,
                sort_order: index,
                created_at: nowIso,
            };
        });

        const { error: itemsError } = await insertInvoiceItemsWithColumnFallback(supabase, invoiceItems);

        if (itemsError) {
            await supabase.from('sales_invoices').delete().eq('id', invoice.id);
            return failWith({ error: itemsError.message }, 500);
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
            return failWith({ error: quoteUpdateError.message }, 500);
        }

        return succeedWith({
            success: true,
            quote_id: quote.id,
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            external_request_id: externalRequestId || null,
        }, 201, invoice.id);
    } catch (error: any) {
        if (idempotencyRecordId) {
            try {
                await failIdempotentRequest({
                    supabase: createRouteHandlerClient({ cookies }),
                    recordId: idempotencyRecordId,
                    responseStatus: 500,
                    responseBody: { error: error.message || 'Error interno' },
                });
            } catch {
                // no-op
            }
        }
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}
