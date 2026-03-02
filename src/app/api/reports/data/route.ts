import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
    getAuthenticatedProfile,
    getWarehouseAccessScope,
    isWarehouseAllowed,
    listWarehousesForScope,
} from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

export const dynamic = 'force-dynamic';

function containsInsensitive(haystack: unknown, needle: string): boolean {
    const text = String(haystack ?? '').trim().toLowerCase();
    const query = String(needle ?? '').trim().toLowerCase();
    if (!query) return true;
    return text.includes(query);
}

function equalsInsensitive(value: unknown, expected: string): boolean {
    const left = String(value ?? '').trim().toLowerCase();
    const right = String(expected ?? '').trim().toLowerCase();
    if (!right) return true;
    return left === right;
}

function normalizeReportItem(row: any) {
    return {
        id: String(row?.id ?? '').trim(),
        sku: String(row?.sku ?? '').trim(),
        name: String(row?.name ?? '').trim(),
        category: String(row?.category ?? '').trim() || null,
        marca: String(row?.marca ?? '').trim() || null,
        state: String(row?.state ?? '').trim() || null,
        color: String(row?.color ?? '').trim() || null,
        price: Number(row?.price ?? 0) || 0,
        updated_at: row?.updated_at || null,
        zoho_removed_at: row?.zoho_removed_at ?? null,
    };
}

function applyItemFilters(
    items: Array<ReturnType<typeof normalizeReportItem>>,
    filters: { category: string; marca: string; state: string; color: string }
) {
    return items.filter((item) => {
        // Soft-delete guard only when column exists in current DB schema rows.
        if (item.zoho_removed_at) return false;
        if (filters.category && !containsInsensitive(item.category, filters.category)) return false;
        if (filters.marca && !equalsInsensitive(item.marca, filters.marca)) return false;
        if (filters.state && !equalsInsensitive(item.state, filters.state)) return false;
        if (filters.color && !containsInsensitive(item.color, filters.color)) return false;
        return true;
    });
}

async function getScopedTotalsForItems(
    supabase: ReturnType<typeof createRouteHandlerClient>,
    itemIds: string[],
    allowedWarehouseIds: string[]
) {
    const totals = new Map<string, number>();
    if (itemIds.length === 0 || allowedWarehouseIds.length === 0) return totals;
    const ITEM_CHUNK = 250;

    try {
        for (let i = 0; i < itemIds.length; i += ITEM_CHUNK) {
            const itemChunk = itemIds.slice(i, i + ITEM_CHUNK);
            const { data: balances, error: balanceError } = await (supabase.from as any)('inventory_balance')
                .select('item_id, warehouse_id, qty_on_hand')
                .in('item_id', itemChunk)
                .in('warehouse_id', allowedWarehouseIds);

            if (balanceError) throw balanceError;

            for (const row of balances || []) {
                const itemId = String(row.item_id || '');
                if (!itemId) continue;
                totals.set(itemId, Number(totals.get(itemId) || 0) + Number(row.qty_on_hand || 0));
            }
        }
        return totals;
    } catch (_balanceError) {
        const latestByItemWarehouse = new Set<string>();
        for (let i = 0; i < itemIds.length; i += ITEM_CHUNK) {
            const itemChunk = itemIds.slice(i, i + ITEM_CHUNK);
            const { data: snapshots, error: snapshotError } = await supabase
                .from('stock_snapshots')
                .select('item_id, warehouse_id, qty, synced_at')
                .in('item_id', itemChunk)
                .in('warehouse_id', allowedWarehouseIds)
                .order('synced_at', { ascending: false });

            if (snapshotError) throw snapshotError;

            for (const row of snapshots || []) {
                const itemId = String(row.item_id || '');
                const warehouseId = String(row.warehouse_id || '');
                if (!itemId || !warehouseId) continue;
                const key = `${itemId}__${warehouseId}`;
                if (latestByItemWarehouse.has(key)) continue;
                latestByItemWarehouse.add(key);
                totals.set(itemId, Number(totals.get(itemId) || 0) + Number(row.qty || 0));
            }
        }
        return totals;
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category') || '';
        const marca = searchParams.get('marca') || '';
        const warehouse = searchParams.get('warehouse') || '';
        const state = searchParams.get('state') || '';
        const color = searchParams.get('color') || '';

        const supabase = createRouteHandlerClient({ cookies });
        const auth = await getAuthenticatedProfile(supabase);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const moduleAccess = await getEffectiveModuleAccess(supabase, auth.userId, auth.role);
        if (!hasModuleAccess(moduleAccess, 'reports')) {
            return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
        }

        const scope = await getWarehouseAccessScope(supabase, auth.userId, auth.role);
        if (!scope.canViewStock) {
            return NextResponse.json({
                stats: {
                    totalProducts: 0,
                    totalStock: 0,
                    totalValue: 0,
                    lowStockItems: 0,
                    outOfStockItems: 0,
                    activeWarehouses: 0,
                },
                charts: {
                    categoryBreakdown: [],
                    brandBreakdown: [],
                },
                moneyMakerCategories: [],
                moneyMakerBrands: [],
                filterOptions: {
                    categories: [],
                    marcas: [],
                    warehouses: [],
                    states: [],
                    colors: [],
                },
                aging: {
                    items: [],
                    totalUnits: 0,
                    totalValue: 0,
                },
                lowStockList: [],
                sinMarcaCount: 0,
            });
        }

        const activeWarehouses = await listWarehousesForScope(supabase, scope, { activeOnly: true });
        const allowedWarehouseIds = activeWarehouses.map((warehouseRow) => warehouseRow.id);

        if (allowedWarehouseIds.length === 0) {
            return NextResponse.json({
                stats: {
                    totalProducts: 0,
                    totalStock: 0,
                    totalValue: 0,
                    lowStockItems: 0,
                    outOfStockItems: 0,
                    activeWarehouses: 0,
                },
                charts: {
                    categoryBreakdown: [],
                    brandBreakdown: [],
                },
                moneyMakerCategories: [],
                moneyMakerBrands: [],
                filterOptions: {
                    categories: [],
                    marcas: [],
                    warehouses: [],
                    states: [],
                    colors: [],
                },
                aging: {
                    items: [],
                    totalUnits: 0,
                    totalValue: 0,
                },
                lowStockList: [],
                sinMarcaCount: 0,
            });
        }

        const requestedWarehouse = warehouse
            ? activeWarehouses.find((warehouseRow) => warehouseRow.code === warehouse || warehouseRow.id === warehouse) || null
            : null;
        if (warehouse && (!requestedWarehouse || !isWarehouseAllowed(scope, requestedWarehouse.id))) {
            return NextResponse.json({ error: 'No tienes permiso para consultar esa bodega' }, { status: 403 });
        }

        // 1) Fetch items in a schema-compatible way.
        // We intentionally avoid hard-selecting optional columns to prevent
        // 500s when a deployment runs against an older DB schema.
        const itemsQuery = supabase
            .from('items')
            .select('*');

        // Paginate items
        let allItemsRaw: any[] = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await itemsQuery
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
                .order('name', { ascending: true });

            if (error) throw error;
            if (data && data.length > 0) {
                allItemsRaw = allItemsRaw.concat(data);
                if (data.length < PAGE_SIZE) hasMore = false;
                else page++;
            } else {
                hasMore = false;
            }
            if (page > 20) break;
        }

        const normalizedItems = allItemsRaw
            .map((row: any) => normalizeReportItem(row))
            .filter((row) => row.id && row.name);
        const filteredItems = applyItemFilters(normalizedItems, { category, marca, state, color });

        const allItemIds = filteredItems.map((item: any) => String(item.id));
        const scopedTotals = await getScopedTotalsForItems(supabase, allItemIds, allowedWarehouseIds);
        let allItems = filteredItems.map((item: any) => ({
            ...item,
            stock_total: scopedTotals.get(item.id) ?? 0,
        }));

        // If filtering by warehouse, narrow items to those with stock in that warehouse
        if (requestedWarehouse) {
            const itemIds = allItems.map((item: any) => item.id);
            const BATCH = 200;
            const matchingItemIds = new Set<string>();

            for (let i = 0; i < itemIds.length; i += BATCH) {
                const batch = itemIds.slice(i, i + BATCH);
                try {
                    const { data: balances, error: balanceError } = await (supabase.from as any)('inventory_balance')
                        .select('item_id, qty_on_hand')
                        .eq('warehouse_id', requestedWarehouse.id)
                        .in('item_id', batch)
                        .gt('qty_on_hand', 0);

                    if (balanceError) throw balanceError;
                    for (const row of balances || []) {
                        matchingItemIds.add(row.item_id);
                    }
                } catch (_balanceError) {
                    const { data: snaps } = await supabase
                        .from('stock_snapshots')
                        .select('item_id, qty')
                        .in('item_id', batch)
                        .eq('warehouse_id', requestedWarehouse.id)
                        .gt('qty', 0);

                    if (snaps) snaps.forEach((snap: any) => matchingItemIds.add(snap.item_id));
                }
            }

            allItems = allItems.filter((item: any) => matchingItemIds.has(item.id));
        }

        // 3) Build filter options from ALL items (before warehouse filter)
        // Re-query without warehouse filter for filter options
        const categories = new Set<string>();
        const marcas = new Set<string>();
        const states = new Set<string>();
        const colors = new Set<string>();

        allItems.forEach((item: any) => {
            if (item.category) categories.add(item.category);
            if (item.marca) marcas.add(item.marca);
            if (item.state) states.add(item.state);
            if (item.color) colors.add(item.color);
        });

        const filterOptions = {
            categories: Array.from(categories).sort(),
            marcas: Array.from(marcas).sort(),
            warehouses: activeWarehouses.map(w => w.code).sort(),
            states: Array.from(states).sort(),
            colors: Array.from(colors).sort(),
        };

        // 4) KPI stats from items (instant, no Zoho call)
        let totalStock = 0;
        let totalValue = 0;
        let lowStockItems = 0;
        let outOfStockItems = 0;
        const lowStockList: any[] = [];

        allItems.forEach((item: any) => {
            const stock = item.stock_total || 0;
            totalStock += stock;
            totalValue += stock * (item.price || 0);
            if (stock > 0 && stock < 10) {
                lowStockItems++;
                lowStockList.push({
                    id: item.id,
                    sku: item.sku,
                    name: item.name,
                    marca: item.marca,
                    category: item.category,
                    stock_total: stock,
                    price: item.price
                });
            }
            if (stock === 0) outOfStockItems++;
        });

        lowStockList.sort((a, b) => a.stock_total - b.stock_total);

        // 5) Chart breakdowns from items (instant)
        const categoryBreakdown: Record<string, { stock: number; capital: number; skus: Set<string> }> = {};
        const brandBreakdown: Record<string, { stock: number; capital: number; skus: Set<string>; label: string }> = {};

        allItems.forEach((item: any) => {
            const cat = item.category || 'Sin categoría';
            const brandRaw = (item.marca || '').trim() || 'Sin marca';
            const brandKey = brandRaw.toUpperCase();
            const stock = item.stock_total || 0;
            const price = item.price || 0;

            if (!categoryBreakdown[cat]) {
                categoryBreakdown[cat] = { stock: 0, capital: 0, skus: new Set() };
            }
            categoryBreakdown[cat].stock += stock;
            categoryBreakdown[cat].capital += (stock * price);
            if (stock > 0) categoryBreakdown[cat].skus.add(item.sku || String(item.id));

            if (!brandBreakdown[brandKey]) {
                brandBreakdown[brandKey] = { stock: 0, capital: 0, skus: new Set(), label: brandRaw };
            }
            brandBreakdown[brandKey].stock += stock;
            brandBreakdown[brandKey].capital += (stock * price);
            if (stock > 0) brandBreakdown[brandKey].skus.add(item.sku || String(item.id));
        });

        // 6) Aging data (items with stock > 0 updated > 90 days ago)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const agingItems = allItems
            .filter((item: any) => {
                const stock = item.stock_total || 0;
                if (stock <= 0) return false;
                const lastUpdate = item.updated_at ? new Date(item.updated_at) : null;
                return lastUpdate && lastUpdate < ninetyDaysAgo;
            })
            .map((item: any) => {
                const lastUpdate = new Date(item.updated_at);
                const daysAgo = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
                return { id: item.id, sku: item.sku, name: item.name, category: item.category, stock_total: item.stock_total, price: item.price, updated_at: item.updated_at, daysAgo };
            })
            .sort((a: any, b: any) => b.daysAgo - a.daysAgo)
            .slice(0, 100);

        const agingTotalUnits = agingItems.reduce((sum: number, i: any) => sum + (i.stock_total || 0), 0);
        const agingTotalValue = agingItems.reduce((sum: number, i: any) => sum + ((i.stock_total || 0) * (i.price || 0)), 0);

        // Format chart data
        const categoryChartData = Object.entries(categoryBreakdown)
            .map(([label, data]) => ({ label, value: data.stock }))
            .sort((a, b) => b.value - a.value);

        const brandChartData = Object.values(brandBreakdown)
            .map(b => ({ label: b.label, value: b.stock }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        // Format Money Maker Categories
        const moneyMakerCategories = Object.entries(categoryBreakdown)
            .map(([label, data]) => ({
                label,
                stock: data.stock,
                capital: data.capital,
                uniqueSkus: data.skus.size
            }))
            .filter(c => c.stock > 0 || c.capital > 0)
            .sort((a, b) => b.capital - a.capital); // Sort by capital invested

        // Format Money Maker Brands
        const moneyMakerBrands = Object.values(brandBreakdown)
            .map(b => ({
                label: b.label,
                stock: b.stock,
                capital: b.capital,
                uniqueSkus: b.skus.size
            }))
            .filter(b => b.stock > 0 || b.capital > 0)
            .sort((a, b) => b.capital - a.capital); // Sort by capital invested

        return NextResponse.json({
            stats: {
                totalProducts: allItems.length,
                totalStock,
                totalValue,
                lowStockItems,
                outOfStockItems,
                activeWarehouses: activeWarehouses.length,
            },
            charts: {
                categoryBreakdown: categoryChartData,
                brandBreakdown: brandChartData,
            },
            moneyMakerCategories,
            moneyMakerBrands,
            filterOptions,
            aging: {
                items: agingItems,
                totalUnits: agingTotalUnits,
                totalValue: agingTotalValue,
            },
            lowStockList,
            sinMarcaCount: allItems.filter((i: any) => !(i.marca || '').trim()).length,
        });
    } catch (error) {
        console.error('Reports data error:', error);
        return NextResponse.json(
            { error: 'Error al obtener datos de reportes', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
