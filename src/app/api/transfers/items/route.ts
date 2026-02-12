
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';
        const warehouseId = searchParams.get('warehouseId');

        if (!warehouseId) {
            return NextResponse.json({ error: 'Warehouse ID required' }, { status: 400 });
        }

        const supabase = createServerClient();

        // 1. Search items
        let query = supabase
            .from('items')
            .select('id, name, sku, zoho_item_id, stock_snapshots(qty, warehouse_id)')
            .limit(20);

        if (search) {
            query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
        }

        const { data: items, error } = await query;
        if (error) throw error;

        // 2. Map items with stock for the specific warehouse
        const result = items.map((item: any) => {
            // Find snapshot for this warehouse
            const snapshot = item.stock_snapshots?.find((s: any) => s.warehouse_id === warehouseId);
            return {
                id: item.id,
                zoho_item_id: item.zoho_item_id,
                name: item.name,
                sku: item.sku,
                current_stock: snapshot?.qty || 0
            };
        });

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Error searching items:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
