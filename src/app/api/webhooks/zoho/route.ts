import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import {
    normalizeItemId,
    syncItemStock,
} from '@/lib/zoho/sync-logic';
import { invalidateZohoSerialCacheByItemIds } from '@/lib/zoho/serial-cache';

// Service Role Client for Webhooks (Bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';

function getSystemStatus() {
    return {
        has_org_id: !!process.env.ZOHO_BOOKS_ORGANIZATION_ID,
        has_client_id: !!process.env.ZOHO_BOOKS_CLIENT_ID,
        has_client_secret: !!process.env.ZOHO_BOOKS_CLIENT_SECRET,
        has_refresh_token: !!process.env.ZOHO_BOOKS_REFRESH_TOKEN,
        has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_supabase_anon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        has_supabase_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
}

// =============================================
// Helper: Collect Item IDs from ANY Payload Structure
// =============================================
function collectItemIdsFromPayload(payload: any): string[] {
    const ids = new Set<string>();

    const addId = (value: unknown) => {
        const id = normalizeItemId(value);
        if (id) ids.add(id);
    };

    const visit = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        if (typeof node !== 'object') return;

        // Specialized handling for known structures
        if (node.line_items && Array.isArray(node.line_items)) {
            node.line_items.forEach((line: any) => {
                addId(line.item_id || line.itemId || line.zoho_item_id || line.product_id || line.inventory_item_id);
                if (line.item && typeof line.item === 'object') {
                    addId(line.item.item_id || line.item.itemId || line.item.zoho_item_id || line.item.product_id || line.item.inventory_item_id);
                }
            });
        }
        if (node.adjustment_details && Array.isArray(node.adjustment_details)) {
            node.adjustment_details.forEach((line: any) => {
                addId(line.item_id || line.itemId);
            });
        }
        if (node.items && Array.isArray(node.items)) {
            node.items.forEach((line: any) => {
                addId(line.item_id || line.itemId || line.zoho_item_id || line.product_id || line.inventory_item_id);
            });
        }

        for (const [key, value] of Object.entries(node)) {
            const normalizedKey = key.toLowerCase();
            if (
                normalizedKey === 'item_id' ||
                normalizedKey === 'itemid' ||
                normalizedKey === 'zoho_item_id' ||
                normalizedKey === 'product_id' ||
                normalizedKey === 'inventory_item_id'
            ) {
                addId(value);
            }
            // Recurse, but avoid infinite loops or huge depth if possible (for now simple recursion)
            if (typeof value === 'object' && value !== null) {
                visit(value);
            }
        }
    };

    visit(payload);
    return Array.from(ids);
}

function collectSkusFromPayload(payload: any): string[] {
    const skus = new Set<string>();

    const addSku = (value: unknown) => {
        if (value === null || value === undefined) return;
        const sku = String(value).trim();
        if (sku) skus.add(sku);
    };

    const visit = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        if (typeof node !== 'object') return;

        for (const [key, value] of Object.entries(node)) {
            const normalizedKey = key.toLowerCase();
            if (normalizedKey === 'sku') {
                addSku(value);
            }
            if (typeof value === 'object' && value !== null) {
                visit(value);
            }
        }
    };

    visit(payload);
    return Array.from(skus);
}

async function resolveZohoItemIdsBySkus(
    supabase: any,
    skus: string[],
    debugLog: string[]
): Promise<string[]> {
    if (!skus.length) return [];

    const { data: items, error } = await supabase
        .from('items')
        .select('sku, zoho_item_id')
        .in('sku', skus);

    if (error) {
        debugLog.push(`SKU fallback query error: ${error.message}`);
        return [];
    }

    const ids = new Set<string>();
    for (const item of items || []) {
        const id = normalizeItemId((item as any).zoho_item_id);
        if (id) ids.add(id);
    }
    return Array.from(ids);
}

async function fetchLineItemsFromZohoDocument(
    apiDomain: string,
    accessToken: string,
    organizationId: string,
    endpoint: string
): Promise<any[]> {
    const url = `${apiDomain}${endpoint}${endpoint.includes('?') ? '&' : '?'}organization_id=${organizationId}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
        cache: 'no-store',
    });

    if (!response.ok) return [];

    const raw = await response.text();
    if (!raw) return [];

    let parsed: any = null;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }

    const candidateDocs = [
        parsed?.purchaseorder,
        parsed?.purchase_order,
        parsed?.bill,
        parsed?.inventory_adjustment,
        parsed?.item,
    ].filter(Boolean);

    for (const doc of candidateDocs) {
        if (Array.isArray(doc?.line_items)) return doc.line_items;
        if (Array.isArray(doc?.items)) return doc.items;
    }

    return [];
}

async function fallbackItemIdsFromZohoDocuments(
    payload: any,
    debugLog: string[]
): Promise<string[]> {
    const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    if (!organizationId) return [];

    const documentIds = new Set<string>();

    const addDocId = (value: unknown) => {
        if (value === null || value === undefined) return;
        const id = String(value).trim();
        if (id) documentIds.add(id);
    };

    addDocId(payload?.purchaseorder?.purchaseorder_id);
    addDocId(payload?.purchase_order?.purchaseorder_id);
    addDocId(payload?.purchase_order?.purchase_order_id);
    addDocId(payload?.purchase_order_id);
    addDocId(payload?.purchaseorder_id);
    addDocId(payload?.bill?.bill_id);
    addDocId(payload?.bill_id);

    if (documentIds.size === 0) return [];

    const auth = await getZohoAccessToken();
    if (!auth || 'error' in auth) {
        debugLog.push(`Zoho document fallback auth error: ${(auth as any)?.error || 'Unknown'}`);
        return [];
    }

    const collectedIds = new Set<string>();
    for (const id of documentIds) {
        const endpoints = [
            `/books/v3/purchaseorders/${id}`,
            `/books/v3/bills/${id}`,
            `/inventory/v1/purchaseorders/${id}`,
            `/inventory/v1/bills/${id}`,
        ];

        for (const endpoint of endpoints) {
            const lineItems = await fetchLineItemsFromZohoDocument(
                auth.apiDomain,
                auth.accessToken,
                organizationId,
                endpoint
            );

            if (!lineItems.length) continue;

            for (const line of lineItems) {
                const lineId = normalizeItemId(
                    line?.item_id || line?.itemId || line?.zoho_item_id || line?.product_id || line?.inventory_item_id
                );
                if (lineId) collectedIds.add(lineId);
            }
        }
    }

    if (collectedIds.size > 0) {
        debugLog.push(`Document fallback recovered ${collectedIds.size} item IDs`);
    }
    return Array.from(collectedIds);
}


// =============================================
// Main Webhook Handler
// =============================================
export async function POST(request: NextRequest) {
    const debugLog: string[] = [];
    const systemStatus = getSystemStatus();

    try {
        const { searchParams } = new URL(request.url);
        const secret = searchParams.get('secret');

        // Optional Secret Check
        if (secret && process.env.ZOHO_WEBHOOK_SECRET && secret !== process.env.ZOHO_WEBHOOK_SECRET) {
            return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
        }

        const contentType = request.headers.get('content-type') || '';
        let payload: any = {};

        if (contentType.includes('application/json')) {
            payload = await request.json();
        } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const jsonString = formData.get('JSONString');
            if (jsonString && typeof jsonString === 'string') {
                payload = JSON.parse(jsonString);
            }
        }

        const payloadKeys = Object.keys(payload);
        debugLog.push(`Payload received. Keys: ${payloadKeys.join(', ')}`);

        // Use Service Role Client
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Cargar bodegas (needed for sync logic)
        const { data: warehouses } = await supabase.from('warehouses').select('id, zoho_warehouse_id, active').not('zoho_warehouse_id', 'is', null);
        const warehousesData = warehouses || [];
        const warehouseMap = new Map(warehousesData.map((w: any) => [String(w.zoho_warehouse_id), { id: w.id, active: w.active }]));

        // 2. Identify Event Type
        // We look for specific top-level keys that Zoho sends
        const isBill = payload.bill || payloadKeys.includes('bill');
        const isTransfer = payload.transfer_order || payload.transferorder || payloadKeys.includes('transfer_order');
        const isAdjustment = payload.inventory_adjustment || payload.stockadjustment || payloadKeys.includes('inventory_adjustment');
        const isSalesOrder = payload.salesorder || payload.sales_order;
        const isInvoice = payload.invoice;
        const isItemEvent = payload.item || payload.item_id;

        debugLog.push(`Event Type Detected: Bill=${!!isBill}, Transfer=${!!isTransfer}, Adjust=${!!isAdjustment}, SO=${!!isSalesOrder}, Inv=${!!isInvoice}`);

        // 3. Extract ALL Item IDs involved
        // This is the safety net: ANY item ID found in the payload gets synced.
        const allItemIds = collectItemIdsFromPayload(payload);
        debugLog.push(`Extracted ${allItemIds.length} unique Item IDs to sync`);

        // Fallback 1: resolve by SKU (some Zoho webhook variants include SKU but not item_id)
        if (allItemIds.length === 0) {
            const skus = collectSkusFromPayload(payload);
            if (skus.length > 0) {
                const skuResolvedIds = await resolveZohoItemIdsBySkus(supabase, skus, debugLog);
                if (skuResolvedIds.length > 0) {
                    debugLog.push(`SKU fallback resolved ${skuResolvedIds.length} item IDs`);
                    allItemIds.push(...skuResolvedIds);
                }
            }
        }

        // Fallback 2: fetch document detail from Zoho by purchase/bill id and extract line item ids
        if (allItemIds.length === 0) {
            const docResolvedIds = await fallbackItemIdsFromZohoDocuments(payload, debugLog);
            if (docResolvedIds.length > 0) {
                allItemIds.push(...docResolvedIds);
            }
        }

        const dedupedItemIds = Array.from(new Set(allItemIds));
        debugLog.push(`Final item IDs to sync: ${dedupedItemIds.length}`);

        if (dedupedItemIds.length > 0) {
            const clearedSerialCache = invalidateZohoSerialCacheByItemIds(dedupedItemIds);
            debugLog.push(`Serial cache invalidada para ${dedupedItemIds.length} item(s), claves limpiadas: ${clearedSerialCache}`);
        }

        // --- SPECIAL HANDLING: Transfer Order Upsert ---
        // (Keep existing logic but ensure we sync items too)
        const transferOrder = payload.transfer_order || payload.transferorder;
        if (transferOrder) {
            const fromId = warehouseMap.get(String(transferOrder.from_location_id || transferOrder.from_warehouse_id))?.id;
            const toId = warehouseMap.get(String(transferOrder.to_location_id || transferOrder.to_warehouse_id))?.id;
            const status = transferOrder.status === 'received' ? 'received' : 'in_transit';

            const { error: upsertError } = await supabase.from('transfer_orders').upsert({
                zoho_transfer_order_id: transferOrder.transfer_order_id,
                transfer_order_number: transferOrder.transfer_order_number,
                date: transferOrder.date,
                from_warehouse_id: fromId,
                to_warehouse_id: toId,
                status: status,
                line_items: transferOrder.line_items,
                received_at: status === 'received' ? new Date().toISOString() : null
            }, { onConflict: 'zoho_transfer_order_id' });

            if (upsertError) debugLog.push(`Transfer upsert error: ${upsertError.message}`);
            else debugLog.push('Transfer Order upserted locally');
        }

        // --- SPECIAL HANDLING: Sales Invoice Registration ---
        // Registrar salidas para el Análisis de Restock
        const invoiceNode = payload.invoice || (payload.salesorder?.status === 'invoiced' ? payload.salesorder : null);
        if (invoiceNode && invoiceNode.line_items) {
            const zohoIds = invoiceNode.line_items.map((l: any) => normalizeItemId(l.item_id || l.product_id)).filter(Boolean);
            
            if (zohoIds.length > 0) {
                // Obtener IDs locales
                const { data: localItems } = await supabase.from('items').select('id, zoho_item_id').in('zoho_item_id', zohoIds);
                const localItemMap = new Map(localItems?.map((i: any) => [i.zoho_item_id, i.id]) || []);
                const defaultWh = Array.from(warehouseMap.values()).find(w => w.active)?.id;

                const salesEvents = [];
                const invoiceId = invoiceNode.invoice_id || invoiceNode.salesorder_id || `sales-${Date.now()}`;
                const invoiceDate = invoiceNode.date || new Date().toISOString();
                
                for (const line of invoiceNode.line_items) {
                    const zId = normalizeItemId(line.item_id || line.product_id);
                    const localId = localItemMap.get(zId);
                    if (localId) {
                        const qty = Number(line.quantity || 1);
                        const userWh = warehouseMap.get(String(line.warehouse_id))?.id || defaultWh;
                        if (userWh) {
                            salesEvents.push({
                                idempotency_key: `sale-${invoiceId}-${line.line_item_id || zId}`,
                                source: 'webhook_invoice',
                                event_type: 'sale',
                                item_id: localId,
                                warehouse_id: userWh,
                                qty_delta: -qty, // Movimiento negativo (salida)
                                payload: { invoice_id: invoiceId, line_item_id: line.line_item_id, price: line.rate },
                                external_ts: invoiceDate
                            });
                        }
                    }
                }
                
                if (salesEvents.length > 0) {
                    // Try to insert, ignoring duplicates
                    const { error: saleErr } = await supabase.from('inventory_events').insert(salesEvents);
                    if (saleErr) {
                        if (!saleErr.message.includes('duplicate key')) {
                            debugLog.push(`Sales event insert error: ${saleErr.message}`);
                        }
                    } else {
                        debugLog.push(`Recorded ${salesEvents.length} sales events locally for restock analysis.`);
                    }
                }
            }
        }

        // 4. EXECUTE SYNC for all extracted items (NOW ASYNCHRONOUS USING QUEUE)
        const queuedCount = 0;
        const queueErrors = [];

        if (dedupedItemIds.length > 0) {
            const queueItems = dedupedItemIds.map(id => ({
                zoho_item_id: id,
                status: 'pending'
            }));

            // Insert into the sync_queue table
            const { error: queueError } = await supabase
                .from('sync_queue')
                .insert(queueItems);

            if (queueError) {
                debugLog.push(`Queue insertion error: ${queueError.message}`);
                queueErrors.push(queueError.message);
            } else {
                debugLog.push(`Successfully queued ${dedupedItemIds.length} items for background sync.`);
            }
        }

        return NextResponse.json({
            success: true,
            queuedCount: dedupedItemIds.length,
            errorCount: queueErrors.length,
            debug: debugLog
        });

    } catch (error) {
        debugLog.push(`FATAL: ${error instanceof Error ? error.message : 'Unknown'}`);
        return NextResponse.json({ error: 'Webhook processing failed', debug: debugLog }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ status: 'active', systemStatus: getSystemStatus() });
}
