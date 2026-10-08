import { getZohoAccessToken, fetchItemLocations } from '@/lib/zoho/inventory-utils';
import { getZohoOrganizationId } from '@/lib/zoho/config';

export type SyncItemStockResult = {
    success: boolean;
    retryable: boolean;
    snapshotsCreated: number;
    stockTotal: number;
    error?: string;
};

function failedSyncResult(
    error: string,
    stockTotal = 0,
    retryable = true
): SyncItemStockResult {
    return {
        success: false,
        retryable,
        snapshotsCreated: 0,
        stockTotal,
        error,
    };
}

export function toQty(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

export function normalizeItemId(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const itemId = String(value).trim();
    return itemId.length > 0 ? itemId : null;
}

export function normalizeItemState(value: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();

    // ACTIVE/INACTIVE are Zoho statuses, not our state values
    if (upper === 'ACTIVE' || upper === 'INACTIVE') return null;
    if (upper === 'NEW' || upper === 'NUEVO') return 'NUEVO';
    if (upper === 'USED' || upper === 'USADO' || upper === 'SEMINUEVO') return 'USADO';

    return null;
}

export async function fetchZohoItemDetails(
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
        const errorText = await response.text();
        if (response.status === 404) return null;
        throw new Error(
            `Zoho Inventory item detail error: ${response.status} - ${errorText.slice(0, 300)}`
        );
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

export function isMissingRelationError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === '42P01' || message.includes('does not exist');
}

function isMissingRpcError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === 'PGRST202'
        || code === '42883'
        || message.includes('could not find the function');
}

export async function replaceInventoryBalanceForItem(
    supabase: any,
    itemId: string,
    snapshots: Array<{ warehouse_id: string; qty: number }>,
    mappedWarehouseIds: string[],
    source: string,
    debugLog: string[]
): Promise<{ success: boolean; error?: string }> {
    if (!itemId || mappedWarehouseIds.length === 0) {
        return { success: false, error: 'No hay item o bodegas mapeadas para inventory_balance.' };
    }

    const nowIso = new Date().toISOString();
    const qtyByWarehouse = new Map(
        snapshots.map((snapshot) => [snapshot.warehouse_id, snapshot.qty ?? 0])
    );
    // Zoho devuelve el estado absoluto. Escribimos también ceros para evitar
    // que sobreviva stock viejo cuando una ubicación deja de venir en la lista.
    const balanceRows = mappedWarehouseIds.map((warehouseId) => ({
        item_id: itemId,
        warehouse_id: warehouseId,
        qty_on_hand: qtyByWarehouse.get(warehouseId) ?? 0,
        source,
        source_ts: nowIso,
        updated_at: nowIso,
    }));

    const INSERT_CHUNK = 500;
    for (let i = 0; i < balanceRows.length; i += INSERT_CHUNK) {
        const batch = balanceRows.slice(i, i + INSERT_CHUNK);
        const { error: insertError } = await supabase
            .from('inventory_balance')
            .upsert(batch, { onConflict: 'item_id,warehouse_id' });

        if (insertError) {
            if (isMissingRelationError(insertError)) {
                const error = 'inventory_balance table not found';
                debugLog.push(`[syncItemStock] ERROR: ${error}`);
                return { success: false, error };
            }
            debugLog.push(`[syncItemStock] ERROR inserting inventory_balance rows: ${insertError.message}`);
            return { success: false, error: insertError.message };
        }
    }

    return { success: true };
}

async function persistInventoryStockState(params: {
    supabase: any;
    itemId: string;
    stockTotal: number;
    snapshots: Array<{
        warehouse_id: string;
        qty: number;
        source_ts: string;
        synced_at: string;
    }>;
    mappedWarehouseIds: string[];
    source: string;
    debugLog: string[];
}): Promise<{ success: boolean; snapshotsCreated: number; error?: string }> {
    const {
        supabase,
        itemId,
        stockTotal,
        snapshots,
        mappedWarehouseIds,
        source,
        debugLog,
    } = params;
    const nowIso = new Date().toISOString();
    const qtyByWarehouse = new Map(
        snapshots.map((snapshot) => [snapshot.warehouse_id, snapshot.qty ?? 0])
    );
    const balanceRows = mappedWarehouseIds.map((warehouseId) => ({
        warehouse_id: warehouseId,
        qty_on_hand: qtyByWarehouse.get(warehouseId) ?? 0,
        source_ts: nowIso,
    }));

    const rpcResult = await supabase.rpc('replace_inventory_item_stock', {
        p_item_id: itemId,
        p_stock_total: stockTotal,
        p_snapshots: snapshots.map((snapshot) => ({
            warehouse_id: snapshot.warehouse_id,
            qty: snapshot.qty,
            source_ts: snapshot.source_ts,
            synced_at: snapshot.synced_at,
        })),
        p_balances: balanceRows,
        p_source: source,
    });

    if (!rpcResult.error) {
        return { success: true, snapshotsCreated: snapshots.length };
    }

    if (!isMissingRpcError(rpcResult.error)) {
        return {
            success: false,
            snapshotsCreated: 0,
            error: `atomic inventory write failed: ${rpcResult.error.message}`,
        };
    }

    // Compatibilidad mientras se aplica la migración. Después de activarla,
    // este camino deja de ejecutarse y las tres escrituras son transaccionales.
    debugLog.push('[syncItemStock] WARN: atomic inventory RPC missing; using rollout fallback');

    const itemUpdate = await supabase
        .from('items')
        .update({ stock_total: stockTotal, updated_at: nowIso })
        .eq('id', itemId);
    if (itemUpdate.error) {
        return { success: false, snapshotsCreated: 0, error: itemUpdate.error.message };
    }

    const snapshotDelete = await supabase
        .from('stock_snapshots')
        .delete()
        .eq('item_id', itemId);
    if (snapshotDelete.error) {
        return { success: false, snapshotsCreated: 0, error: snapshotDelete.error.message };
    }

    if (snapshots.length > 0) {
        const snapshotInsert = await supabase.from('stock_snapshots').insert(snapshots);
        if (snapshotInsert.error) {
            return { success: false, snapshotsCreated: 0, error: snapshotInsert.error.message };
        }
    }

    const balanceResult = await replaceInventoryBalanceForItem(
        supabase,
        itemId,
        snapshots,
        mappedWarehouseIds,
        source,
        debugLog
    );
    if (!balanceResult.success) {
        return {
            success: false,
            snapshotsCreated: snapshots.length,
            error: balanceResult.error,
        };
    }

    return { success: true, snapshotsCreated: snapshots.length };
}

// Helper: build item metadata payload from Zoho item details
function buildItemMetadata(zohoItem: any, zohoItemId: string) {
    const customFields = zohoItem?.custom_field_hash || {};
    const sku = String(zohoItem?.sku ?? '').trim() || `NO-SKU-${zohoItemId}`;
    const name = String(zohoItem?.name ?? '').trim() || sku;

    return {
        sku,
        name,
        zoho_item_id: zohoItemId,
        color: String(customFields.cf_color ?? zohoItem?.color ?? '').trim() || null,
        state: normalizeItemState(customFields.cf_estado ?? customFields.cf_state ?? zohoItem?.status),
        marca: String(customFields.cf_marca ?? customFields.cf_brand ?? zohoItem?.brand ?? '').trim() || null,
        category: String(customFields.cf_categoria ?? zohoItem?.category_name ?? '').trim() || null,
        price: (() => {
            const purchaseRate = Number(zohoItem?.purchase_rate);
            const salesRate = Number(zohoItem?.rate);
            return Number.isFinite(purchaseRate) && purchaseRate > 0
                ? purchaseRate
                : (Number.isFinite(salesRate) ? salesRate : null);
        })(),
        updated_at: new Date().toISOString(),
    };
}

// =============================================
// Helper: sincronizar stock de UN item por zoho_item_id
// =============================================
export async function syncItemStock(
    zohoItemId: string,
    supabase: any,
    warehouseMap: Map<string, { id: string; active: boolean }>,
    debugLog: string[],
    existingAuth?: { accessToken: string; apiDomain: string }
): Promise<SyncItemStockResult> {
    let organizationId: string | null = null;
    try {
        organizationId = getZohoOrganizationId();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Organización Zoho inválida';
        debugLog.push(`[syncItemStock] ERROR: ${message}`);
        return failedSyncResult(message, 0, false);
    }

    if (!organizationId) {
        const message = 'No ZOHO_BOOKS_ORGANIZATION_ID';
        debugLog.push(`[syncItemStock] ERROR: ${message}`);
        return failedSyncResult(message, 0, false);
    }

    let auth = existingAuth;
    if (!auth) {
        const fetchedAuth = await getZohoAccessToken();
        if (!fetchedAuth || 'error' in fetchedAuth) {
            const message = String((fetchedAuth as any)?.error || 'Unknown auth error');
            debugLog.push(`[syncItemStock] ERROR auth: ${message}`);
            return failedSyncResult(message);
        }
        auth = {
            accessToken: fetchedAuth.accessToken as string,
            apiDomain: fetchedAuth.apiDomain as string
        };
    }

    try {
        // 1. Fetch locations (stock per warehouse) from Zoho
        const locations = await fetchItemLocations(
            auth.accessToken,
            auth.apiDomain,
            organizationId,
            zohoItemId
        );

        // 2. Fetch item details from Zoho (ALWAYS, for metadata refresh)
        const zohoItem = await fetchZohoItemDetails(
            auth.accessToken,
            auth.apiDomain,
            organizationId,
            zohoItemId
        );

        // 3. Find or create item in Supabase
        const { data: itemRows, error: itemLookupError } = await supabase
            .from('items')
            .select('id, stock_total')
            .eq('zoho_item_id', zohoItemId)
            .limit(1);

        if (itemLookupError) {
            const message = `local item lookup failed: ${itemLookupError.message}`;
            debugLog.push(`[syncItemStock] ERROR: ${message}`);
            return failedSyncResult(message);
        }

        let supabaseItemId = itemRows?.[0]?.id as string | undefined;
        let currentStockTotal = Number(itemRows?.[0]?.stock_total ?? 0);

        if (zohoItem) {
            const metadata = buildItemMetadata(zohoItem, zohoItemId);

            if (supabaseItemId) {
                // ALWAYS update metadata for existing items
                const { error: updateErr } = await supabase
                    .from('items')
                    .update({
                        sku: metadata.sku,
                        name: metadata.name,
                        color: metadata.color,
                        state: metadata.state,
                        marca: metadata.marca,
                        category: metadata.category,
                        price: metadata.price,
                        updated_at: metadata.updated_at,
                    })
                    .eq('id', supabaseItemId);

                if (updateErr) {
                    const message = `metadata update failed: ${updateErr.message}`;
                    debugLog.push(`[syncItemStock] ERROR: ${message}`);
                    return failedSyncResult(message, currentStockTotal);
                }
            } else {
                // Create new item
                let { data: insertedItem, error: insertError } = await supabase
                    .from('items')
                    .insert({ ...metadata, stock_total: 0 })
                    .select('id, stock_total')
                    .single();

                if (insertError) {
                    // SKU conflict — try linking by SKU
                    const { data: bySku } = await supabase
                        .from('items')
                        .select('id, stock_total')
                        .eq('sku', metadata.sku)
                        .limit(1);

                    if (bySku?.[0]) {
                        const { error: linkError } = await supabase
                            .from('items')
                            .update({
                                zoho_item_id: zohoItemId,
                                name: metadata.name,
                                color: metadata.color,
                                state: metadata.state,
                                marca: metadata.marca,
                                category: metadata.category,
                                price: metadata.price,
                                updated_at: metadata.updated_at,
                            })
                            .eq('id', bySku[0].id);
                        if (!linkError) {
                            insertedItem = bySku[0];
                            insertError = null;
                        } else {
                            debugLog.push(`[syncItemStock] ERROR linking item by SKU: ${linkError.message}`);
                        }
                    }

                    if (insertError) {
                        // Last resort: fallback SKU
                        const fallbackSku = `NO-SKU-${zohoItemId}`;
                        if (fallbackSku !== metadata.sku) {
                            const { data: fallbackInsert, error: fallbackError } = await supabase
                                .from('items')
                                .insert({ ...metadata, sku: fallbackSku, stock_total: 0 })
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
                    const message = `Item ${zohoItemId} could not be created`;
                    debugLog.push(`[syncItemStock] ERROR: ${message}`);
                    return failedSyncResult(message, 0, false);
                }
            }
        } else if (!supabaseItemId) {
            const message = `Item ${zohoItemId} not in Zoho and not in DB`;
            debugLog.push(`[syncItemStock] ERROR: ${message}`);
            return failedSyncResult(message, 0, false);
        }

        if (!supabaseItemId) {
            const message = `Item ${zohoItemId} could not be resolved locally`;
            debugLog.push(`[syncItemStock] ERROR: ${message}`);
            return failedSyncResult(message, 0, false);
        }

        // 4. Process locations → snapshots
        const mappedWarehouseIds = Array.from(
            new Set(Array.from(warehouseMap.values()).map((warehouse) => warehouse.id))
        );

        let stockTotal = 0;
        let mappedCount = 0;
        let unmappedCount = 0;
        const snapshotMap = new Map<string, any>();

        for (const loc of locations) {
            const wh = warehouseMap.get(String(loc.location_id));
            const qty = toQty(loc.location_stock_on_hand ?? loc.location_available_stock);
            if (!wh) {
                unmappedCount += 1;
                continue;
            }

            stockTotal += qty;
            mappedCount += 1;

            if (snapshotMap.has(wh.id)) {
                const existing = snapshotMap.get(wh.id);
                existing.qty += qty;
            } else {
                snapshotMap.set(wh.id, {
                    warehouse_id: wh.id,
                    item_id: supabaseItemId,
                    qty,
                    source_ts: new Date().toISOString(),
                    synced_at: new Date().toISOString(),
                });
            }
        }

        const snapshots = Array.from(snapshotMap.values());

        if (locations.length === 0) {
            const message = `${zohoItemId} returned 0 locations; preserving current snapshots`;
            debugLog.push(`[syncItemStock] ERROR: ${message}`);
            return failedSyncResult(message, currentStockTotal);
        }

        if (unmappedCount > 0) {
            const message = `${zohoItemId} has ${unmappedCount} unmapped locations`;
            debugLog.push(`[syncItemStock] ERROR: ${message}`);
            return failedSyncResult(message, currentStockTotal);
        }

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
                const message = `fallback stock_total update failed: ${fallbackUpdateError.message}`;
                debugLog.push(`[syncItemStock] ERROR: ${message}`);
                return failedSyncResult(message, currentStockTotal);
            }
            const message = `no mapped locations for ${zohoItemId}`;
            debugLog.push(`[syncItemStock] ERROR: ${message}; stock_total=${fallbackTotal}`);
            return failedSyncResult(message, fallbackTotal);
        }

        // 5. Publicar total, snapshots y balances como una sola transacción.
        const persistResult = await persistInventoryStockState({
            supabase,
            itemId: supabaseItemId,
            stockTotal,
            snapshots,
            mappedWarehouseIds,
            source: 'sync',
            debugLog,
        });

        if (!persistResult.success) {
            debugLog.push(`[syncItemStock] ERROR persisting inventory: ${persistResult.error}`);
            return failedSyncResult(
                persistResult.error || 'No se pudo publicar el inventario',
                stockTotal
            );
        }

        return {
            success: true,
            retryable: false,
            snapshotsCreated: persistResult.snapshotsCreated,
            stockTotal,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown';
        debugLog.push(`[syncItemStock] ERROR fatal: ${message}`);
        return failedSyncResult(message);
    }
}
