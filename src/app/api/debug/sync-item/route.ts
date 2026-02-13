import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken, fetchItemLocations, AuthExpiredError } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function isMissingRelationError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === '42P01' || message.includes('does not exist');
}

function isForeignKeyError(error: any): boolean {
    return String(error?.code || '') === '23503';
}

function normalizeSku(value: unknown): string {
    return String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();
}

function candidateScore(item: any): number {
    const updatedAtMs = item?.updated_at ? new Date(item.updated_at).getTime() : 0;
    const safeTs = Number.isFinite(updatedAtMs) ? Math.floor(updatedAtMs / 1000) : 0;
    return (item?.zoho_item_id ? 1000 : 0)
        + (Number(item?.stock_total ?? 0) !== 0 ? 100 : 0)
        + safeTs;
}

async function existingWarehouseIdSet(supabase: any, warehouseIds: string[]): Promise<Set<string>> {
    const ids = Array.from(new Set(warehouseIds.filter(Boolean)));
    const result = new Set<string>();
    if (ids.length === 0) return result;

    const BATCH = 200;
    for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('warehouses')
            .select('id')
            .in('id', batch);

        if (error) {
            continue;
        }
        for (const row of data || []) {
            if (row?.id) result.add(row.id);
        }
    }
    return result;
}

export async function GET(request: NextRequest) {
    const logs: string[] = [];
    function log(msg: string, data?: any) {
        console.log(`[DEBUG-SYNC-ITEM] ${msg}`, data ? JSON.stringify(data) : '');
        logs.push(`${msg} ${data ? JSON.stringify(data) : ''}`);
    }

    try {
        const searchParams = request.nextUrl.searchParams;
        const sku = searchParams.get('sku');

        if (!sku) {
            return NextResponse.json({ error: 'sku param required' }, { status: 400 });
        }

        log(`Starting debug sync for SKU: ${sku}`);

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            log('WARN: SUPABASE_SERVICE_ROLE_KEY missing; debug endpoint using anon key');
        }

        const normalizedInput = normalizeSku(sku);
        const { data: itemRows, error: itemError } = await supabase
            .from('items')
            .select('*')
            .ilike('sku', sku.trim())
            .order('updated_at', { ascending: false })
            .limit(50);

        if (itemError || !itemRows || itemRows.length === 0) {
            log('Item not found in Supabase', itemError);
            return NextResponse.json({ logs, error: 'Item not found' });
        }

        const exactCandidates = itemRows.filter((row: any) => normalizeSku(row.sku) === normalizedInput);
        const candidates = exactCandidates.length > 0 ? exactCandidates : itemRows;
        candidates.sort((a: any, b: any) => candidateScore(b) - candidateScore(a));
        const item = candidates[0];

        if (candidates.length > 1) {
            log(`WARN: found ${candidates.length} local candidates for SKU ${sku}; using id ${item.id}`);
        }

        if (!item?.zoho_item_id) {
            log('Item has no zoho_item_id, aborting fetch');
            return NextResponse.json({
                success: false,
                reason: 'missing_zoho_item_id',
                item: { id: item.id, sku: item.sku, name: item.name },
                candidates: candidates.slice(0, 10).map((row: any) => ({
                    id: row.id,
                    sku: row.sku,
                    zoho_item_id: row.zoho_item_id,
                    stock_total: row.stock_total,
                    updated_at: row.updated_at,
                })),
                logs,
            });
        }

        log(`Found local item: ${item.name} (${item.zoho_item_id})`);

        const { data: warehouses } = await supabase
            .from('warehouses')
            .select('id, code, zoho_warehouse_id, active');

        const warehouseRows = warehouses || [];
        const warehouseMap = new Map(
            warehouseRows
                .filter((w: any) => w.zoho_warehouse_id)
                .map((w: any) => [String(w.zoho_warehouse_id), { id: w.id, code: w.code, active: w.active }])
        );

        const mappedWarehouseIds = Array.from(
            new Set(warehouseRows.filter((w: any) => !!w.zoho_warehouse_id).map((w: any) => w.id))
        );

        log(`Loaded ${warehouseRows.length} warehouses. Map size: ${warehouseMap.size}`);

        log('Authenticating with Zoho...');
        const auth = await getZohoAccessToken();
        if ('error' in auth) {
            log('Auth error', auth.error);
            return NextResponse.json({ logs, error: auth.error });
        }

        const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        log(`Using Org ID: ${orgId}`);

        const start = Date.now();
        log(`Fetching locations for item ID ${item.zoho_item_id} from Zoho...`);

        let locations: any[] = [];
        try {
            locations = await fetchItemLocations(
                auth.accessToken,
                auth.apiDomain,
                orgId!,
                item.zoho_item_id
            );
        } catch (err: any) {
            if (err instanceof AuthExpiredError) {
                log('Token expired on first attempt, refreshing and retrying...');
                const retryAuth = await getZohoAccessToken();
                if ('error' in retryAuth) {
                    log(`CRITICAL FETCH ERROR after refresh auth: ${retryAuth.error}`);
                    return NextResponse.json({ logs, error: retryAuth.error });
                }
                try {
                    locations = await fetchItemLocations(
                        retryAuth.accessToken,
                        retryAuth.apiDomain,
                        orgId!,
                        item.zoho_item_id
                    );
                } catch (retryErr: any) {
                    log(`CRITICAL FETCH ERROR after retry: ${retryErr.message}`);
                    return NextResponse.json({ logs, error: retryErr.message });
                }
            } else {
                log(`CRITICAL FETCH ERROR: ${err.message}`);
                return NextResponse.json({ logs, error: err.message });
            }
        }
        log(`Fetch took ${Date.now() - start}ms. Received ${locations.length} locations.`);

        const preparedSnapshots: any[] = [];
        let mappedCount = 0;
        let ignoredCount = 0;

        for (const loc of locations) {
            const locId = String(loc.location_id);
            const wh = warehouseMap.get(locId);
            const qtyRaw = loc.location_stock_on_hand ?? loc.location_available_stock;
            const qty = Number.isFinite(Number(qtyRaw)) ? Number(qtyRaw) : 0;

            if (!wh?.id) {
                ignoredCount += 1;
                log(`MISSING MAPPING: Zoho '${loc.location_name}' (${locId}) not found in Supabase! Qty: ${qty}`);
                continue;
            }

            mappedCount += 1;
            log(`MATCH: Zoho '${loc.location_name}' (${locId}) -> Local '${wh.code}' (${wh.id}). Qty: ${qty}`);

            preparedSnapshots.push({
                warehouse_id: wh.id,
                item_id: item.id,
                qty,
                source_ts: new Date().toISOString(),
                synced_at: new Date().toISOString(),
            });

            if (!wh.active) {
                log(`NOTE: Warehouse ${wh.code} is INACTIVE. Qty ${qty} not added to cleanStock.`);
            }
        }

        if (ignoredCount > 0) {
            log('STRICT MODE: item has unmapped locations, preserving current snapshots/stock_total');
            return NextResponse.json({
                success: false,
                preserved: true,
                reason: 'unmapped_locations',
                sku: item.sku,
                snapshotsPrepared: preparedSnapshots.length,
                mappedCount,
                ignoredCount,
                zohoLocations: locations,
                logs,
            });
        }

        if (locations.length === 0) {
            log('STRICT MODE: Zoho returned 0 locations, preserving current snapshots/stock_total');
            return NextResponse.json({
                success: false,
                preserved: true,
                reason: 'no_locations',
                sku: item.sku,
                snapshotsPrepared: 0,
                mappedCount,
                ignoredCount,
                zohoLocations: locations,
                logs,
            });
        }

        const existingSet = await existingWarehouseIdSet(
            supabase,
            preparedSnapshots.map((snapshot) => snapshot.warehouse_id)
        );

        let snapshots = preparedSnapshots.filter((snapshot) => existingSet.has(snapshot.warehouse_id));
        const droppedByMissingFk = preparedSnapshots.length - snapshots.length;
        if (droppedByMissingFk > 0) {
            log(`WARN: dropped ${droppedByMissingFk} snapshots with missing warehouse FK before insert`);
        }

        if (snapshots.length === 0) {
            log('No valid mapped warehouses remained after FK validation');
            return NextResponse.json({
                success: false,
                preserved: true,
                reason: 'no_valid_warehouses',
                sku: item.sku,
                snapshotsPrepared: preparedSnapshots.length,
                snapshotsValid: 0,
                mappedCount,
                ignoredCount,
                logs,
            });
        }

        const activeWarehouseSet = new Set(
            warehouseRows
                .filter((w: any) => !!w.active && existingSet.has(w.id))
                .map((w: any) => w.id)
        );
        const cleanStock = snapshots.reduce((sum, snapshot) => (
            activeWarehouseSet.has(snapshot.warehouse_id) ? sum + (snapshot.qty ?? 0) : sum
        ), 0);

        log(`Final Stats: Mapped ${mappedCount}, Ignored ${ignoredCount}, Clean Stock Sum: ${cleanStock}`);

        let snapshotsWriteOk = true;
        let itemWriteOk = true;
        let inventoryBalanceWriteOk = true;

        log('Deleting old snapshots...');
        const { error: deleteSnapshotsError } = await supabase
            .from('stock_snapshots')
            .delete()
            .eq('item_id', item.id);
        if (deleteSnapshotsError) {
            snapshotsWriteOk = false;
            log('Delete snapshots error', deleteSnapshotsError);
        }

        if (snapshotsWriteOk) {
            log(`Inserting ${snapshots.length} new snapshots...`);
            let { error: insertError } = await supabase.from('stock_snapshots').insert(snapshots);

            if (insertError && isForeignKeyError(insertError)) {
                log('Insert snapshots FK error, retrying after live warehouse validation', insertError);
                const retrySet = await existingWarehouseIdSet(
                    supabase,
                    snapshots.map((snapshot) => snapshot.warehouse_id)
                );
                snapshots = snapshots.filter((snapshot) => retrySet.has(snapshot.warehouse_id));

                if (snapshots.length === 0) {
                    snapshotsWriteOk = false;
                    log('Retry canceled: no valid warehouses left');
                } else {
                    const retryDelete = await supabase
                        .from('stock_snapshots')
                        .delete()
                        .eq('item_id', item.id);
                    if (retryDelete.error) {
                        snapshotsWriteOk = false;
                        log('Retry delete snapshots error', retryDelete.error);
                    } else {
                        const retryInsert = await supabase.from('stock_snapshots').insert(snapshots);
                        insertError = retryInsert.error;
                    }
                }
            }

            if (insertError) {
                snapshotsWriteOk = false;
                log('Insert snapshots error', insertError);
            }
        }

        if (snapshotsWriteOk) {
            log(`Updating item stock_total to ${cleanStock}...`);
            const { error: updateError } = await supabase
                .from('items')
                .update({ stock_total: cleanStock })
                .eq('id', item.id);

            if (updateError) {
                itemWriteOk = false;
                log('Update item error', updateError);
            }
        } else {
            itemWriteOk = false;
            log('Skipping stock_total update because snapshots write failed');
        }

        let inventoryBalanceUpdated = 0;
        if (mappedWarehouseIds.length > 0) {
            log('Replacing inventory_balance rows for this item...');
            const liveMappedSet = await existingWarehouseIdSet(supabase, mappedWarehouseIds);
            const liveMappedIds = Array.from(liveMappedSet);

            if (liveMappedIds.length > 0) {
                const { error: deleteBalanceError } = await (supabase.from as any)('inventory_balance')
                    .delete()
                    .eq('item_id', item.id)
                    .in('warehouse_id', liveMappedIds);

                if (deleteBalanceError) {
                    if (isMissingRelationError(deleteBalanceError)) {
                        log('WARN: inventory_balance table not found, skipping');
                    } else {
                        inventoryBalanceWriteOk = false;
                        log('inventory_balance delete error', deleteBalanceError);
                    }
                } else if (snapshots.length > 0) {
                    const nowIso = new Date().toISOString();
                    const balanceRows = snapshots.map((snapshot: any) => ({
                        item_id: item.id,
                        warehouse_id: snapshot.warehouse_id,
                        qty_on_hand: snapshot.qty ?? 0,
                        source: 'debug_sync_item',
                        source_ts: nowIso,
                        updated_at: nowIso,
                    }));

                    const { error: insertBalanceError } = await (supabase.from as any)('inventory_balance').insert(balanceRows as any);
                    if (insertBalanceError) {
                        if (isMissingRelationError(insertBalanceError)) {
                            log('WARN: inventory_balance table not found on insert, skipping');
                        } else if (isForeignKeyError(insertBalanceError)) {
                            const retrySet = await existingWarehouseIdSet(
                                supabase,
                                balanceRows.map((row) => row.warehouse_id)
                            );
                            const retryRows = balanceRows.filter((row) => retrySet.has(row.warehouse_id));
                            if (retryRows.length === 0) {
                                inventoryBalanceWriteOk = false;
                                log('inventory_balance retry canceled: no valid warehouses');
                            } else {
                                const retry = await (supabase.from as any)('inventory_balance').insert(retryRows as any);
                                if (retry.error) {
                                    inventoryBalanceWriteOk = false;
                                    log('inventory_balance retry insert error', retry.error);
                                } else {
                                    inventoryBalanceUpdated = retryRows.length;
                                    log(`Inserted ${inventoryBalanceUpdated} inventory_balance rows (retry)`);
                                }
                            }
                        } else {
                            inventoryBalanceWriteOk = false;
                            log('inventory_balance insert error', insertBalanceError);
                        }
                    } else {
                        inventoryBalanceUpdated = balanceRows.length;
                        log(`Inserted ${inventoryBalanceUpdated} inventory_balance rows`);
                    }
                }
            }
        }

        const { data: itemAfter } = await supabase
            .from('items')
            .select('stock_total, updated_at')
            .eq('id', item.id)
            .single();

        const { count: snapshotsInDb } = await supabase
            .from('stock_snapshots')
            .select('*', { count: 'exact', head: true })
            .eq('item_id', item.id);

        let inventoryBalanceInDb: number | null = null;
        const balanceCount = await (supabase.from as any)('inventory_balance')
            .select('*', { count: 'exact', head: true })
            .eq('item_id', item.id);
        if (!balanceCount.error) {
            inventoryBalanceInDb = balanceCount.count ?? 0;
        } else if (!isMissingRelationError(balanceCount.error)) {
            inventoryBalanceWriteOk = false;
            log('Count inventory_balance error', balanceCount.error);
        }

        return NextResponse.json({
            success: snapshotsWriteOk && itemWriteOk && inventoryBalanceWriteOk,
            sku: item.sku,
            cleanStock,
            snapshotsCreated: snapshots.length,
            inventoryBalanceUpdated,
            mappedCount,
            ignoredCount,
            snapshotsWriteOk,
            itemWriteOk,
            inventoryBalanceWriteOk,
            dbCheck: {
                itemId: item.id,
                itemStockTotal: itemAfter?.stock_total ?? null,
                itemUpdatedAt: itemAfter?.updated_at ?? null,
                snapshotsInDb: snapshotsInDb ?? null,
                inventoryBalanceInDb,
            },
            zohoLocations: locations,
            logs,
        });

    } catch (error: any) {
        log('GLOBAL ERROR', error.message);
        return NextResponse.json({
            error: error.message,
            logs,
        }, { status: 500 });
    }
}
