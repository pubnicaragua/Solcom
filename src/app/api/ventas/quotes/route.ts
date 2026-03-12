import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { buildTaxCatalogMap, getZohoTaxCatalog } from '@/lib/zoho/tax-catalog';
import { getAuthenticatedProfile } from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';
import {
    canCreateVentasDocument,
    createPermissionDeniedMessage,
    resolveRoleForPermissionChecks,
} from '@/lib/auth/ventas-document-permissions';
import {
    computeFiscalTotals,
    FiscalValidationError,
    normalizeFiscalLine,
    withWarrantyInDescription,
} from '@/lib/ventas/fiscal';
import { validateWarehouseFamilyStock } from '@/lib/ventas/stock-validation';
import {
    beginIdempotentRequest,
    failIdempotentRequest,
    finalizeIdempotentRequest,
} from '@/lib/ventas/idempotency';
import {
    buildSyncStatusPayload,
    markDocumentSyncState,
    normalizeSyncErrorCodeFromError,
} from '@/lib/ventas/sync-state';
import { enqueueDocumentForSync } from '@/lib/ventas/sync-processor';

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

export async function syncQuoteToZoho(params: {
    supabase: any;
    quoteId: string;
    quoteNumber: string;
    customerId: string;
    warehouseId: string;
    date: string;
    validUntil: string | null;
    notes: string | null;
    items: any[];
}): Promise<{ zoho_estimate_id: string; zoho_estimate_number: string }> {
    const { supabase, quoteId, quoteNumber, customerId, warehouseId, date, validUntil, notes, items } = params;

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

    const warrantyCustomFieldId = normalizeText(process.env.ZOHO_BOOKS_WARRANTY_CUSTOMFIELD_ID);
    const buildZohoLineItems = (includeCustomFields: boolean) => (items || []).map((line: any, index: number) => {
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

    const zohoLineItems = buildZohoLineItems(true);
    if (zohoLineItems.length === 0) {
        throw new Error('No hay líneas válidas para enviar a Zoho.');
    }

    // Build estimate payload
    const estimatePayload: any = {
        customer_id: zohoCustomerId,
        date,
        line_items: zohoLineItems,
        reference_number: quoteNumber,
        discount_type: 'item_level',
        is_discount_before_tax: true,
    };

    if (validUntil) estimatePayload.expiry_date = validUntil;
    if (notes && notes.trim()) estimatePayload.notes = notes.trim();
    if (zohoLocationId) estimatePayload.location_id = zohoLocationId;

    // Create estimate in Zoho
    let result: { estimate_id: string; estimate_number: string };
    try {
        result = await zohoClient.createEstimate(estimatePayload);
    } catch (error: any) {
        const message = String(error?.message || '').toLowerCase();
        const customFieldRejected = message.includes('customfield')
            || message.includes('item_custom_fields');
        if (!customFieldRejected) throw error;

        result = await zohoClient.createEstimate({
            ...estimatePayload,
            line_items: buildZohoLineItems(false),
        });
    }

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
    let idempotencyRecordId = '';
    let externalRequestId = '';
    let idempotencyPayloadHash = '';
    let idempotencyKey = '';
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const auth = await getAuthenticatedProfile(supabase);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const moduleAccess = await getEffectiveModuleAccess(supabase, auth.userId, auth.role);
        if (!hasModuleAccess(moduleAccess, 'ventas')) {
            return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
        }

        const roleForPermission = await resolveRoleForPermissionChecks(
            supabase,
            auth.userId,
            auth.role
        );
        const canCreateQuote = await canCreateVentasDocument(
            supabase,
            roleForPermission,
            'quote'
        );
        if (!canCreateQuote) {
            return NextResponse.json(
                { error: createPermissionDeniedMessage('quote') },
                { status: 403 }
            );
        }

        const body = await req.json();
        const {
            customer_id,
            warehouse_id,
            date,
            valid_until,
            status = 'borrador',
            discount_amount = 0,
            notes,
            template_key,
            source,
            items = [],
            sync_to_zoho = false,
        } = body || {};

        const idempotencyStart = await beginIdempotentRequest({
            supabase,
            req,
            endpoint: '/api/ventas/quotes',
            payload: body || {},
            required: false,
        });

        if (idempotencyStart.kind === 'error' || idempotencyStart.kind === 'replay') {
            return idempotencyStart.response;
        }

        idempotencyRecordId = idempotencyStart.recordId;
        externalRequestId = idempotencyStart.externalRequestId;
        idempotencyPayloadHash = idempotencyStart.payloadHash;
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
                documentType: 'sales_quote',
                documentId: documentId || null,
                externalRequestId: externalRequestId || null,
            });
            const response = NextResponse.json(bodyData, { status: statusCode });
            if (idempotencyKey) {
                response.headers.set('X-Idempotency-Key', idempotencyKey);
            }
            return response;
        };

        if (!Array.isArray(items) || items.length === 0) {
            return failWith({ error: 'La cotización debe tener al menos un artículo' }, 400);
        }

        const normalizedDiscount = Math.max(0, normalizeNumber(discount_amount, 0));
        if (normalizedDiscount > 0) {
            return failWith(
                { error: 'El descuento global está deshabilitado en este flujo.', code: 'GLOBAL_DISCOUNT_DISABLED' },
                400
            );
        }

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

        const invalidQuantityIndex = normalizedItems.findIndex(
            (item: any) => !Number.isFinite(item.quantity) || item.quantity <= 0
        );
        if (invalidQuantityIndex >= 0) {
            return failWith(
                { error: `Cantidad inválida en la línea ${invalidQuantityIndex + 1}.` },
                400
            );
        }

        const stockValidation = await validateWarehouseFamilyStock({
            supabase,
            warehouseId: warehouse_id,
            items: normalizedItems,
        });
        if (!stockValidation.ok) {
            return failWith({ error: stockValidation.error }, 400);
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

        const totals = computeFiscalTotals(normalizedItems, 0);

        const shouldSyncToZoho = Boolean(sync_to_zoho);
        const insertQuote: any = {
            quote_number: quoteNumber,
            customer_id: customer_id || null,
            warehouse_id: warehouse_id || null,
            date: date || new Date().toISOString().slice(0, 10),
            valid_until: valid_until || null,
            status: normalizeStatus(status, 'borrador'),
            subtotal: totals.subtotal,
            tax_rate: totals.tax_rate,
            tax_amount: totals.tax_amount,
            discount_amount: 0,
            total: totals.total,
            notes: notes || null,
            template_key: template_key || null,
            source: source || null,
            sync_status: shouldSyncToZoho ? 'pending_sync' : 'not_requested',
            sync_error_code: null,
            sync_error_message: null,
            last_sync_attempt_at: shouldSyncToZoho ? new Date().toISOString() : null,
            external_request_id: externalRequestId || null,
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
            let data: any = null;
            let insertErr: any = null;
            let columnRetry = 0;
            while (columnRetry < 12) {
                const result = await supabase
                    .from('sales_quotes')
                    .insert(insertQuote)
                    .select()
                    .single();
                data = result.data;
                insertErr = result.error;

                if (!insertErr || data) break;

                const missingColumn = extractMissingColumn(insertErr?.message || '');
                if (missingColumn && Object.prototype.hasOwnProperty.call(insertQuote, missingColumn)) {
                    delete insertQuote[missingColumn];
                    columnRetry += 1;
                    continue;
                }
                break;
            }

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
            return failWith({ error: lastError?.message || 'No se pudo crear la cotización' }, 500);
        }

        const quoteItems = normalizedItems.map((item: any, index: number) => {
            return {
                quote_id: quote.id,
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
            await supabase.from('sales_quotes').delete().eq('id', quote.id);
            return failWith({ error: itemsError.message }, 500);
        }

        // Sync to Zoho if requested
        let zohoSync: { zoho_estimate_id: string; zoho_estimate_number: string } | null = null;
        let zohoWarning: string | null = null;
        let responseStatus = 201;
        let syncState = {
            sync_status: shouldSyncToZoho ? 'pending_sync' : 'not_requested',
            sync_error_code: null as string | null,
            sync_error_message: null as string | null,
            last_sync_attempt_at: shouldSyncToZoho ? new Date().toISOString() : null as string | null,
            last_synced_at: null as string | null,
        };

        if (shouldSyncToZoho) {
            try {
                zohoSync = await syncQuoteToZoho({
                    supabase,
                    quoteId: quote.id,
                    quoteNumber: quote.quote_number,
                    customerId: customer_id,
                    warehouseId: warehouse_id,
                    date: date || new Date().toISOString().slice(0, 10),
                    validUntil: valid_until || null,
                    notes: notes || null,
                    items: normalizedItems,
                });

                const syncUpdate = await markDocumentSyncState({
                    supabase,
                    documentType: 'sales_quote',
                    documentId: quote.id,
                    status: 'synced',
                    externalRequestId: externalRequestId || null,
                    incrementAttempts: true,
                });
                if (!syncUpdate.error && syncUpdate.data) {
                    syncState = buildSyncStatusPayload(syncUpdate.data);
                } else {
                    syncState = {
                        sync_status: 'synced',
                        sync_error_code: null,
                        sync_error_message: null,
                        last_sync_attempt_at: new Date().toISOString(),
                        last_synced_at: new Date().toISOString(),
                    };
                }
            } catch (zohoError: any) {
                zohoWarning = zohoError?.message || 'No se pudo crear la cotización en Zoho';
                responseStatus = 202;
                const errorCode = normalizeSyncErrorCodeFromError(zohoError);

                const syncUpdate = await markDocumentSyncState({
                    supabase,
                    documentType: 'sales_quote',
                    documentId: quote.id,
                    status: 'pending_sync',
                    errorCode,
                    errorMessage: zohoWarning,
                    externalRequestId: externalRequestId || null,
                    incrementAttempts: true,
                });

                if (!syncUpdate.error && syncUpdate.data) {
                    syncState = buildSyncStatusPayload(syncUpdate.data);
                } else {
                    syncState = {
                        sync_status: 'pending_sync',
                        sync_error_code: errorCode,
                        sync_error_message: zohoWarning,
                        last_sync_attempt_at: new Date().toISOString(),
                        last_synced_at: null,
                    };
                }

                await enqueueDocumentForSync({
                    supabase,
                    documentType: 'sales_quote',
                    documentId: quote.id,
                    idempotencyKey: idempotencyKey || null,
                    payloadHash: idempotencyPayloadHash || null,
                    externalRequestId: externalRequestId || null,
                    errorCode,
                    errorMessage: zohoWarning,
                    priority: 30,
                });
            }
        } else {
            await markDocumentSyncState({
                supabase,
                documentType: 'sales_quote',
                documentId: quote.id,
                status: 'not_requested',
                externalRequestId: externalRequestId || null,
                incrementAttempts: false,
            });
        }

        const quoteResponse = {
            ...quote,
            ...syncState,
            external_request_id: externalRequestId || quote.external_request_id || null,
        };

        const responseBody = {
            quote: quoteResponse,
            zoho: zohoSync,
            warning: zohoWarning,
            code: responseStatus === 202 ? 'SYNC_PENDING' : undefined,
            ...syncState,
            external_request_id: quoteResponse.external_request_id,
        };

        return succeedWith(responseBody, responseStatus, quote.id);
    } catch (error: any) {
        if (idempotencyRecordId) {
            const errorBody = error instanceof FiscalValidationError
                ? { error: error.message, code: error.code, details: error.details || null }
                : { error: error.message || 'Error interno' };
            const errorStatus = error instanceof FiscalValidationError ? (error.status || 400) : 500;
            try {
                await failIdempotentRequest({
                    supabase: createRouteHandlerClient({ cookies }),
                    recordId: idempotencyRecordId,
                    responseStatus: errorStatus,
                    responseBody: errorBody,
                });
            } catch {
                // no-op
            }
        }
        if (error instanceof FiscalValidationError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details || null },
                { status: error.status || 400 }
            );
        }
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}
