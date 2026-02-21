-- Rebuild inventory_balance only from existing stock_snapshots.
-- Useful when Zoho API quota is exhausted (429) and we must work with local data.

BEGIN;

-- Latest snapshot per item + warehouse (only valid FK pairs).
WITH latest AS (
  SELECT
    s.item_id,
    s.warehouse_id,
    s.qty,
    s.synced_at,
    row_number() OVER (
      PARTITION BY s.item_id, s.warehouse_id
      ORDER BY s.synced_at DESC, s.created_at DESC, s.id DESC
    ) AS rn
  FROM public.stock_snapshots s
  JOIN public.items i ON i.id = s.item_id
  JOIN public.warehouses w ON w.id = s.warehouse_id
)
INSERT INTO public.inventory_balance (
  item_id,
  warehouse_id,
  qty_on_hand,
  source,
  source_ts,
  updated_at
)
SELECT
  latest.item_id,
  latest.warehouse_id,
  latest.qty,
  'rebuild_from_snapshots',
  latest.synced_at,
  now()
FROM latest
WHERE latest.rn = 1
ON CONFLICT (item_id, warehouse_id)
DO UPDATE SET
  qty_on_hand = EXCLUDED.qty_on_hand,
  source = EXCLUDED.source,
  source_ts = EXCLUDED.source_ts,
  updated_at = now();

-- Recalculate item stock total from active warehouses only.
SELECT public.refresh_item_stock_total(NULL);

-- Seed lots for remanente-days view when there are positive balances
-- and there is no current open lot.
INSERT INTO public.inventory_lots (
  item_id,
  warehouse_id,
  lot_code,
  received_at,
  qty_received,
  qty_remaining,
  unit_cost,
  source,
  external_ref,
  created_at,
  updated_at
)
SELECT
  b.item_id,
  b.warehouse_id,
  'REBUILD-' || to_char(now(), 'YYYYMMDD') AS lot_code,
  COALESCE(b.source_ts, now()),
  b.qty_on_hand,
  b.qty_on_hand,
  i.price,
  'rebuild_seed',
  'rebuild_balance_from_snapshots',
  now(),
  now()
FROM public.inventory_balance b
JOIN public.items i ON i.id = b.item_id
WHERE b.qty_on_hand > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_lots l
    WHERE l.item_id = b.item_id
      AND l.warehouse_id = b.warehouse_id
      AND l.qty_remaining > 0
  );

COMMIT;

-- Quick checks:
-- select count(*) from public.inventory_balance;
-- select count(*) from public.inventory_balance where qty_on_hand <> 0;
-- select count(*) from public.items where stock_total <> 0;

