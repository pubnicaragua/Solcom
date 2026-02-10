
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q'); // sku or name

        if (!query) {
            return NextResponse.json({ error: 'Missing q parameter' });
        }

        const supabase = createServerClient();

        // 1. Get all warehouses (active and inactive)
        const { data: allWarehouses } = await supabase.from('warehouses').select('*');

        // 2. Find items matching query
        let queryBuilder = supabase.from('items').select('*');

        // Check if query is a UUID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);

        if (isUUID) {
            queryBuilder = queryBuilder.eq('id', query);
        } else {
            queryBuilder = queryBuilder.or(`sku.ilike.%${query}%,name.ilike.%${query}%`);
        }

        const { data: items } = await queryBuilder.limit(5);

        if (!items || items.length === 0) {
            return NextResponse.json({ message: 'No items found', query });
        }

        const itemIds = items.map(i => i.id);

        // 3. Get snapshots for these items
        const { data: snapshots } = await supabase
            .from('stock_snapshots')
            .select('*')
            .in('item_id', itemIds);

        // 4. Enrich snapshots with warehouse info
        const result = items.map(item => {
            const itemSnaps = snapshots?.filter(s => s.item_id === item.id) || [];
            return {
                item: { id: item.id, sku: item.sku, name: item.name },
                snapshots: itemSnaps.map(snap => {
                    const wh = allWarehouses?.find(w => w.id === snap.warehouse_id);
                    return {
                        warehouse_id: snap.warehouse_id,
                        warehouse_code: wh?.code || 'UNKNOWN',
                        warehouse_name: wh?.name || 'UNKNOWN',
                        warehouse_active: wh?.active,
                        qty: snap.qty,
                        synced_at: snap.synced_at
                    };
                })
            };
        });

        return NextResponse.json({
            debug_info: result
        });

    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
