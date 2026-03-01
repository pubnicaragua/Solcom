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

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category') || '';
        const marca = searchParams.get('marca') || '';
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

        // Query snapshots per warehouse (one query per warehouse, no item batching)
        const results = await Promise.all(
            warehouses.map(async (wh) => {
                let allSnaps: any[] = [];
                let page = 0;
                const PAGE_SIZE = 1000;
                let hasMore = true;

                while (hasMore) {
                    let query = supabase
                        .from('stock_snapshots')
                        .select(
                            category || marca || state || color
                                ? 'item_id, qty, items!inner(price, category, marca, state, color)'
                                : 'item_id, qty, items(price)'
                        )
                        .eq('warehouse_id', wh.id)
                        .gt('qty', 0);

                    if (category) query = query.ilike('items.category', `%${category}%`);
                    if (marca) query = query.eq('items.marca', marca);
                    if (state) query = query.eq('items.state', state);
                    if (color) query = query.ilike('items.color', `%${color}%`);

                    const { data: snapsPage, error: snapsErr } = await query
                        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

                    if (snapsErr) {
                        console.error(snapsErr);
                        break;
                    }

                    if (snapsPage && snapsPage.length > 0) {
                        allSnaps = allSnaps.concat(snapsPage);
                        if (snapsPage.length < PAGE_SIZE) hasMore = false;
                        else page++;
                    } else {
                        hasMore = false;
                    }
                    if (page > 50) break; // safety limit, up to 50k items per warehouse
                }

                if (allSnaps.length === 0) return { label: wh.name || wh.code, code: wh.code, value: 0, capital: 0, uniqueSkus: 0 };

                // Deduplicate: keep one per item_id
                const itemMap = new Map<string, { qty: number, price: number }>();
                allSnaps.forEach((s: any) => {
                    if (!itemMap.has(s.item_id)) {
                        // Some data might come as array or object depending on Supabase relations
                        const price = Array.isArray(s.items) ? (s.items[0]?.price || 0) : ((s.items as any)?.price || 0);
                        itemMap.set(s.item_id, { qty: s.qty, price });
                    }
                });

                let totalQty = 0;
                let totalCapital = 0;
                itemMap.forEach(({ qty, price }) => {
                    totalQty += qty;
                    totalCapital += (qty * price);
                });

                return { label: wh.name || wh.code, code: wh.code, value: totalQty, capital: totalCapital, uniqueSkus: itemMap.size };
            })
        );

        return NextResponse.json({
            warehouseBreakdown: results.filter(r => r.value > 0).sort((a, b) => b.value - a.value),
        });
    } catch (error) {
        console.error('Warehouse breakdown error:', error);
        return NextResponse.json({ warehouseBreakdown: [] });
    }
}
