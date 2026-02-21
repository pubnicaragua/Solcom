import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken, fetchItemLocations, AuthExpiredError } from '@/lib/zoho/inventory-utils';

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

export function isMissingRelationError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === '42P01' || message.includes('does not exist');
}

export async function replaceInventoryBalanceForItem(
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
): Promise<{ snapshotsCreated: number; stockTotal: number }> {
    const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    if (!organizationId) {
        debugLog.push(`[syncItemStock] ERROR: No ZOHO_BOOKS_ORGANIZATION_ID`);
        return { snapshotsCreated: 0, stockTotal: 0 };
    }

    let auth = existingAuth;
    if (!auth) {
        const fetchedAuth = await getZohoAccessToken();
        if (!fetchedAuth || 'error' in fetchedAuth) {
            debugLog.push(`[syncItemStock] ERROR auth: ${(fetchedAuth as any)?.error || 'Unknown'}`);
            return { snapshotsCreated: 0, stockTotal: 0 };
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
        const { data: itemRows } = await supabase
            .from('items')
            .select('id, stock_total')
            .eq('zoho_item_id', zohoItemId)
            .limit(1);

        let supabaseItemId = itemRows?.[0]?.id as string | undefined;
        let currentStockTotal = Number(itemRows?.[0]?.stock_total ?? 0);

        if (zohoItem) {
            const metadata = buildItemMetadata(zohoItem, zohoItemId);

            if (supabaseItemId) {
                // ALWAYS update metadata for existing items
                const { error: updateErr } = await supabase
                    .from('items')
                    .update({
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
                    debugLog.push(`[syncItemStock] WARN: metadata update failed: ${updateErr.message}`);
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
                        await supabase
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
                        insertedItem = bySku[0];
                        insertError = null;
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
                    debugLog.push(`[syncItemStock] WARN: Item ${zohoItemId} could not be created`);
                    return { snapshotsCreated: 0, stockTotal: 0 };
                }
            }
        } else if (!supabaseItemId) {
            debugLog.push(`[syncItemStock] WARN: Item ${zohoItemId} not in Zoho and not in DB`);
            return { snapshotsCreated: 0, stockTotal: 0 };
        }

        if (!supabaseItemId) {
            debugLog.push(`[syncItemStock] WARN: Item ${zohoItemId} could not be resolved locally`);
            return { snapshotsCreated: 0, stockTotal: 0 };
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
            debugLog.push(`[syncItemStock] WARN: ${zohoItemId} returned 0 locations; preserving current snapshots`);
            return { snapshotsCreated: 0, stockTotal: currentStockTotal };
        }

        if (unmappedCount > 0) {
            debugLog.push(`[syncItemStock] WARN: ${zohoItemId} has ${unmappedCount} unmapped locations`);
            return { snapshotsCreated: 0, stockTotal: currentStockTotal };
        }

        if (locations.length > 0 && mappedCount === 0) {
            const fallbackTotal = locations.reduce(
                (sum: number, loc: any) => sum + toQty(loc.location_stock_on_hand ?? loc.location_available_stock),
                0
            );
            await supabase
                .from('items')
                .update({ stock_total: fallbackTotal })
                .eq('id', supabaseItemId);
            debugLog.push(`[syncItemStock] WARN: no mapped locations for ${zohoItemId}; updated stock_total=${fallbackTotal}`);
            return { snapshotsCreated: 0, stockTotal: fallbackTotal };
        }

        // 5. Update stock_total
        const { error: updateError } = await supabase
            .from('items')
            .update({ stock_total: stockTotal })
            .eq('id', supabaseItemId);
        if (updateError) {
            debugLog.push(`[syncItemStock] ERROR stock_total update: ${updateError.message}`);
            return { snapshotsCreated: 0, stockTotal };
        }

        // 6. Replace snapshots
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

        // 7. Replace inventory_balance
        await replaceInventoryBalanceForItem(
            supabase,
            supabaseItemId,
            snapshots,
            mappedWarehouseIds,
            'sync',
            debugLog
        );

        return { snapshotsCreated, stockTotal };
    } catch (err) {
        debugLog.push(`[syncItemStock] ERROR fatal: ${err instanceof Error ? err.message : 'Unknown'}`);
        return { snapshotsCreated: 0, stockTotal: 0 };
    }
}
