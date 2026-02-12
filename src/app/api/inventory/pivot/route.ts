import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';
        const state = searchParams.get('state') || '';
        const category = searchParams.get('category') || '';
        const marca = searchParams.get('marca') || searchParams.get('brand') || '';
        const color = searchParams.get('color') || '';
        const stockLevel = searchParams.get('stockLevel') || '';
        const showZeroStock = searchParams.get('showZeroStock') !== 'false'; // default true

        const supabase = createServerClient();

        // 1) Fetch ACTIVE warehouses (columns) and ALL warehouses (for total)
        const [{ data: activeWhRaw, error: whError }, { data: allWhRaw, error: allWhError }] = await Promise.all([
            supabase.from('warehouses').select('id, code, name').eq('active', true).order('code', { ascending: true }),
            supabase.from('warehouses').select('id, code, name'),
        ]);

        if (whError) throw whError;
        if (allWhError) throw allWhError;
        const activeWarehouses = activeWhRaw || [];
        const allWarehouses = allWhRaw || [];

        // 2) Fetch items with filters
        let itemsQuery = supabase
            .from('items')
            .select('id, sku, name, color, state, category, marca, stock_total, price')
            .is('zoho_removed_at', null);

        if (search?.trim()) {
            const t = search.trim();
            itemsQuery = itemsQuery.or(`name.ilike.%${t}%,sku.ilike.%${t}%`);
        }
        if (marca) itemsQuery = itemsQuery.eq('marca', marca);
        if (color) itemsQuery = itemsQuery.ilike('color', `%${color}%`);
        if (state) itemsQuery = itemsQuery.eq('state', state);
        if (category) itemsQuery = itemsQuery.ilike('category', `%${category}%`);
        if (stockLevel) {
            switch (stockLevel) {
                case 'out': itemsQuery = itemsQuery.eq('stock_total', 0); break;
                case 'critical': itemsQuery = itemsQuery.gte('stock_total', 1).lte('stock_total', 5); break;
                case 'low': itemsQuery = itemsQuery.gte('stock_total', 6).lte('stock_total', 20); break;
                case 'medium': itemsQuery = itemsQuery.gte('stock_total', 21).lte('stock_total', 50); break;
                case 'high': itemsQuery = itemsQuery.gt('stock_total', 50); break;
            }
        }

        // Fetch items with pagination to bypass Supabase 1000-row limit
        let allItems: any[] = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await itemsQuery.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1).order('name', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                allItems = allItems.concat(data);
                if (data.length < PAGE_SIZE) hasMore = false;
                else page++;
            } else {
                hasMore = false;
            }
            if (page > 20) break; // Safety
        }

        console.log('Pivot API - active warehouses:', activeWarehouses.length, 'all warehouses:', allWarehouses.length, 'items:', allItems.length);

        const items = allItems;
        if (items.length === 0) {
            return NextResponse.json({ warehouses: activeWarehouses.map(w => ({ code: w.code, name: w.name })), items: [] });
        }

        // 3) Fetch stock_snapshots for ALL warehouses (needed for accurate total)
        const itemIds = items.map((i: any) => i.id);
        const allWhIds = allWarehouses.map(w => w.id);

        // Fetch ALL snapshots using paginated .range() — only ~2-3 sequential queries
        // instead of 78 chunked queries that saturate the connection pool
        let allSnapshots: any[] = [];
        const SNAP_PAGE = 1000;
        let snapPage = 0;
        let snapHasMore = true;

        while (snapHasMore) {
            const from = snapPage * SNAP_PAGE;
            const to = from + SNAP_PAGE - 1;
            const { data, error } = await supabase
                .from('stock_snapshots')
                .select('item_id, warehouse_id, qty, synced_at')
                .in('warehouse_id', allWhIds)
                .order('synced_at', { ascending: false })
                .range(from, to);

            if (error) {
                console.error('Error fetching snapshots page:', error);
                break;
            }
            if (data && data.length > 0) {
                allSnapshots = allSnapshots.concat(data);
                if (data.length < SNAP_PAGE) snapHasMore = false;
                else snapPage++;
            } else {
                snapHasMore = false;
            }
            if (snapPage > 50) break; // safety: max 50k snapshots
        }

        // Deduplicate: keep only the latest snapshot per (item_id, warehouse_id)
        const latestSnap = new Map<string, number>();
        for (const snap of allSnapshots) {
            const key = `${snap.item_id}__${snap.warehouse_id}`;
            if (!latestSnap.has(key)) {
                latestSnap.set(key, snap.qty);
            }
        }

        // Track which items have ANY snapshot data
        const itemsWithSnapshots = new Set<string>();
        for (const snap of allSnapshots) {
            itemsWithSnapshots.add(snap.item_id);
        }

        // 4) Build result: columns = active warehouses, total = ALL warehouses
        //    FALLBACK: if an item has NO snapshots at all, use items.stock_total
        const resultItems = items.map((item: any) => {
            const warehouseQty: Record<string, number> = {};
            const hasSnapshots = itemsWithSnapshots.has(item.id);

            // Columns: only active warehouses
            for (const w of activeWarehouses) {
                const key = `${item.id}__${w.id}`;
                warehouseQty[w.code] = latestSnap.get(key) ?? 0;
            }

            // Total: sum ALL warehouses (active + inactive)
            let total = 0;
            if (hasSnapshots) {
                for (const w of allWarehouses) {
                    const key = `${item.id}__${w.id}`;
                    total += latestSnap.get(key) ?? 0;
                }
            } else {
                // No snapshots exist — use item's stock_total from Zoho sync as fallback
                total = item.stock_total ?? 0;
            }

            return {
                id: item.id,
                sku: item.sku,
                name: item.name,
                color: item.color || null,
                state: item.state || null,
                brand: item.marca || null,
                category: item.category || null,
                warehouseQty,
                total,
                hasSnapshots, // let frontend know if data comes from snapshots or fallback
            };
        });

        // Optionally filter out zero-stock items
        const finalItems = showZeroStock ? resultItems : resultItems.filter(i => i.total > 0);

        return NextResponse.json({
            warehouses: activeWarehouses.map((w: any) => ({ code: w.code, name: w.name })),
            items: finalItems,
            totalBeforeFilter: resultItems.length,
        });
    } catch (error) {
        console.error('Pivot inventory error:', error);
        return NextResponse.json(
            { error: 'Error al obtener datos pivot', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
