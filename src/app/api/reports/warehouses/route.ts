import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = createServerClient();

        const { data: warehouses } = await supabase
            .from('warehouses')
            .select('id, code, name')
            .eq('active', true)
            .order('code', { ascending: true });

        if (!warehouses || warehouses.length === 0) {
            return NextResponse.json({ warehouseBreakdown: [] });
        }

        // Query snapshots per warehouse (one query per warehouse, no item batching)
        const results = await Promise.all(
            warehouses.map(async (wh) => {
                const { data: snaps } = await supabase
                    .from('stock_snapshots')
                    .select('item_id, qty')
                    .eq('warehouse_id', wh.id);

                if (!snaps || snaps.length === 0) return { label: wh.name || wh.code, value: 0 };

                // Deduplicate: keep one per item_id (latest is first if already sorted)
                const itemMap = new Map<string, number>();
                snaps.forEach(s => {
                    if (!itemMap.has(s.item_id)) itemMap.set(s.item_id, s.qty);
                });

                let total = 0;
                itemMap.forEach(qty => { total += qty; });

                return { label: wh.name || wh.code, value: total };
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
