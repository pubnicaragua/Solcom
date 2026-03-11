import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
    getAuthenticatedProfile,
    getWarehouseAccessScope,
    listWarehousesForScope,
} from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

export const dynamic = 'force-dynamic';

const UNCATEGORIZED_ALIASES = new Set([
    'sin categoria',
    'sin categoría',
    'sin-categoria',
    'sin_categoria',
    's/c',
    'sin cat',
    'uncategorized',
    'no category',
    'none',
    'null',
    'undefined',
    'n/a',
    'na',
    '-',
    '(none)',
]);

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

function normalizeCategoryValue(raw: unknown): string | null {
    const text = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!text) return null;
    const normalized = text.toLowerCase();
    if (UNCATEGORIZED_ALIASES.has(normalized)) return null;
    return text;
}

function isUncategorizedFilter(raw: string): boolean {
    const text = String(raw ?? '').trim();
    if (!text) return false;
    return normalizeCategoryValue(text) === null;
}

function normalizeItemMeta(row: any) {
    return {
        id: String(row?.id ?? '').trim(),
        sku: String(row?.sku ?? '').trim(),
        category: normalizeCategoryValue(row?.category),
        marca: String(row?.marca ?? '').trim() || null,
        state: String(row?.state ?? '').trim() || null,
        color: String(row?.color ?? '').trim() || null,
        price: Number(row?.price ?? 0) || 0,
        zoho_removed_at: row?.zoho_removed_at ?? null,
    };
}

function matchesFilters(
    item: ReturnType<typeof normalizeItemMeta>,
    filters: { category: string; marca: string; state: string; color: string }
): boolean {
    if (item.zoho_removed_at) return false;
    if (filters.category) {
        if (isUncategorizedFilter(filters.category)) {
            if (item.category) return false;
        } else if (!containsInsensitive(item.category, filters.category)) {
            return false;
        }
    }
    if (filters.marca && !equalsInsensitive(item.marca, filters.marca)) return false;
    if (filters.state && !equalsInsensitive(item.state, filters.state)) return false;
    if (filters.color && !containsInsensitive(item.color, filters.color)) return false;
    return true;
}

async function loadQtyByItemForWarehouse(
    supabase: ReturnType<typeof createRouteHandlerClient>,
    warehouseId: string
): Promise<Map<string, number>> {
    const totals = new Map<string, number>();

    try {
        let page = 0;
        const PAGE_SIZE = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await (supabase.from as any)('inventory_balance')
                .select('item_id, qty_on_hand')
                .eq('warehouse_id', warehouseId)
                .gt('qty_on_hand', 0)
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (error) throw error;

            const rows = data || [];
            for (const row of rows) {
                const itemId = String(row.item_id || '').trim();
                if (!itemId) continue;
                totals.set(itemId, Number(row.qty_on_hand || 0));
            }

            if (rows.length < PAGE_SIZE) hasMore = false;
            else page += 1;
            if (page > 50) break;
        }

        return totals;
    } catch {
        // Fallback to snapshots legacy model.
        let page = 0;
        const PAGE_SIZE = 1000;
        let hasMore = true;
        const latestSeen = new Set<string>();

        while (hasMore) {
            const { data, error } = await supabase
                .from('stock_snapshots')
                .select('item_id, qty, synced_at')
                .eq('warehouse_id', warehouseId)
                .order('synced_at', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (error) throw error;

            const rows = data || [];
            for (const row of rows) {
                const itemId = String(row.item_id || '').trim();
                if (!itemId || latestSeen.has(itemId)) continue;
                latestSeen.add(itemId);
                const qty = Number(row.qty || 0);
                if (qty > 0) totals.set(itemId, qty);
            }

            if (rows.length < PAGE_SIZE) hasMore = false;
            else page += 1;
            if (page > 50) break;
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
            return NextResponse.json({ warehouseBreakdown: [] });
        }

        const warehouses = await listWarehousesForScope(supabase, scope, { activeOnly: true });
        if (!warehouses || warehouses.length === 0) {
            return NextResponse.json({ warehouseBreakdown: [] });
        }

        const requestedWarehouse = warehouse
            ? warehouses.find((warehouseRow) => warehouseRow.code === warehouse || warehouseRow.id === warehouse) || null
            : null;
        if (warehouse && !requestedWarehouse) {
            return NextResponse.json({ error: 'No tienes permiso para consultar esa bodega' }, { status: 403 });
        }

        const visibleWarehouses = requestedWarehouse ? [requestedWarehouse] : warehouses;

        const filters = { category, marca, state, color };
        const results = await Promise.all(
            visibleWarehouses.map(async (warehouseRow) => {
                const qtyByItem = await loadQtyByItemForWarehouse(supabase, warehouseRow.id);
                const itemIds = Array.from(qtyByItem.keys());
                if (itemIds.length === 0) {
                    return {
                        label: warehouseRow.name || warehouseRow.code,
                        code: warehouseRow.code,
                        value: 0,
                        capital: 0,
                        uniqueSkus: 0,
                    };
                }

                const itemMetaById = new Map<string, ReturnType<typeof normalizeItemMeta>>();
                const CHUNK = 500;
                for (let i = 0; i < itemIds.length; i += CHUNK) {
                    const batch = itemIds.slice(i, i + CHUNK);
                    const { data: rows, error } = await supabase
                        .from('items')
                        .select('*')
                        .in('id', batch);

                    if (error) throw error;

                    for (const row of rows || []) {
                        const normalized = normalizeItemMeta(row);
                        if (!normalized.id) continue;
                        itemMetaById.set(normalized.id, normalized);
                    }
                }

                let totalQty = 0;
                let totalCapital = 0;
                const uniqueSkus = new Set<string>();

                for (const itemId of itemIds) {
                    const qty = Number(qtyByItem.get(itemId) || 0);
                    if (qty <= 0) continue;
                    const meta = itemMetaById.get(itemId);
                    if (!meta) continue;
                    if (!matchesFilters(meta, filters)) continue;

                    totalQty += qty;
                    totalCapital += qty * (meta.price || 0);
                    uniqueSkus.add(meta.sku || itemId);
                }

                return {
                    label: warehouseRow.name || warehouseRow.code,
                    code: warehouseRow.code,
                    value: totalQty,
                    capital: totalCapital,
                    uniqueSkus: uniqueSkus.size,
                };
            })
        );

        return NextResponse.json({
            warehouseBreakdown: results.filter((row) => row.value > 0).sort((a, b) => b.value - a.value),
        });
    } catch (error) {
        console.error('Warehouse breakdown error:', error);
        return NextResponse.json({ warehouseBreakdown: [] });
    }
}
