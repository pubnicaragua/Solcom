import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import {
    normalizeItemId,
    normalizeItemState,
    syncItemStock,
} from '@/lib/zoho/sync-logic';

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

        for (const [key, value] of Object.entries(node)) {
            const normalizedKey = key.toLowerCase();
            if (normalizedKey === 'item_id' || normalizedKey === 'itemid' || normalizedKey === 'zoho_item_id') {
                addId(value);
            }
            visit(value);
        }
    };

    visit(payload);
    return Array.from(ids);
}

function collectItemIdsFromTransferOrder(transferOrder: any): string[] {
    const ids = new Set<string>();
    const lineItems = Array.isArray(transferOrder?.line_items) ? transferOrder.line_items : [];
    for (const line of lineItems) {
        const id =
            normalizeItemId((line as any)?.item_id) ||
            normalizeItemId((line as any)?.itemId) ||
            normalizeItemId((line as any)?.zoho_item_id);
        if (id) ids.add(id);
    }
    return Array.from(ids);
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

        // Optional Secret Check (Warn only to prevent breaking valid legitimate hooks without secret)
        if (secret && process.env.ZOHO_WEBHOOK_SECRET && secret !== process.env.ZOHO_WEBHOOK_SECRET) {
            return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
        }
        if (!secret && process.env.ZOHO_WEBHOOK_SECRET) {
            debugLog.push('WARN: Missing secret in webhook URL');
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
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            debugLog.push('WARN: SUPABASE_SERVICE_ROLE_KEY missing; webhook is using anon key');
        }

        // 1. Cargar bodegas
        const { data: warehouses } = await supabase.from('warehouses').select('id, zoho_warehouse_id, active').not('zoho_warehouse_id', 'is', null);
        const warehousesData = warehouses || [];
        const warehouseMap = new Map(warehousesData.map((w: any) => [String(w.zoho_warehouse_id), { id: w.id, active: w.active }]));
        debugLog.push(`Warehouses in DB: ${warehousesData.length}`);

        // --- NEW: Handle Transfer Order Upsert ---
        const transferOrder = payload.transfer_order || payload.transferorder;
        const transferOrderItemIds = new Set<string>();
        if (transferOrder) {
            debugLog.push(`Processing Transfer Order: ${transferOrder.transfer_order_number}`);

            const fromId = warehouseMap.get(String(transferOrder.from_location_id || transferOrder.from_warehouse_id))?.id;
            const toId = warehouseMap.get(String(transferOrder.to_location_id || transferOrder.to_warehouse_id))?.id;
            const status = transferOrder.status === 'received' ? 'received' : 'in_transit';

            const { error: upsertError } = await supabase
                .from('transfer_orders')
                .upsert({
                    zoho_transfer_order_id: transferOrder.transfer_order_id,
                    transfer_order_number: transferOrder.transfer_order_number,
                    date: transferOrder.date,
                    from_warehouse_id: fromId,
                    to_warehouse_id: toId,
                    status: status,
                    line_items: transferOrder.line_items,
                    // Only set received_at if it's new receipt or keep existing?
                    // Simple logic: if status received, set date.
                    received_at: status === 'received' ? new Date().toISOString() : null
                }, { onConflict: 'zoho_transfer_order_id' });

            if (upsertError) {
                debugLog.push(`ERROR upserting transfer: ${upsertError.message}`);
            } else {
                debugLog.push('Transfer Order upserted successfully');
            }

            for (const itemId of collectItemIdsFromTransferOrder(transferOrder)) {
                transferOrderItemIds.add(itemId);
            }
            debugLog.push(`Transfer Order item_ids detected: ${transferOrderItemIds.size}`);
        }

        // 2. Determinar tipo de evento (Legacy Logic)
        const moduleName = String(payload.module || payload.module_name || payload.event_module || '').toLowerCase();
        const isItemEvent = payloadKeys.includes('item') || payloadKeys.includes('data') || moduleName.includes('item');
        const isInventoryAdjustment =
            payloadKeys.includes('inventory_adjustment') ||
            payloadKeys.includes('stockadjustment') ||
            moduleName.includes('adjustment');
        const isCommonStockEvent =
            payloadKeys.includes('salesorder') ||
            payloadKeys.includes('sales_order') ||
            payloadKeys.includes('purchaseorder') ||
            payloadKeys.includes('purchase_order') ||
            payloadKeys.includes('invoice') ||
            payloadKeys.includes('bill') ||
            payloadKeys.includes('transferorder') ||
            payloadKeys.includes('transfer_order') ||
            moduleName.includes('salesorder') ||
            moduleName.includes('purchaseorder') ||
            moduleName.includes('transferorder');
        const payloadItemIds = Array.from(
            new Set<string>([
                ...collectItemIdsFromPayload(payload),
                ...Array.from(transferOrderItemIds),
            ])
        );
        const processedItemIds = new Set<string>();
        debugLog.push(`Routing flags item=${isItemEvent} adjustment=${isInventoryAdjustment} commonStock=${isCommonStockEvent}`);
        debugLog.push(`Payload item_ids detected: ${payloadItemIds.length}`);

        // --- Caso A: Item Event ---
        if (isItemEvent && !isInventoryAdjustment && !isCommonStockEvent) {
            // ... existing item logic ...
            // (Re-implementing simplified based on git show content)
            debugLog.push('Routing to ITEM EVENT handler');
            const itemData = payload.item || payload.data?.item || payload.data || payload;
            const zohoItemId = normalizeItemId(itemData.item_id || itemData.itemId || itemData.zoho_item_id);

            if (zohoItemId) {
                const customFields = itemData.custom_field_hash || {};
                const itemPayload = {
                    sku: itemData.sku || `NO-SKU-${zohoItemId}`,
                    name: itemData.name || 'Sin nombre',
                    color: customFields.cf_color || null,
                    state: normalizeItemState(customFields.cf_estado ?? customFields.cf_state ?? itemData.status),
                    zoho_item_id: zohoItemId,
                    price: itemData.purchase_rate ?? null,
                };

                const { data: updated } = await supabase.from('items').update(itemPayload).eq('zoho_item_id', zohoItemId).select('id');
                let supabaseId = updated?.[0]?.id;

                if (!supabaseId) {
                    const { data: inserted } = await supabase.from('items').insert(itemPayload).select('id');
                    supabaseId = inserted?.[0]?.id;
                }

                if (supabaseId) {
                    await syncItemStock(zohoItemId, supabase, warehouseMap, debugLog);
                    processedItemIds.add(zohoItemId);
                }
            } else {
                debugLog.push('WARN: ITEM EVENT received without item_id');
            }
        }

        // --- Caso B: Stock Events ---
        if (isInventoryAdjustment || isCommonStockEvent) {
            debugLog.push(`Routing to STOCK EVENT handler`);
            const uniqueItemIds = payloadItemIds;
            debugLog.push(`Stock event item_ids detected: ${uniqueItemIds.length}`);

            for (const zohoId of uniqueItemIds) {
                await syncItemStock(zohoId, supabase, warehouseMap, debugLog);
                processedItemIds.add(zohoId);
            }
            if (uniqueItemIds.length === 0) {
                debugLog.push('WARN: STOCK EVENT without item_id; no sync executed');
            }
        }

        // Fallback: if we can extract item_ids but event routing didn't classify it,
        // still sync those items to avoid silent stale stock.
        if (!isInventoryAdjustment && !isCommonStockEvent) {
            const pendingItemIds = payloadItemIds.filter((itemId) => !processedItemIds.has(itemId));
            if (pendingItemIds.length > 0) {
                debugLog.push(`Routing to FALLBACK ITEM_ID handler (${pendingItemIds.length} items)`);
                for (const zohoId of pendingItemIds) {
                    await syncItemStock(zohoId, supabase, warehouseMap, debugLog);
                    processedItemIds.add(zohoId);
                }
            }
        }

        return NextResponse.json({ success: true, debug: debugLog, systemStatus });

    } catch (error) {
        debugLog.push(`FATAL: ${error instanceof Error ? error.message : 'Unknown'}`);
        return NextResponse.json({ error: 'Webhook processing failed', debug: debugLog, systemStatus }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ status: 'active', systemStatus: getSystemStatus() });
}
