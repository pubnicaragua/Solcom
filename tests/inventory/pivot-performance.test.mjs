import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPivotBalances } from '../../src/lib/inventory/pivot-balances.ts';
import { createRefreshQueue } from '../../src/lib/inventory/refresh-queue.ts';

const tick = () => new Promise(resolve => setTimeout(resolve, 20));

test('balance loader preserves all nested stocks and excludes unauthorized warehouses', async () => {
  let active = 0, peak = 0;
  const client = { from(table) {
    assert.equal(table, 'items');
    const filters = {};
    const query = {
      select() { return query; },
      in(field, values) { filters[field] = values; return query; },
      async then(resolve) {
        active++; peak = Math.max(peak, active);
        await tick(); active--;
        resolve({ data: filters.id.map(id => ({ id, inventory_balance: [
          ...Array.from({ length: 5 }, (_, i) => ({ warehouse_id: `allowed-${i}`, qty_on_hand: -2 })),
          { warehouse_id: 'other', qty_on_hand: 99 },
        ].filter(row => filters['inventory_balance.warehouse_id'].includes(row.warehouse_id)) })), error: null });
      },
    };
    return query;
  }};
  const ids = Array.from({ length: 1251 }, (_, i) => `item-${i}`);
  const rows = await fetchPivotBalances(client, ids, Array.from({ length: 5 }, (_, i) => `allowed-${i}`));
  assert.equal(rows.length, 6255);
  assert.equal(new Set(rows.map(row => row.item_id)).size, 1251);
  assert.ok(rows.every(row => row.warehouse_id.startsWith('allowed-') && row.qty_on_hand === -2));
  assert.ok(peak > 1 && peak <= 3);
});

test('empty stock scopes make no requests and upstream errors propagate', async () => {
  const client = { from() { throw new Error('database unavailable'); } };
  assert.deepEqual(await fetchPivotBalances(client, [], ['w']), []);
  assert.deepEqual(await fetchPivotBalances(client, ['i'], []), []);
  await assert.rejects(fetchPivotBalances(client, ['i'], ['w']), /database unavailable/);
});

test('a burst queues one refresh after an active load without interrupting it', async () => {
  let busy = true, calls = 0;
  const queue = createRefreshQueue({ delayMs: 5, isLoading: () => busy, refresh: () => { calls++; busy = true; } });
  queue.request(); queue.request();
  await tick();
  assert.equal(calls, 0);
  busy = false; queue.idle();
  await tick();
  assert.equal(calls, 1);
  queue.request(); queue.request(); await tick();
  assert.equal(calls, 1);
  busy = false; queue.idle(); await tick();
  assert.equal(calls, 2);
  queue.dispose();
});

test('continuous events cannot postpone refresh forever and disposal cancels work', async () => {
  let calls = 0;
  const queue = createRefreshQueue({ delayMs: 5, isLoading: () => false, refresh: () => { calls++; } });
  queue.request();
  for (let i = 0; i < 12; i++) { queue.request(); await new Promise(resolve => setTimeout(resolve, 1)); }
  assert.ok(calls >= 1);
  queue.dispose(); const before = calls;
  queue.request(); queue.idle(); await tick();
  assert.equal(calls, before);
});

test('an embedded-query error rejects instead of returning partial stock', async () => {
  const failure = new Error('relation unavailable');
  const query = {
    select() { return query; },
    in() { return query; },
    then(resolve) { resolve({ data: null, error: failure }); },
  };
  await assert.rejects(fetchPivotBalances({ from: () => query }, ['i'], ['w']), /relation unavailable/);
});
