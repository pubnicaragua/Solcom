import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { buildTaxCatalogMap, getZohoTaxCatalog } from '@/lib/zoho/tax-catalog';
import {
    computeFiscalTotals,
    FiscalValidationError,
    normalizeFiscalLine,
    withWarrantyInDescription,
} from '@/lib/ventas/fiscal';

const QUOTE_STATUSES = new Set(['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida', 'convertida']);

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStatus(value: unknown, fallback = 'borrador'): string {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return QUOTE_STATUSES.has(text) ? text : fallback;
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeWarranty(value: unknown): string | null {
    const text = normalizeText(value);
    return text || null;
}

function extractMissingColumn(message: string): string | null {
    const text = String(message || '');
    let match = text.match(/Could not find the '([^']+)' column/i);
    if (match?.[1]) return match[1];
    match = text.match(/column "?([a-zA-Z0-9_]+)"? does not exist/i);
    if (match?.[1]) return match[1];
    return null;
}

async function insertQuoteItemsWithColumnFallback(supabase: any, rows: any[]): Promise<{ error: any }> {
    if (!Array.isArray(rows) || rows.length === 0) return { error: null };
    const mutableRows = rows.map((row) => ({ ...row }));
    let retry = 0;
    while (retry < 12) {
        const result = await supabase.from('sales_quote_items').insert(mutableRows);
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
    return { error: new Error('No se pudieron insertar líneas de cotización por columnas faltantes.') };
}

// GET /api/ventas/quotes/[id] — detail
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

        const { data: quote, error } = await supabase
            .from('sales_quotes')
            .select(`
                *,
                customer:customers(id, name, email, phone, ruc, address),
                warehouse:warehouses(id, code, name),
                items:sales_quote_items(*)
            `)
            .eq('id', params.id)
            .order('sort_order', { referencedTable: 'sales_quote_items', ascending: true })
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 });
        }

        return NextResponse.json({ quote });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}

// PUT /api/ventas/quotes/[id] — update status or full quote
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

        if (body?.status && Object.keys(body).length === 1) {
            const normalizedStatus = normalizeStatus(body.status, 'borrador');
            const { data, error } = await supabase
                .from('sales_quotes')
                .update({ status: normalizedStatus, updated_at: new Date().toISOString() })
                .eq('id', params.id)
                .select()
                .single();

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ quote: data });
        }

        const {
            customer_id,
            warehouse_id,
            date,
            valid_until,
            status,
            discount_amount,
            notes,
            template_key,
            items,
        } = body || {};

        const { data: currentQuote, error: currentError } = await supabase
            .from('sales_quotes')
            .select('id, tax_rate, discount_amount')
            .eq('id', params.id)
            .single();

        if (currentError || !currentQuote) {
            return NextResponse.json({ error: currentError?.message || 'Cotización no encontrada' }, { status: 404 });
        }

        const normalizedDiscountAmount = Math.max(0, normalizeNumber(discount_amount, 0));
        if (discount_amount !== undefined && normalizedDiscountAmount > 0) {
            return NextResponse.json(
                { error: 'El descuento global está deshabilitado en este flujo.', code: 'GLOBAL_DISCOUNT_DISABLED' },
                { status: 400 }
            );
        }

        const updateData: any = {
            updated_at: new Date().toISOString(),
        };

        if (customer_id !== undefined) updateData.customer_id = customer_id || null;
        if (warehouse_id !== undefined) updateData.warehouse_id = warehouse_id || null;
        if (date !== undefined) updateData.date = date;
        if (valid_until !== undefined) updateData.valid_until = valid_until || null;
        if (status !== undefined) updateData.status = normalizeStatus(status, 'borrador');
        if (discount_amount !== undefined) updateData.discount_amount = 0;
        if (notes !== undefined) updateData.notes = notes || null;
        if (template_key !== undefined) updateData.template_key = template_key || null;

        if (Array.isArray(items) && items.length > 0) {
            const taxCatalog = await getZohoTaxCatalog();
            const taxCatalogMap = buildTaxCatalogMap(
                (taxCatalog || []).filter((tax) => tax.active && tax.is_editable)
            );

            const normalizedItems = items.map((item: any, index: number) => normalizeFiscalLine({
                line: {
                    item_id: item?.item_id || null,
                    description: item?.description || item?.name || 'Artículo',
                    quantity: normalizeNumber(item?.quantity, NaN),
                    unit_price: Math.max(0, normalizeNumber(item?.unit_price, 0)),
                    discount_percent: Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0))),
                    tax_id: item?.tax_id || null,
                    tax_name: item?.tax_name || null,
                    tax_percentage: item?.tax_percentage,
                    warranty: item?.warranty ?? null,
                },
                taxCatalogMap,
                lineIndex: index,
            }));

            const totals = computeFiscalTotals(normalizedItems, 0);
            updateData.subtotal = totals.subtotal;
            updateData.tax_rate = totals.tax_rate;
            updateData.tax_amount = totals.tax_amount;
            updateData.total = totals.total;
            updateData.discount_amount = 0;

            await supabase.from('sales_quote_items').delete().eq('quote_id', params.id);

            const quoteItems = normalizedItems.map((item: any, index: number) => {
                return {
                    quote_id: params.id,
                    item_id: item?.item_id || null,
                    description: withWarrantyInDescription(
                        String(item?.description || item?.name || 'Artículo').trim(),
                        normalizeWarranty(item?.warranty)
                    ),
                    quantity: Math.max(0, normalizeNumber(item?.quantity, 0)),
                    unit_price: Math.max(0, normalizeNumber(item?.unit_price, 0)),
                    discount_percent: Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0))),
                    tax_id: normalizeText(item?.tax_id) || null,
                    tax_name: normalizeText(item?.tax_name) || null,
                    tax_percentage: Math.max(0, normalizeNumber(item?.tax_percentage, 0)),
                    warranty: normalizeWarranty(item?.warranty),
                    subtotal: Math.round(Math.max(0, normalizeNumber(item?.line_taxable, item?.subtotal || 0)) * 100) / 100,
                    sort_order: index,
                };
            });

            const { error: itemsError } = await insertQuoteItemsWithColumnFallback(supabase, quoteItems);

            if (itemsError) {
                return NextResponse.json({ error: itemsError.message }, { status: 500 });
            }
        }

        const { data, error } = await supabase
            .from('sales_quotes')
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

        return NextResponse.json({ quote: data });
    } catch (error: any) {
        if (error instanceof FiscalValidationError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details || null },
                { status: error.status || 400 }
            );
        }
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}

// DELETE /api/ventas/quotes/[id] — delete if not converted
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

        const { data: quote, error: quoteError } = await supabase
            .from('sales_quotes')
            .select('id, status, converted_invoice_id')
            .eq('id', params.id)
            .single();

        if (quoteError || !quote) {
            return NextResponse.json({ error: quoteError?.message || 'Cotización no encontrada' }, { status: 404 });
        }

        if (quote.status === 'convertida' || quote.converted_invoice_id) {
            return NextResponse.json(
                { error: 'No se puede eliminar una cotización convertida a factura' },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from('sales_quotes')
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
