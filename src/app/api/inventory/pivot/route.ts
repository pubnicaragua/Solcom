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
        const activeWhIdSet = new Set(activeWarehouses.map(w => w.id));

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

        const { data: itemsData, error: itemsError } = await itemsQuery.order('name', { ascending: true }).limit(10000);
        console.log('Pivot API - active warehouses:', activeWarehouses.length, 'all warehouses:', allWarehouses.length, 'items:', itemsData?.length);
        if (itemsError) throw itemsError;

        const items = itemsData || [];
        if (items.length === 0) {
            return NextResponse.json({ warehouses: activeWarehouses.map(w => ({ code: w.code, name: w.name })), items: [] });
        }

        // 3) Fetch stock_snapshots for ALL warehouses (needed for accurate total)
        const itemIds = items.map((i: any) => i.id);
        const allWhIds = allWarehouses.map(w => w.id);

        let allSnapshots: any[] = [];
        const BATCH_SIZE = 200;
        for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
            const batch = itemIds.slice(i, i + BATCH_SIZE);
            const { data: snapBatch } = await supabase
                .from('stock_snapshots')
                .select('item_id, warehouse_id, qty, synced_at')
                .in('item_id', batch)
                .in('warehouse_id', allWhIds)
                .order('synced_at', { ascending: false });
            if (snapBatch) allSnapshots = allSnapshots.concat(snapBatch);
        }

        // Deduplicate: keep only the latest snapshot per (item_id, warehouse_id)
        const latestSnap = new Map<string, number>();
        for (const snap of allSnapshots) {
            const key = `${snap.item_id}__${snap.warehouse_id}`;
            if (!latestSnap.has(key)) {
                latestSnap.set(key, snap.qty);
            }
        }

        // 4) Build result: columns = active warehouses, total = ALL warehouses
        const resultItems = items.map((item: any) => {
            const warehouseQty: Record<string, number> = {};
            // Columns: only active warehouses
            for (const w of activeWarehouses) {
                const key = `${item.id}__${w.id}`;
                warehouseQty[w.code] = latestSnap.get(key) ?? 0;
            }
            // Total: sum ALL warehouses (active + inactive)
            let total = 0;
            for (const w of allWarehouses) {
                const key = `${item.id}__${w.id}`;
                total += latestSnap.get(key) ?? 0;
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
            };
        });

        return NextResponse.json({
            warehouses: activeWarehouses.map((w: any) => ({ code: w.code, name: w.name })),
            items: resultItems,
        });
    } catch (error) {
        console.error('Pivot inventory error:', error);
        return NextResponse.json(
            { error: 'Error al obtener datos pivot', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
