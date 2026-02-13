
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function isMissingRelationError(error: any): boolean {
    return String(error?.code || '') === '42P01';
}

function sanitizeTerm(raw: string): string {
    return raw.trim().replace(/[,%()'"]/g, ' ').replace(/\s+/g, ' ');
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = sanitizeTerm(searchParams.get('search') || '');
        const warehouseId = searchParams.get('warehouseId');

        if (!warehouseId) {
            return NextResponse.json({ error: 'Warehouse ID required' }, { status: 400 });
        }

        const supabase = createServerClient();

        // Preferred source: inventory_balance (modelo v2)
        try {
            let balanceQuery = (supabase.from as any)('inventory_balance')
                .select('item_id, qty_on_hand, items!inner(id, name, sku, zoho_item_id)')
                .eq('warehouse_id', warehouseId)
                .gt('qty_on_hand', 0)
                .limit(100);

            if (search) {
                balanceQuery = balanceQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`, {
                    referencedTable: 'items',
                });
            }

            const { data, error } = await balanceQuery;
            if (error) {
                if (!isMissingRelationError(error)) throw error;
            } else {
                const result = (data || [])
                    .map((row: any) => {
                        const item = Array.isArray(row.items) ? row.items[0] : row.items;
                        if (!item) return null;
                        return {
                            id: item.id,
                            zoho_item_id: item.zoho_item_id,
                            name: item.name,
                            sku: item.sku,
                            current_stock: Number(row.qty_on_hand ?? 0),
                        };
                    })
                    .filter(Boolean)
                    .sort((a: any, b: any) => b.current_stock - a.current_stock)
                    .slice(0, 20);

                return NextResponse.json(result);
            }
        } catch (balanceError: any) {
            // fallback below
            console.warn('[transfers/items] inventory_balance unavailable, fallback to stock_snapshots', balanceError?.message);
        }

        // Legacy fallback: latest stock_snapshots por item en la bodega
        let snapQuery = supabase
            .from('stock_snapshots')
            .select('item_id, warehouse_id, qty, synced_at, items!inner(id, name, sku, zoho_item_id)')
            .eq('warehouse_id', warehouseId)
            .order('synced_at', { ascending: false })
            .limit(300);

        if (search) {
            snapQuery = snapQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`, {
                referencedTable: 'items',
            });
        }

        const { data: snapshots, error } = await snapQuery;
        if (error) throw error;

        const latestByItem = new Map<string, any>();
        for (const row of snapshots || []) {
            if (latestByItem.has(row.item_id)) continue;
            latestByItem.set(row.item_id, row);
        }

        const result = Array.from(latestByItem.values())
            .map((row: any) => {
                const item = Array.isArray(row.items) ? row.items[0] : row.items;
                if (!item) return null;
                return {
                    id: item.id,
                    zoho_item_id: item.zoho_item_id,
                    name: item.name,
                    sku: item.sku,
                    current_stock: Number(row.qty ?? 0),
                };
            })
            .filter((row: any) => row && row.current_stock > 0)
            .sort((a: any, b: any) => b.current_stock - a.current_stock)
            .slice(0, 20);

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Error searching items:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
