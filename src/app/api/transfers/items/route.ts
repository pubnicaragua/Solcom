
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function isMissingRelationError(error: any): boolean {
    return String(error?.code || '') === '42P01';
}

function sanitizeTerm(raw: string): string {
    return raw.trim().replace(/[,%()'"]/g, ' ').replace(/\s+/g, ' ');
}

function toEpoch(value: unknown): number {
    const n = new Date(String(value || '')).getTime();
    return Number.isFinite(n) ? n : 0;
}

function asQty(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
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
            const { data: balanceRows, error: balanceError } = await (supabase.from as any)('inventory_balance')
                .select('item_id, qty_on_hand, updated_at')
                .eq('warehouse_id', warehouseId)
                .gt('qty_on_hand', 0)
                .limit(1000);

            if (balanceError) {
                if (!isMissingRelationError(balanceError)) throw balanceError;
            } else {
                const latestByItem = new Map<string, { qty: number; updatedAt: number }>();
                for (const row of balanceRows || []) {
                    const itemId = String((row as any).item_id || '');
                    if (!itemId) continue;
                    const current = latestByItem.get(itemId);
                    const candidate = {
                        qty: asQty((row as any).qty_on_hand),
                        updatedAt: toEpoch((row as any).updated_at),
                    };
                    if (!current || candidate.updatedAt >= current.updatedAt) {
                        latestByItem.set(itemId, candidate);
                    }
                }

                const itemIds = Array.from(latestByItem.keys());
                if (itemIds.length === 0) {
                    return NextResponse.json([]);
                }

                let itemQuery = supabase
                    .from('items')
                    .select('id, name, sku, zoho_item_id')
                    .in('id', itemIds)
                    .limit(500);

                if (search) {
                    itemQuery = itemQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
                }

                const { data: items, error: itemError } = await itemQuery;
                if (itemError) throw itemError;

                const result = (items || [])
                    .map((item: any) => ({
                        id: item.id,
                        zoho_item_id: item.zoho_item_id,
                        name: item.name,
                        sku: item.sku,
                        current_stock: latestByItem.get(item.id)?.qty ?? 0,
                    }))
                    .filter((row: any) => row.current_stock > 0)
                    .sort((a: any, b: any) => b.current_stock - a.current_stock)
                    .slice(0, 20);

                return NextResponse.json(result);
            }
        } catch (balanceError: any) {
            // fallback below
            console.warn('[transfers/items] inventory_balance unavailable, fallback to stock_snapshots', balanceError?.message);
        }

        // Legacy fallback: latest stock_snapshots por item en la bodega
        const { data: snapshots, error } = await supabase
            .from('stock_snapshots')
            .select('item_id, qty, synced_at')
            .eq('warehouse_id', warehouseId)
            .order('synced_at', { ascending: false })
            .limit(1000);
        if (error) throw error;

        const latestByItem = new Map<string, { qty: number; syncedAt: number }>();
        for (const row of snapshots || []) {
            const itemId = String((row as any).item_id || '');
            if (!itemId || latestByItem.has(itemId)) continue;
            latestByItem.set(itemId, {
                qty: asQty((row as any).qty),
                syncedAt: toEpoch((row as any).synced_at),
            });
        }

        const itemIds = Array.from(latestByItem.keys());
        if (itemIds.length === 0) return NextResponse.json([]);

        let itemQuery = supabase
            .from('items')
            .select('id, name, sku, zoho_item_id')
            .in('id', itemIds)
            .limit(500);

        if (search) {
            itemQuery = itemQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
        }

        const { data: items, error: itemError } = await itemQuery;
        if (itemError) throw itemError;

        const result = (items || [])
            .map((item: any) => ({
                id: item.id,
                zoho_item_id: item.zoho_item_id,
                name: item.name,
                sku: item.sku,
                current_stock: latestByItem.get(item.id)?.qty ?? 0,
            }))
            .filter((row: any) => row.current_stock > 0)
            .sort((a: any, b: any) => b.current_stock - a.current_stock)
            .slice(0, 20);

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Error searching items:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
