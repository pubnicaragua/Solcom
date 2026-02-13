
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken, fetchItemLocations, AuthExpiredError } from '@/lib/zoho/inventory-utils';

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

function toQty(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function normalizeItemId(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const itemId = String(value).trim();
    return itemId.length > 0 ? itemId : null;
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

// =============================================
// Helper: sincronizar stock de UN item por zoho_item_id
// =============================================
async function syncItemStock(
    zohoItemId: string,
    supabase: any,
    warehouseMap: Map<string, { id: string; active: boolean }>,
    debugLog: string[]
): Promise<{ snapshotsCreated: number; stockTotal: number }> {
    const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    if (!organizationId) {
        debugLog.push(`[syncItemStock] ERROR: No ZOHO_BOOKS_ORGANIZATION_ID`);
        return { snapshotsCreated: 0, stockTotal: 0 };
    }

    const auth = await getZohoAccessToken();
    if (!auth || 'error' in auth) { // Robust check
        debugLog.push(`[syncItemStock] ERROR auth: ${(auth as any)?.error || 'Unknown'}`);
        return { snapshotsCreated: 0, stockTotal: 0 };
    }

    try {
        const locations = await fetchItemLocations(
            auth.accessToken,
            auth.apiDomain,
            organizationId,
            zohoItemId
        );
        debugLog.push(`[syncItemStock] ${zohoItemId}: ${locations.length} locations`);

        const { data: itemRows } = await supabase
            .from('items')
            .select('id, stock_total')
            .eq('zoho_item_id', zohoItemId)
            .limit(1);

        const supabaseItemId = itemRows?.[0]?.id;
        const currentStockTotal = Number(itemRows?.[0]?.stock_total ?? 0);
        if (!supabaseItemId) {
            debugLog.push(`[syncItemStock] WARN: Item ${zohoItemId} not in DB`);
            return { snapshotsCreated: 0, stockTotal: 0 };
        }

        let stockTotal = 0;
        let mappedCount = 0;
        let unmappedCount = 0;
        const snapshots: any[] = [];

        for (const loc of locations) {
            const wh = warehouseMap.get(String(loc.location_id));
            const qty = toQty(loc.location_stock_on_hand ?? loc.location_available_stock);
            if (wh?.active) {
                stockTotal += qty;
            }
            if (!wh) {
                unmappedCount += 1;
                continue;
            }

            mappedCount += 1;
            snapshots.push({
                warehouse_id: wh.id,
                item_id: supabaseItemId,
                qty,
                source_ts: new Date().toISOString(),
                synced_at: new Date().toISOString(),
            });
        }

        if (locations.length === 0) {
            debugLog.push(`[syncItemStock] WARN: ${zohoItemId} returned 0 locations; preserving current snapshots`);
            return { snapshotsCreated: 0, stockTotal: currentStockTotal };
        }

        if (unmappedCount > 0) {
            debugLog.push(`[syncItemStock] WARN: ${zohoItemId} has ${unmappedCount} unmapped locations`);
            // Strict mapping mode:
            // preserve current snapshots/stock_total to avoid assigning stock to wrong warehouses.
            return { snapshotsCreated: 0, stockTotal: currentStockTotal };
        }

        // Evitar borrar snapshots existentes si no hubo ninguna ubicación mapeada.
        if (locations.length > 0 && mappedCount === 0) {
            const fallbackTotal = locations.reduce(
                (sum: number, loc: any) => sum + toQty(loc.location_stock_on_hand ?? loc.location_available_stock),
                0
            );
            const { error: fallbackUpdateError } = await supabase
                .from('items')
                .update({ stock_total: fallbackTotal })
                .eq('id', supabaseItemId);

            if (fallbackUpdateError) {
                debugLog.push(`[syncItemStock] ERROR fallback stock_total update: ${fallbackUpdateError.message}`);
            } else {
                debugLog.push(`[syncItemStock] WARN: no mapped locations for ${zohoItemId}; updated stock_total=${fallbackTotal} and preserved snapshots`);
            }

            return { snapshotsCreated: 0, stockTotal: fallbackTotal };
        }

        const { error: updateError } = await supabase
            .from('items')
            .update({ stock_total: stockTotal })
            .eq('id', supabaseItemId);
        if (updateError) {
            debugLog.push(`[syncItemStock] ERROR stock_total update: ${updateError.message}`);
            return { snapshotsCreated: 0, stockTotal };
        }

        const { error: deleteError } = await supabase
            .from('stock_snapshots')
            .delete()
            .eq('item_id', supabaseItemId);
        if (deleteError) {
            debugLog.push(`[syncItemStock] ERROR deleting old snapshots: ${deleteError.message}`);
            return { snapshotsCreated: 0, stockTotal };
        }

        let snapshotsCreated = 0;
        if (snapshots.length > 0) {
            const { error } = await supabase.from('stock_snapshots').insert(snapshots);
            if (!error) {
                snapshotsCreated = snapshots.length;
            } else {
                debugLog.push(`[syncItemStock] ERROR inserting snapshots: ${error.message}`);
            }
        }

        return { snapshotsCreated, stockTotal };
    } catch (err) {
        debugLog.push(`[syncItemStock] ERROR fatal: ${err instanceof Error ? err.message : 'Unknown'}`);
        return { snapshotsCreated: 0, stockTotal: 0 };
    }
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
                    notes: transferOrder.notes || '',
                    // Only set received_at if it's new receipt or keep existing?
                    // Simple logic: if status received, set date.
                    received_at: status === 'received' ? new Date().toISOString() : null
                }, { onConflict: 'zoho_transfer_order_id' });

            if (upsertError) {
                debugLog.push(`ERROR upserting transfer: ${upsertError.message}`);
            } else {
                debugLog.push('Transfer Order upserted successfully');
            }
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
                    state: customFields.cf_estado || null,
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
                }
            } else {
                debugLog.push('WARN: ITEM EVENT received without item_id');
            }
        }

        // --- Caso B: Stock Events ---
        if (isInventoryAdjustment || isCommonStockEvent) {
            debugLog.push(`Routing to STOCK EVENT handler`);

            const uniqueItemIds = collectItemIdsFromPayload(payload);
            debugLog.push(`Stock event item_ids detected: ${uniqueItemIds.length}`);

            for (const zohoId of uniqueItemIds) {
                await syncItemStock(zohoId, supabase, warehouseMap, debugLog);
            }
            if (uniqueItemIds.length === 0) {
                debugLog.push('WARN: STOCK EVENT without item_id; no sync executed');
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
