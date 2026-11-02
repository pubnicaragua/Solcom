import type { SupabaseClient } from '@supabase/supabase-js';

export interface PivotBalance {
    item_id: string;
    warehouse_id: string;
    qty_on_hand: number | null;
}

interface ItemWithBalances {
    id: string;
    inventory_balance: Array<Omit<PivotBalance, 'item_id'>>;
}

// Page products, not balances: a product's warehouse breakdown stays together.
// The embedded warehouse filter is required even when RLS also restricts access.
export async function fetchPivotBalances(
    client: Pick<SupabaseClient, 'from'>,
    itemIds: string[],
    warehouseIds: string[],
): Promise<PivotBalance[]> {
    if (!itemIds.length || !warehouseIds.length) return [];

    const chunks: string[][] = [];
    for (let i = 0; i < itemIds.length; i += 250) chunks.push(itemIds.slice(i, i + 250));
    const results: PivotBalance[][] = new Array(chunks.length);
    let next = 0;
    const worker = async () => {
        while (next < chunks.length) {
            const index = next++;
            const { data, error } = await client
                .from('items')
                .select('id, inventory_balance(warehouse_id, qty_on_hand)')
                .in('id', chunks[index])
                .in('inventory_balance.warehouse_id', warehouseIds);
            if (error) throw error;
            results[index] = ((data || []) as unknown as ItemWithBalances[]).flatMap(item =>
                (item.inventory_balance || []).map(balance => ({ ...balance, item_id: item.id }))
            );
        }
    };
    await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, worker));
    return results.flat();
}
