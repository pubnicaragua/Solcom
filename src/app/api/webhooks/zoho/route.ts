
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

function normalizeItemState(value: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();

    if (upper === 'ACTIVE' || upper === 'INACTIVE') return null;
    if (upper === 'NEW' || upper === 'NUEVO') return 'NUEVO';
    if (upper === 'USED' || upper === 'USADO' || upper === 'SEMINUEVO') return 'USADO';

    return null;
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

async function fetchZohoItemDetails(
    accessToken: string,
    apiDomain: string,
    organizationId: string,
    itemId: string
): Promise<any | null> {
    const url = `${apiDomain}/inventory/v1/items/${itemId}?organization_id=${organizationId}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        return null;
    }

    const rawText = await response.text();
    if (!rawText) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawText);
        return parsed?.item ?? null;
    } catch {
        return null;
    }
}

function isMissingRelationError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === '42P01' || message.includes('does not exist');
}

async function replaceInventoryBalanceForItem(
    supabase: any,
    itemId: string,
    snapshots: Array<{ warehouse_id: string; qty: number }>,
    mappedWarehouseIds: string[],
    source: string,
    debugLog: string[]
): Promise<void> {
    if (!itemId || mappedWarehouseIds.length === 0) return;

    const DELETE_CHUNK = 200;
    for (let i = 0; i < mappedWarehouseIds.length; i += DELETE_CHUNK) {
        const warehouseBatch = mappedWarehouseIds.slice(i, i + DELETE_CHUNK);
        const { error: deleteError } = await supabase
            .from('inventory_balance')
            .delete()
            .eq('item_id', itemId)
            .in('warehouse_id', warehouseBatch);

        if (deleteError) {
            if (isMissingRelationError(deleteError)) {
                debugLog.push('[syncItemStock] WARN: inventory_balance table not found; skipping balance write');
                return;
            }
            debugLog.push(`[syncItemStock] ERROR deleting inventory_balance rows: ${deleteError.message}`);
            return;
        }
    }

    if (snapshots.length === 0) {
        return;
    }

    const nowIso = new Date().toISOString();
    const balanceRows = snapshots.map((snapshot) => ({
        item_id: itemId,
        warehouse_id: snapshot.warehouse_id,
        qty_on_hand: snapshot.qty ?? 0,
        source,
        source_ts: nowIso,
        updated_at: nowIso,
    }));

    const INSERT_CHUNK = 500;
    for (let i = 0; i < balanceRows.length; i += INSERT_CHUNK) {
        const batch = balanceRows.slice(i, i + INSERT_CHUNK);
        const { error: insertError } = await supabase
            .from('inventory_balance')
            .insert(batch);

        if (insertError) {
            if (isMissingRelationError(insertError)) {
                debugLog.push('[syncItemStock] WARN: inventory_balance table not found; skipping balance write');
                return;
            }
            debugLog.push(`[syncItemStock] ERROR inserting inventory_balance rows: ${insertError.message}`);
            return;
        }
    }
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

        let supabaseItemId = itemRows?.[0]?.id as string | undefined;
        let currentStockTotal = Number(itemRows?.[0]?.stock_total ?? 0);

        if (!supabaseItemId) {
            const zohoItem = await fetchZohoItemDetails(
                auth.accessToken,
                auth.apiDomain,
                organizationId,
                zohoItemId
            );

            const customFields = zohoItem?.custom_field_hash || {};
            const sku = String(zohoItem?.sku ?? '').trim() || `NO-SKU-${zohoItemId}`;
            const name = String(zohoItem?.name ?? '').trim() || sku;

            const createPayload: any = {
                sku,
                name,
                zoho_item_id: zohoItemId,
                color: String(customFields.cf_color ?? zohoItem?.color ?? '').trim() || null,
                state: normalizeItemState(customFields.cf_estado ?? customFields.cf_state ?? zohoItem?.status),
                marca: String(customFields.cf_marca ?? customFields.cf_brand ?? zohoItem?.brand ?? '').trim() || null,
                category: String(customFields.cf_categoria ?? zohoItem?.category_name ?? '').trim() || null,
                stock_total: 0,
                price: Number.isFinite(Number(zohoItem?.rate)) ? Number(zohoItem?.rate) : null,
                updated_at: new Date().toISOString(),
            };

            let { data: insertedItem, error: insertError } = await supabase
                .from('items')
                .insert(createPayload)
                .select('id, stock_total')
                .single();

            if (insertError) {
                // SKU may already exist locally. Try linking by SKU first, then by zoho_item_id.
                const { data: bySku } = await supabase
                    .from('items')
                    .select('id, stock_total')
                    .eq('sku', sku)
                    .limit(1);

                if (bySku?.[0]) {
                    const { error: linkError } = await supabase
                        .from('items')
                        .update({
                            zoho_item_id: zohoItemId,
                            name: createPayload.name,
                            color: createPayload.color,
                            state: createPayload.state,
                            marca: createPayload.marca,
                            category: createPayload.category,
                            price: createPayload.price,
                            updated_at: createPayload.updated_at,
                        })
                        .eq('id', bySku[0].id);

                    if (!linkError) {
                        insertedItem = bySku[0];
                        insertError = null;
                    }
                }

                if (insertError) {
                    const fallbackSku = `NO-SKU-${zohoItemId}`;
                    if (fallbackSku !== sku) {
                        const { data: fallbackInsert, error: fallbackError } = await supabase
                            .from('items')
                            .insert({ ...createPayload, sku: fallbackSku })
                            .select('id, stock_total')
                            .single();

                        if (!fallbackError) {
                            insertedItem = fallbackInsert;
                            insertError = null;
                        }
                    }
                }
            }

            if (!insertError && insertedItem?.id) {
                supabaseItemId = insertedItem.id;
                currentStockTotal = Number(insertedItem.stock_total ?? 0);
                debugLog.push(`[syncItemStock] Created local item for Zoho item ${zohoItemId}`);
            } else {
                debugLog.push(`[syncItemStock] WARN: Item ${zohoItemId} not in DB and could not be created`);
                return { snapshotsCreated: 0, stockTotal: 0 };
            }
        }

        if (!supabaseItemId) {
            debugLog.push(`[syncItemStock] WARN: Item ${zohoItemId} could not be resolved locally`);
            return { snapshotsCreated: 0, stockTotal: 0 };
        }

        const mappedWarehouseIds = Array.from(
            new Set(Array.from(warehouseMap.values()).map((warehouse) => warehouse.id))
        );

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

        await replaceInventoryBalanceForItem(
            supabase,
            supabaseItemId,
            snapshots,
            mappedWarehouseIds,
            'webhook',
            debugLog
        );

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
