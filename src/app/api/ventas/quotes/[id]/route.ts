import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { buildTaxCatalogMap, getZohoTaxCatalog } from '@/lib/zoho/tax-catalog';
import {
    computeFiscalTotals,
    FiscalValidationError,
    normalizeFiscalLine,
    withWarrantyInDescription,
} from '@/lib/ventas/fiscal';
import {
    buildVersionConflictResponse,
    getCurrentRowVersion,
    getExpectedRowVersion,
} from '@/lib/ventas/version-conflict';

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

async function syncUpdatedQuoteToZoho(params: {
    supabase: any;
    quoteId: string;
}) {
    const { supabase, quoteId } = params;
    const zohoClient = createZohoBooksClient();
    if (!zohoClient) {
        throw new Error('No se pudo sincronizar en Zoho: configuración ZOHO_BOOKS_* incompleta.');
    }

    const quoteLookup = await supabase
        .from('sales_quotes')
        .select('id, quote_number, customer_id, warehouse_id, date, valid_until, notes, zoho_estimate_id')
        .eq('id', quoteId)
        .single();

    if (quoteLookup.error || !quoteLookup.data) {
        throw new Error(`No se pudo cargar cotización para Zoho: ${quoteLookup.error?.message || 'No encontrada'}`);
    }

    const quote = quoteLookup.data as any;
    const zohoEstimateId = normalizeText(quote?.zoho_estimate_id);
    if (!zohoEstimateId) return;

    const customerId = normalizeText(quote?.customer_id);
    if (!customerId) throw new Error('La cotización no tiene cliente para sincronizar en Zoho.');

    const customerLookup = await supabase
        .from('customers')
        .select('id, name, zoho_contact_id')
        .eq('id', customerId)
        .single();

    if (customerLookup.error) {
        throw new Error(`No se pudo leer cliente para Zoho: ${customerLookup.error.message}`);
    }

    const zohoCustomerId = normalizeText(customerLookup.data?.zoho_contact_id);
    if (!zohoCustomerId) {
        const customerName = normalizeText(customerLookup.data?.name) || 'cliente';
        throw new Error(`El cliente "${customerName}" no está vinculado con Zoho.`);
    }

    const quoteItemsLookup = await supabase
        .from('sales_quote_items')
        .select('item_id, description, quantity, unit_price, discount_percent, tax_id, warranty, price_profile_code')
        .eq('quote_id', quoteId)
        .order('sort_order', { ascending: true });

    if (quoteItemsLookup.error) {
        throw new Error(`No se pudieron leer líneas de cotización para Zoho: ${quoteItemsLookup.error.message}`);
    }

    const quoteItems = Array.isArray(quoteItemsLookup.data) ? quoteItemsLookup.data : [];
    if (quoteItems.length === 0) {
        throw new Error('La cotización no tiene líneas válidas para sincronizar en Zoho.');
    }

    const localItemIds = Array.from(
        new Set(
            quoteItems
                .map((line: any) => normalizeText(line?.item_id))
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

    let zohoLocationId: string | undefined;
    const warehouseId = normalizeText(quote?.warehouse_id);
    if (warehouseId) {
        const warehouseLookup = await supabase
            .from('warehouses')
            .select('id, zoho_warehouse_id')
            .eq('id', warehouseId)
            .maybeSingle();
        if (warehouseLookup.error) {
            throw new Error(`No se pudo leer bodega para Zoho: ${warehouseLookup.error.message}`);
        }
        const zohoWarehouseId = normalizeText(warehouseLookup.data?.zoho_warehouse_id);
        if (zohoWarehouseId) {
            zohoLocationId = zohoWarehouseId;
        }
    }

    const warrantyCustomFieldId = normalizeText(process.env.ZOHO_BOOKS_WARRANTY_CUSTOMFIELD_ID);
    const buildZohoLineItems = (includeCustomFields: boolean) => quoteItems.map((line: any, index: number) => {
        const localItemId = normalizeText(line?.item_id);
        if (!localItemId) {
            throw new Error(`La línea ${index + 1} no está vinculada a un producto del catálogo.`);
        }

        const mapped = mappedItems.get(localItemId);
        if (!mapped) {
            throw new Error(`No se encontró artículo local ${localItemId} para sincronizar en Zoho.`);
        }

        const zohoItemId = normalizeText(mapped.zoho_item_id);
        if (!zohoItemId) {
            throw new Error(`El artículo "${mapped.name}" (${mapped.sku || localItemId}) no tiene zoho_item_id.`);
        }

        const quantity = Math.max(0.01, normalizeNumber(line?.quantity, 1));
        const unitPrice = Math.max(0, normalizeNumber(line?.unit_price, 0));
        const discountPercent = Math.max(0, Math.min(100, normalizeNumber(line?.discount_percent, 0)));
        const taxId = normalizeText(line?.tax_id);
        const warranty = normalizeWarranty(line?.warranty);

        const payloadLine: any = {
            item_id: zohoItemId,
            quantity,
            rate: Number(unitPrice.toFixed(6)),
            description: withWarrantyInDescription(normalizeText(line?.description || mapped.name), warranty),
        };

        if (taxId) {
            payloadLine.tax_id = taxId;
        }

        if (discountPercent > 0) {
            payloadLine.discount = `${Number(discountPercent.toFixed(2))}%`;
        }
        if (includeCustomFields && warrantyCustomFieldId && warranty) {
            payloadLine.item_custom_fields = [
                {
                    customfield_id: warrantyCustomFieldId,
                    value: warranty,
                },
            ];
        }
        return payloadLine;
    });

    const payload: any = {
        estimate_id: zohoEstimateId,
        customer_id: zohoCustomerId,
        date: normalizeText(quote?.date) || new Date().toISOString().slice(0, 10),
        line_items: buildZohoLineItems(true),
        reference_number: normalizeText(quote?.quote_number) || undefined,
        discount_type: 'item_level',
        is_discount_before_tax: true,
    };
    const expiryDate = normalizeText(quote?.valid_until);
    if (expiryDate) payload.expiry_date = expiryDate;
    const notes = normalizeText(quote?.notes);
    if (notes) payload.notes = notes;
    if (zohoLocationId) payload.location_id = zohoLocationId;

    try {
        await zohoClient.updateEstimate(payload);
    } catch (error: any) {
        const message = String(error?.message || '').toLowerCase();
        const customFieldRejected = message.includes('customfield')
            || message.includes('item_custom_fields');
        if (!customFieldRejected) throw error;

        await zohoClient.updateEstimate({
            ...payload,
            line_items: buildZohoLineItems(false),
        });
    }
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
        const expectedRowVersion = getExpectedRowVersion(req, body);

        if (body?.status && Object.keys(body).length === 1) {
            const normalizedStatus = normalizeStatus(body.status, 'borrador');
            const currentLookup = await supabase
                .from('sales_quotes')
                .select('id, row_version')
                .eq('id', params.id)
                .maybeSingle();

            if (currentLookup.error || !currentLookup.data) {
                return NextResponse.json({ error: currentLookup.error?.message || 'Cotización no encontrada' }, { status: 404 });
            }

            const currentRowVersion = getCurrentRowVersion(currentLookup.data);
            if (expectedRowVersion !== null && currentRowVersion !== null && expectedRowVersion !== currentRowVersion) {
                return buildVersionConflictResponse({
                    expectedRowVersion,
                    currentRowVersion,
                    resourceId: params.id,
                });
            }

            let statusUpdateQuery = supabase
                .from('sales_quotes')
                .update({ status: normalizedStatus, updated_at: new Date().toISOString() })
                .eq('id', params.id);

            if (expectedRowVersion !== null && currentRowVersion !== null) {
                statusUpdateQuery = statusUpdateQuery.eq('row_version', expectedRowVersion);
            }

            const { data, error } = await statusUpdateQuery.select().maybeSingle();

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            if (!data) {
                return buildVersionConflictResponse({
                    expectedRowVersion: expectedRowVersion ?? -1,
                    currentRowVersion,
                    resourceId: params.id,
                });
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
            .select('id, tax_rate, discount_amount, row_version')
            .eq('id', params.id)
            .single();

        if (currentError || !currentQuote) {
            return NextResponse.json({ error: currentError?.message || 'Cotización no encontrada' }, { status: 404 });
        }

        const currentRowVersion = getCurrentRowVersion(currentQuote);
        if (expectedRowVersion !== null && currentRowVersion !== null && expectedRowVersion !== currentRowVersion) {
            return buildVersionConflictResponse({
                expectedRowVersion,
                currentRowVersion,
                resourceId: params.id,
            });
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

            const normalizedItems = items.map((item: any, index: number) => ({
                ...normalizeFiscalLine({
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
                }),
                price_profile_code: normalizeText(item?.price_profile_code) || null,
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
                    description: String(item?.description || item?.name || 'Artículo').trim(),
                    quantity: Math.max(0, normalizeNumber(item?.quantity, 0)),
                    unit_price: Math.max(0, normalizeNumber(item?.unit_price, 0)),
                    discount_percent: Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0))),
                    tax_id: normalizeText(item?.tax_id) || null,
                    tax_name: normalizeText(item?.tax_name) || null,
                    tax_percentage: Math.max(0, normalizeNumber(item?.tax_percentage, 0)),
                    warranty: normalizeWarranty(item?.warranty),
                    price_profile_code: normalizeText(item?.price_profile_code) || null,
                    subtotal: Math.round(Math.max(0, normalizeNumber(item?.line_taxable, item?.subtotal || 0)) * 100) / 100,
                    sort_order: index,
                };
            });

            const { error: itemsError } = await insertQuoteItemsWithColumnFallback(supabase, quoteItems);

            if (itemsError) {
                return NextResponse.json({ error: itemsError.message }, { status: 500 });
            }
        }

        let updateQuery = supabase
            .from('sales_quotes')
            .update(updateData)
            .eq('id', params.id);

        if (expectedRowVersion !== null && currentRowVersion !== null) {
            updateQuery = updateQuery.eq('row_version', expectedRowVersion);
        }

        const { data, error } = await updateQuery.select(`
                *,
                customer:customers(id, name, email, phone, ruc, address),
                warehouse:warehouses(id, code, name)
            `)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!data) {
            return buildVersionConflictResponse({
                expectedRowVersion: expectedRowVersion ?? -1,
                currentRowVersion,
                resourceId: params.id,
            });
        }

        let zohoWarning: string | null = null;
        try {
            await syncUpdatedQuoteToZoho({
                supabase,
                quoteId: params.id,
            });
        } catch (zohoError: any) {
            zohoWarning = zohoError?.message || 'No se pudo sincronizar la cotización actualizada en Zoho.';
        }

        return NextResponse.json({ quote: data, warning: zohoWarning });
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
