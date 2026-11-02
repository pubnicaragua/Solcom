// Read-only comparison against the configured Supabase. Does not change stock.
// Requires Node >=22.18 for native TypeScript imports.
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fetchPivotBalances } from '../src/lib/inventory/pivot-balances.ts';
import assert from 'node:assert/strict';

if (process.env.PIVOT_BENCHMARK_LIVE !== '1') {
    console.error('Set PIVOT_BENCHMARK_LIVE=1 to run read-only production queries.');
    process.exit(1);
}
config({ quiet: true });
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
let items = [];
for (let page = 0; ; page++) {
    const { data, error } = await client.from('items').select('id, sku, zoho_item_id')
        .is('zoho_removed_at', null).order('name').order('id').range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    items.push(...data);
    if (data.length < 1000) break;
}
const skus = new Map();
for (const item of items) {
    const existing = skus.get(item.sku);
    if (!existing || (!existing.zoho_item_id && item.zoho_item_id)) skus.set(item.sku, item);
}
const ids = [...skus.values()].map(item => item.id);
const { data: warehouses, error } = await client.from('warehouses').select('id');
if (error) throw error;
const whIds = warehouses.map(w => w.id);
let baseline = [], requests = 0;
const start = performance.now();
for (let i = 0; i < ids.length; i += 250) {
    for (let page = 0; ; page++) {
        const { data, error } = await client.from('inventory_balance').select('item_id, warehouse_id, qty_on_hand')
            .in('item_id', ids.slice(i, i + 250)).in('warehouse_id', whIds).range(page * 1000, page * 1000 + 999);
        requests++;
        if (error) throw error;
        baseline.push(...data);
        if (data.length < 1000) break;
    }
}
const baselineMs = performance.now() - start;
const optimizedStart = performance.now();
const optimized = await fetchPivotBalances(client, ids, whIds);
const optimizedMs = performance.now() - optimizedStart;
const normalize = rows => rows.map(row => `${row.item_id}/${row.warehouse_id}/${row.qty_on_hand ?? 0}`).sort();
// Compare every pair, including zero and negative balances, not just grand totals.
assert.deepEqual(normalize(optimized), normalize(baseline), 'Stocks changed or nested query lost rows; rerun outside a sync.');
const restricted = await fetchPivotBalances(client, ids, whIds.slice(0, 1));
assert.deepEqual(normalize(restricted), normalize(baseline.filter(row => row.warehouse_id === whIds[0])));
console.log(JSON.stringify({
    products: ids.length, warehouses: whIds.length, balances: optimized.length,
    baseline: { requests, seconds: +(baselineMs / 1000).toFixed(3) },
    optimized: { requests: Math.ceil(ids.length / 250), seconds: +(optimizedMs / 1000).toFixed(3) },
    improvementPercent: +(100 * (1 - optimizedMs / baselineMs)).toFixed(1),
    identicalStocks: true, restrictedScopeMatches: true,
}, null, 2));
