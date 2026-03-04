import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { validateWarehouseFamilyStock } from '@/lib/ventas/stock-validation';

export const dynamic = 'force-dynamic';

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

async function generateQuoteNumber(supabase: any, warehouseCode?: string): Promise<string> {
    if (warehouseCode) {
        const prefix = `COT-${warehouseCode}-`;
        const { data: latest } = await supabase
            .from('sales_quotes')
            .select('quote_number')
            .ilike('quote_number', `${prefix}%`)
            .order('quote_number', { ascending: false })
            .limit(1)
            .single();

        let nextNum = 1;
        if (latest?.quote_number) {
            const match = latest.quote_number.match(/(\d+)$/);
            if (match) nextNum = parseInt(match[1], 10) + 1;
        }

        return `${prefix}${String(nextNum).padStart(5, '0')}`;
    }

    // Fallback: try RPC, then year-based format
    const { data, error } = await supabase.rpc('generate_quote_number');
    if (!error && data) {
        return String(data);
    }

    const year = new Date().getFullYear();
    const prefix = `COT-${year}-`;

    const { data: latest } = await supabase
        .from('sales_quotes')
        .select('quote_number')
        .ilike('quote_number', `${prefix}%`)
        .order('quote_number', { ascending: false })
        .limit(1)
        .single();

    let nextNum = 1;
    if (latest?.quote_number) {
        const match = latest.quote_number.match(/(\d+)$/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
    }

    return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

async function syncQuoteToZoho(params: {
    supabase: any;
    quoteId: string;
    quoteNumber: string;
    customerId: string;
    warehouseId: string;
    date: string;
    validUntil: string | null;
    discountAmount: number;
    notes: string | null;
    items: any[];
}): Promise<{ zoho_estimate_id: string; zoho_estimate_number: string }> {
    const { supabase, quoteId, quoteNumber, customerId, warehouseId, date, validUntil, discountAmount, notes, items } = params;

    const zohoClient = createZohoBooksClient();
    if (!zohoClient) {
        throw new Error('Configuración de Zoho Books incompleta. Verifica las variables de entorno ZOHO_BOOKS_*.');
    }

    // Resolve zoho_contact_id
    const customerLookup = await supabase
        .from('customers')
        .select('id, name, zoho_contact_id')
        .eq('id', customerId)
        .single();

    if (customerLookup.error) {
        const text = String(customerLookup.error.message || '');
        if (text.includes('zoho_contact_id')) {
            throw new Error('Falta migración: columna zoho_contact_id no existe en customers.');
        }
        throw new Error(`No se pudo leer cliente para Zoho: ${text}`);
    }

    const zohoCustomerId = String(customerLookup.data?.zoho_contact_id || '').trim();
    const customerName = String(customerLookup.data?.name || 'cliente').trim();

    if (!zohoCustomerId) {
        throw new Error(`El cliente "${customerName}" no está vinculado con Zoho. Sincroniza clientes primero.`);
    }

    // Resolve zoho_warehouse_id
    let zohoLocationId: string | undefined;
    if (warehouseId) {
        const warehouseLookup = await supabase
            .from('warehouses')
            .select('id, code, name, zoho_warehouse_id')
            .eq('id', warehouseId)
            .maybeSingle();

        if (warehouseLookup.error) {
            throw new Error(`No se pudo leer bodega para Zoho: ${warehouseLookup.error.message}`);
        }

        const zohoWarehouseId = String(warehouseLookup.data?.zoho_warehouse_id || '').trim();
        if (zohoWarehouseId) {
            zohoLocationId = zohoWarehouseId;
        }
    }

    // Resolve zoho_item_id for each item
    const localItemIds = Array.from(
        new Set(
            (items || [])
                .map((line: any) => String(line?.item_id || '').trim())
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

    // Build Zoho line items
    const zohoLineItems = (items || []).map((line: any, index: number) => {
        const localItemId = String(line?.item_id || '').trim();
        if (!localItemId) {
            throw new Error(`La línea ${index + 1} no está vinculada a un producto del catálogo.`);
        }

        const mapped = mappedItems.get(localItemId);
        if (!mapped) {
            throw new Error(`No se encontró el artículo local ${localItemId} para enviar a Zoho.`);
        }

        const zohoItemId = String(mapped.zoho_item_id || '').trim();
        if (!zohoItemId) {
            throw new Error(`El artículo "${mapped.name}" (${mapped.sku || localItemId}) no tiene zoho_item_id. Ejecuta la sincronización de ítems.`);
        }

        const quantity = Math.max(0.01, normalizeNumber(line?.quantity, 1));
        const unitPrice = normalizeNumber(line?.unit_price, 0);
        const discountPercent = Math.max(0, Math.min(100, normalizeNumber(line?.discount_percent, 0)));
        const effectiveRate = Math.max(0, unitPrice * (1 - discountPercent / 100));

        return {
            item_id: zohoItemId,
            quantity,
            rate: Number(effectiveRate.toFixed(6)),
        };
    });

    if (zohoLineItems.length === 0) {
        throw new Error('No hay líneas válidas para enviar a Zoho.');
    }

    // Build estimate payload
    const estimatePayload: any = {
        customer_id: zohoCustomerId,
        date,
        line_items: zohoLineItems,
        reference_number: quoteNumber,
    };

    if (validUntil) estimatePayload.expiry_date = validUntil;
    if (notes && notes.trim()) estimatePayload.notes = notes.trim();
    if (discountAmount > 0) {
        estimatePayload.discount = Number(discountAmount.toFixed(2));
        estimatePayload.is_discount_before_tax = true;
    }
    if (zohoLocationId) estimatePayload.location_id = zohoLocationId;

    // Create estimate in Zoho
    const result = await zohoClient.createEstimate(estimatePayload);

    // Save Zoho metadata back to local quote (gracefully handle missing columns)
    if (result.estimate_id || result.estimate_number) {
        const maybeUpdate = await supabase
            .from('sales_quotes')
            .update({
                zoho_estimate_id: result.estimate_id || null,
                zoho_estimate_number: result.estimate_number || null,
                zoho_synced_at: new Date().toISOString(),
            })
            .eq('id', quoteId);

        if (maybeUpdate?.error) {
            const text = String(maybeUpdate.error.message || '').toLowerCase();
            const missingColumns =
                text.includes('zoho_estimate_id') ||
                text.includes('zoho_estimate_number') ||
                text.includes('zoho_synced_at');
            if (!missingColumns) {
                console.warn('[ventas/quotes] No se pudo guardar metadata Zoho:', maybeUpdate.error.message);
            }
        }
    }

    return {
        zoho_estimate_id: result.estimate_id,
        zoho_estimate_number: result.estimate_number,
    };
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
            source,
            items = [],
            sync_to_zoho = false,
        } = body || {};

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'La cotización debe tener al menos un artículo' }, { status: 400 });
        }

        const normalizedItems = items.map((item: any) => {
            const quantity = normalizeNumber(item?.quantity, NaN);
            const unitPrice = Math.max(0, normalizeNumber(item?.unit_price, 0));
            const discountPercent = Math.max(0, Math.min(100, normalizeNumber(item?.discount_percent, 0)));
            return {
                item_id: item?.item_id || null,
                description: String(item?.description || item?.name || 'Artículo').trim(),
                quantity,
                unit_price: unitPrice,
                discount_percent: discountPercent,
            };
        });

        const invalidQuantityIndex = normalizedItems.findIndex(
            (item: any) => !Number.isFinite(item.quantity) || item.quantity <= 0
        );
        if (invalidQuantityIndex >= 0) {
            return NextResponse.json(
                { error: `Cantidad inválida en la línea ${invalidQuantityIndex + 1}.` },
                { status: 400 }
            );
        }

        const stockValidation = await validateWarehouseFamilyStock({
            supabase,
            warehouseId: warehouse_id,
            items: normalizedItems,
        });
        if (!stockValidation.ok) {
            return NextResponse.json({ error: stockValidation.error }, { status: 400 });
        }

        // Resolve warehouse code for quote number format
        let warehouseCode: string | undefined;
        if (warehouse_id) {
            const { data: wh } = await supabase
                .from('warehouses')
                .select('code')
                .eq('id', warehouse_id)
                .maybeSingle();
            if (wh?.code) {
                warehouseCode = String(wh.code).trim().toUpperCase();
            }
        }

        const quoteNumber = await generateQuoteNumber(supabase, warehouseCode);

        const normalizedTaxRate = Math.max(0, normalizeNumber(tax_rate, 15));
        const normalizedDiscount = Math.max(0, normalizeNumber(discount_amount, 0));
        const totals = calculateTotals(normalizedItems, normalizedTaxRate, normalizedDiscount);

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
            source: source || null,
        };

        // Retry loop for duplicate quote number conflicts
        let quote: any = null;
        let lastError: any = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            if (attempt > 0) {
                const ts = Date.now().toString(36).toUpperCase();
                insertQuote.quote_number = warehouseCode
                    ? `COT-${warehouseCode}-${ts}`
                    : `COT-${new Date().getFullYear()}-${ts}`;
            }
            const { data, error: insertErr } = await supabase
                .from('sales_quotes')
                .insert(insertQuote)
                .select()
                .single();

            if (!insertErr && data) {
                quote = data;
                break;
            }

            lastError = insertErr;
            // Only retry on unique constraint violation
            if (!insertErr?.message?.includes('duplicate key') && !insertErr?.message?.includes('unique constraint')) {
                break;
            }
        }

        if (!quote) {
            return NextResponse.json({ error: lastError?.message || 'No se pudo crear la cotización' }, { status: 500 });
        }

        const quoteItems = normalizedItems.map((item: any, index: number) => {
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

        // Sync to Zoho if requested
        let zohoSync: { zoho_estimate_id: string; zoho_estimate_number: string } | null = null;
        if (sync_to_zoho) {
            try {
                zohoSync = await syncQuoteToZoho({
                    supabase,
                    quoteId: quote.id,
                    quoteNumber: quote.quote_number,
                    customerId: customer_id,
                    warehouseId: warehouse_id,
                    date: date || new Date().toISOString().slice(0, 10),
                    validUntil: valid_until || null,
                    discountAmount: normalizedDiscount,
                    notes: notes || null,
                    items: normalizedItems,
                });
            } catch (zohoError: any) {
                // Rollback: delete local quote + items on Zoho failure
                await supabase.from('sales_quote_items').delete().eq('quote_id', quote.id);
                await supabase.from('sales_quotes').delete().eq('id', quote.id);
                return NextResponse.json(
                    { error: zohoError?.message || 'No se pudo crear la cotización en Zoho' },
                    { status: 400 }
                );
            }
        }

        return NextResponse.json({ quote, zoho: zohoSync }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}
