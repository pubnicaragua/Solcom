import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
    getAuthenticatedProfile,
    getWarehouseAccessScope,
    listWarehousesForScope,
} from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

function sanitizeSearchTerm(raw: string): string {
    return raw
        .trim()
        .replace(/[,%()'"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeItemState(value: unknown): 'NUEVO' | 'USADO' | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const upper = raw.toUpperCase();
    if (upper === 'NUEVO' || upper === 'NEW') return 'NUEVO';
    if (upper === 'USADO' || upper === 'USED' || upper === 'SEMINUEVO') return 'USADO';

    // Zoho lifecycle status is not a physical condition.
    if (upper === 'ACTIVE' || upper === 'INACTIVE') return null;

    return null;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = sanitizeSearchTerm(searchParams.get('search') || '');
        const warehouse = (searchParams.get('warehouse') || '').trim();
        const state = searchParams.get('state') || '';
        const category = searchParams.get('category') || '';
        const marca = searchParams.get('marca') || searchParams.get('brand') || '';
        const color = searchParams.get('color') || '';
        const stockLevel = searchParams.get('stockLevel') || '';
        const showZeroStock = searchParams.get('showZeroStock') !== 'false'; // default true

        const supabase = createRouteHandlerClient({ cookies });
        const auth = await getAuthenticatedProfile(supabase);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const moduleAccess = await getEffectiveModuleAccess(supabase, auth.userId, auth.role);
        if (!hasModuleAccess(moduleAccess, 'inventory')) {
            return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
        }

        const scope = await getWarehouseAccessScope(supabase, auth.userId, auth.role);
        if (!scope.canViewStock) {
            return NextResponse.json({
                warehouses: [],
                items: [],
                totalBeforeFilter: 0,
                selectedWarehouse: null,
            });
        }

        // 1) Fetch ACTIVE warehouses (columns) and ALL authorized warehouses (for total)
        const [activeWarehouses, allWarehouses] = await Promise.all([
            listWarehousesForScope(supabase, scope, { activeOnly: true }),
            listWarehousesForScope(supabase, scope, { activeOnly: false }),
        ]);

        const selectedWarehouse =
            (warehouse
                ? activeWarehouses.find((w: any) => w.id === warehouse || w.code === warehouse)
            : null) ||
            (warehouse
                ? allWarehouses.find((w: any) => w.id === warehouse || w.code === warehouse)
                : null) ||
            null;

        if (warehouse && !selectedWarehouse) {
            return NextResponse.json(
                { error: 'No tienes permiso para consultar esa bodega' },
                { status: 403 }
            );
        }

        if (allWarehouses.length === 0) {
            return NextResponse.json({
                warehouses: [],
                items: [],
                totalBeforeFilter: 0,
                selectedWarehouse: null,
            });
        }

        // 2) Fetch items with filters (search precision-first)
        const buildItemsQuery = (searchMode: 'prefix' | 'contains' | null) => {
            let itemsQuery = supabase
                .from('items')
                .select('id, sku, name, color, state, category, marca, stock_total, price, zoho_item_id')
                .is('zoho_removed_at', null);

            if (marca) itemsQuery = itemsQuery.eq('marca', marca);
            if (color) itemsQuery = itemsQuery.ilike('color', `%${color}%`);
            if (state) itemsQuery = itemsQuery.eq('state', state);
            if (category) itemsQuery = itemsQuery.ilike('category', `%${category}%`);

            if (search) {
                if (searchMode === 'prefix') {
                    itemsQuery = itemsQuery.or(`sku.eq.${search},sku.ilike.${search}%,name.ilike.${search}%`);
                } else if (searchMode === 'contains') {
                    itemsQuery = itemsQuery.or(`sku.ilike.%${search}%,name.ilike.%${search}%`);
                }
            }

            return itemsQuery;
        };

        const fetchAllItems = async (itemsQuery: any) => {
            const rows: any[] = [];
            let page = 0;
            const PAGE_SIZE = 1000;
            const MAX_PAGES = 500;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await itemsQuery
                    .order('name', { ascending: true })
                    .order('id', { ascending: true })
                    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

                if (error) throw error;

                if (data && data.length > 0) {
                    rows.push(...data);
                    if (data.length < PAGE_SIZE) {
                        hasMore = false;
                    } else {
                        page += 1;
                    }
                } else {
                    hasMore = false;
                }
                if (page > MAX_PAGES) break;
            }

            return rows;
        };

        let allItems: any[] = [];
        if (search) {
            allItems = await fetchAllItems(buildItemsQuery('prefix'));
            if (allItems.length === 0) {
                allItems = await fetchAllItems(buildItemsQuery('contains'));
            }
        } else {
            allItems = await fetchAllItems(buildItemsQuery(null));
        }

        console.log('Pivot API - active warehouses:', activeWarehouses.length, 'all warehouses:', allWarehouses.length, 'items:', allItems.length);

        // Deduplicate items by SKU — keep the one with zoho_item_id (preferred)
        const skuMap = new Map<string, any>();
        for (const item of allItems) {
            const existing = skuMap.get(item.sku);
            if (!existing) {
                skuMap.set(item.sku, item);
            } else {
                // Prefer the one with a zoho_item_id
                if (!existing.zoho_item_id && item.zoho_item_id) {
                    skuMap.set(item.sku, item);
                }
            }
        }
        let items = Array.from(skuMap.values());
        if (items.length === 0) {
            return NextResponse.json({
                warehouses: activeWarehouses.map(w => ({ code: w.code, name: w.name })),
                items: [],
                totalBeforeFilter: 0,
                selectedWarehouse: selectedWarehouse ? { id: selectedWarehouse.id, code: selectedWarehouse.code } : null,
            });
        }

        // Fast-path for warehouse filter:
        // first reduce candidate items before loading the full pivot breakdown.
        const ITEM_CHUNK = 250;
        let selectedWarehousePositiveItemIds: Set<string> | null = null;
        if (selectedWarehouse) {
            selectedWarehousePositiveItemIds = new Set<string>();
            const initialItemIds = items.map((i: any) => i.id);

            try {
                for (let i = 0; i < initialItemIds.length; i += ITEM_CHUNK) {
                    const itemChunk = initialItemIds.slice(i, i + ITEM_CHUNK);
                    const { data, error } = await (supabase.from as any)('inventory_balance')
                        .select('item_id, qty_on_hand')
                        .eq('warehouse_id', selectedWarehouse.id)
                        .in('item_id', itemChunk)
                        .gt('qty_on_hand', 0);

                    if (error) throw error;

                    for (const row of data || []) {
                        selectedWarehousePositiveItemIds.add(row.item_id);
                    }
                }
            } catch (warehouseFilterError) {
                // If inventory_balance is not available, fallback to latest snapshots.
                console.log('Pivot warehouse filter fallback to stock_snapshots:', warehouseFilterError);
                const SNAP_PAGE = 1000;
                for (let i = 0; i < initialItemIds.length; i += ITEM_CHUNK) {
                    const itemChunk = initialItemIds.slice(i, i + ITEM_CHUNK);
                    let snapPage = 0;
                    let snapHasMore = true;
                    const latestSeen = new Set<string>();

                    while (snapHasMore) {
                        const from = snapPage * SNAP_PAGE;
                        const to = from + SNAP_PAGE - 1;
                        const { data, error } = await supabase
                            .from('stock_snapshots')
                            .select('item_id, qty, synced_at')
                            .eq('warehouse_id', selectedWarehouse.id)
                            .in('item_id', itemChunk)
                            .order('synced_at', { ascending: false })
                            .range(from, to);

                        if (error) throw error;

                        const rows = data || [];
                        for (const snap of rows) {
                            if (latestSeen.has(snap.item_id)) continue;
                            latestSeen.add(snap.item_id);
                            if ((snap.qty ?? 0) > 0) {
                                selectedWarehousePositiveItemIds.add(snap.item_id);
                            }
                        }

                        if (rows.length < SNAP_PAGE) {
                            snapHasMore = false;
                        } else {
                            snapPage += 1;
                        }
                        if (snapPage > 50) break;
                    }
                }
            }

            items = items.filter((item: any) => selectedWarehousePositiveItemIds!.has(item.id));
            if (items.length === 0) {
                return NextResponse.json({
                    warehouses: activeWarehouses.map((w: any) => ({ code: w.code, name: w.name })),
                    items: [],
                    totalBeforeFilter: 0,
                    model: 'inventory_balance',
                    usedSnapshotGapFill: false,
                    selectedWarehouse: { id: selectedWarehouse.id, code: selectedWarehouse.code },
                });
            }
        }

        // 3) Resolve stock breakdown.
        // Prefer inventory_balance (v2 model). Fallback to stock_snapshots (legacy model).
        const itemIds = items.map((i: any) => i.id);
        const allWhIds = allWarehouses.map(w => w.id);
        const lotAgeByItem = new Map<string, number>();

        const latestSnap = new Map<string, number>();
        const itemsWithBreakdown = new Set<string>();
        let usingBalanceModel = false;
        let usedSnapshotGapFill = false;

        const BAL_PAGE = 1000;
        const LOT_PAGE = 1000;

        // Optional: lot aging metric ("remanente en dias").
        // Uses the oldest lot still in stock per item.
        try {
            for (let i = 0; i < itemIds.length; i += ITEM_CHUNK) {
                const itemChunk = itemIds.slice(i, i + ITEM_CHUNK);
                let page = 0;
                let hasMore = true;

                while (hasMore) {
                    const from = page * LOT_PAGE;
                    const to = from + LOT_PAGE - 1;
                    const { data, error } = await (supabase.from as any)('v_inventory_lot_aging')
                        .select('item_id, days_in_stock')
                        .in('item_id', itemChunk)
                        .range(from, to);

                    if (error) throw error;

                    const rows = data || [];
                    for (const row of rows) {
                        const current = lotAgeByItem.get(row.item_id);
                        if (current == null || (row.days_in_stock ?? 0) > current) {
                            lotAgeByItem.set(row.item_id, row.days_in_stock ?? 0);
                        }
                    }

                    if (rows.length < LOT_PAGE) {
                        hasMore = false;
                    } else {
                        page += 1;
                    }
                    if (page > 50) break;
                }
            }
        } catch (lotAgingError) {
            // View may not exist yet before inventory-v2.sql is applied.
            console.log('Pivot lot aging unavailable:', lotAgingError);
        }

        try {
            for (let i = 0; i < itemIds.length; i += ITEM_CHUNK) {
                const itemChunk = itemIds.slice(i, i + ITEM_CHUNK);
                let page = 0;
                let hasMore = true;

                while (hasMore) {
                    const from = page * BAL_PAGE;
                    const to = from + BAL_PAGE - 1;
                    const { data, error } = await (supabase.from as any)('inventory_balance')
                        .select('item_id, warehouse_id, qty_on_hand')
                        .in('item_id', itemChunk)
                        .in('warehouse_id', allWhIds)
                        .range(from, to);

                    if (error) {
                        throw error;
                    }

                    const rows = data || [];
                    for (const row of rows) {
                        latestSnap.set(`${row.item_id}__${row.warehouse_id}`, row.qty_on_hand ?? 0);
                        itemsWithBreakdown.add(row.item_id);
                    }

                    if (rows.length < BAL_PAGE) {
                        hasMore = false;
                    } else {
                        page += 1;
                    }
                    if (page > 50) break;
                }
            }
            usingBalanceModel = true;

            // Transitional compatibility:
            // if some items are still only in stock_snapshots (no inventory_balance row yet),
            // fill just those missing items from latest snapshots.
            const missingItemIds = itemIds.filter((id: string) => !itemsWithBreakdown.has(id));
            if (missingItemIds.length > 0) {
                const SNAP_PAGE = 1000;
                for (let i = 0; i < missingItemIds.length; i += ITEM_CHUNK) {
                    const itemChunk = missingItemIds.slice(i, i + ITEM_CHUNK);
                    let snapPage = 0;
                    let snapHasMore = true;

                    while (snapHasMore) {
                        const from = snapPage * SNAP_PAGE;
                        const to = from + SNAP_PAGE - 1;
                        const { data, error } = await supabase
                            .from('stock_snapshots')
                            .select('item_id, warehouse_id, qty, synced_at')
                            .in('item_id', itemChunk)
                            .in('warehouse_id', allWhIds)
                            .order('synced_at', { ascending: false })
                            .range(from, to);

                        if (error) {
                            console.error('Error gap-filling from snapshots:', error);
                            snapHasMore = false;
                            continue;
                        }

                        const rows = data || [];
                        for (const snap of rows) {
                            const key = `${snap.item_id}__${snap.warehouse_id}`;
                            if (!latestSnap.has(key)) {
                                latestSnap.set(key, snap.qty ?? 0);
                            }
                            itemsWithBreakdown.add(snap.item_id);
                        }

                        if (rows.length < SNAP_PAGE) {
                            snapHasMore = false;
                        } else {
                            snapPage += 1;
                        }
                        if (snapPage > 50) break;
                    }
                }
                usedSnapshotGapFill = true;
            }
        } catch (balanceError) {
            // Legacy fallback: if inventory_balance doesn't exist yet, keep current behavior.
            console.log('Pivot fallback to stock_snapshots:', balanceError);
            let allSnapshots: any[] = [];
            const SNAP_PAGE = 1000;

            for (let i = 0; i < itemIds.length; i += ITEM_CHUNK) {
                const itemChunk = itemIds.slice(i, i + ITEM_CHUNK);
                let snapPage = 0;
                let snapHasMore = true;

                while (snapHasMore) {
                    const from = snapPage * SNAP_PAGE;
                    const to = from + SNAP_PAGE - 1;
                    const { data, error } = await supabase
                        .from('stock_snapshots')
                        .select('item_id, warehouse_id, qty, synced_at')
                        .in('item_id', itemChunk)
                        .in('warehouse_id', allWhIds)
                        .order('synced_at', { ascending: false })
                        .range(from, to);

                    if (error) {
                        console.error('Error fetching snapshots page:', error);
                        snapHasMore = false;
                        continue;
                    }
                    if (data && data.length > 0) {
                        allSnapshots = allSnapshots.concat(data);
                        if (data.length < SNAP_PAGE) {
                            snapHasMore = false;
                        } else {
                            snapPage += 1;
                        }
                    } else {
                        snapHasMore = false;
                    }
                    if (snapPage > 50) break;
                }
            }

            for (const snap of allSnapshots) {
                const key = `${snap.item_id}__${snap.warehouse_id}`;
                if (!latestSnap.has(key)) {
                    latestSnap.set(key, snap.qty);
                }
                itemsWithBreakdown.add(snap.item_id);
            }
        }

        // 4) Build result: columns = active warehouses, total = ALL warehouses
        //    FALLBACK: if an item has NO snapshots at all, use items.stock_total
        const canUseStockTotalFallback = scope.allWarehouses;
        const resultItems = items.map((item: any) => {
            const warehouseQty: Record<string, number> = {};
            const hasBreakdown = itemsWithBreakdown.has(item.id);

            // Columns: only active warehouses
            for (const w of activeWarehouses) {
                const key = `${item.id}__${w.id}`;
                warehouseQty[w.code] = latestSnap.get(key) ?? 0;
            }

            // Total: sum ALL warehouses (active + inactive)
            let total = 0;
            if (hasBreakdown) {
                for (const w of allWarehouses) {
                    const key = `${item.id}__${w.id}`;
                    total += latestSnap.get(key) ?? 0;
                }
            } else {
                // No snapshots exist — use item's stock_total from Zoho sync as fallback
                total = canUseStockTotalFallback ? (item.stock_total ?? 0) : 0;
            }

            return {
                id: item.id,
                sku: item.sku,
                name: item.name,
                zoho_item_id: item.zoho_item_id ?? null,
                color: item.color || null,
                state: normalizeItemState(item.state),
                brand: item.marca || null,
                category: item.category || null,
                price: item.price ?? 0,
                warehouseQty,
                total,
                daysInStock: lotAgeByItem.get(item.id) ?? null,
                // Keep compatibility with existing frontend naming.
                hasSnapshots: hasBreakdown,
            };
        });

        // Warehouse filter: show only products with stock in selected warehouse.
        const itemsAfterWarehouseFilter = selectedWarehouse && selectedWarehousePositiveItemIds
            ? resultItems.filter((item) => selectedWarehousePositiveItemIds!.has(item.id))
            : resultItems;

        const itemsAfterStockLevel = stockLevel
            ? itemsAfterWarehouseFilter.filter((item) => {
                switch (stockLevel) {
                    case 'out':
                        return item.total === 0;
                    case 'positive':
                        return item.total > 0;
                    case 'critical':
                        return item.total >= 1 && item.total <= 5;
                    case 'low':
                        return item.total >= 6 && item.total <= 20;
                    case 'medium':
                        return item.total >= 21 && item.total <= 50;
                    case 'high':
                        return item.total > 50;
                    default:
                        return true;
                }
            })
            : itemsAfterWarehouseFilter;

        // Optionally filter out only zero-stock items (keep negatives visible).
        const finalItems = showZeroStock ? itemsAfterStockLevel : itemsAfterStockLevel.filter(i => i.total !== 0);

        return NextResponse.json({
            warehouses: activeWarehouses.map((w: any) => ({ code: w.code, name: w.name })),
            items: finalItems,
            totalBeforeFilter: itemsAfterStockLevel.length,
            model: usingBalanceModel ? 'inventory_balance' : 'stock_snapshots',
            usedSnapshotGapFill,
            selectedWarehouse: selectedWarehouse ? { id: selectedWarehouse.id, code: selectedWarehouse.code } : null,
        });
    } catch (error) {
        console.error('Pivot inventory error:', error);
        return NextResponse.json(
            { error: 'Error al obtener datos pivot', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
