-- Manual repair for one SKU when Zoho API is rate-limited (429).
-- 1) Edit target_sku.
-- 2) Edit expected_qty rows using your Zoho "Ubicaciones de existencias" screen.
-- 3) Run entire script.

BEGIN;

WITH target_item AS (
  SELECT id
  FROM public.items
  WHERE sku = 'CUBO -IPHONE 20W'
  LIMIT 1
),
expected_qty AS (
  -- code, qty_on_hand (include negatives if applicable)
  SELECT * FROM (VALUES
    ('SOLIS COMERCIAL', 29),
    ('X8', -1),
    ('001 - CALL/M-E', -5)
  ) AS t(code, qty)
),
resolved AS (
  SELECT
    ti.id AS item_id,
    w.id AS warehouse_id,
    e.qty::integer AS qty
  FROM target_item ti
  JOIN expected_qty e ON true
  JOIN public.warehouses w ON w.code = e.code
)
-- Replace snapshots only for this item.
DELETE FROM public.stock_snapshots
WHERE item_id IN (SELECT id FROM target_item);

INSERT INTO public.stock_snapshots (item_id, warehouse_id, qty, source_ts, synced_at)
SELECT item_id, warehouse_id, qty, now(), now()
FROM resolved;

-- Keep v2 balance in sync with repaired snapshots.
DELETE FROM public.inventory_balance
WHERE item_id IN (SELECT id FROM target_item);

INSERT INTO public.inventory_balance (item_id, warehouse_id, qty_on_hand, source, source_ts, updated_at)
SELECT item_id, warehouse_id, qty, 'manual_repair', now(), now()
FROM resolved
ON CONFLICT (item_id, warehouse_id) DO UPDATE
SET qty_on_hand = EXCLUDED.qty_on_hand,
    source = EXCLUDED.source,
    source_ts = EXCLUDED.source_ts,
    updated_at = now();

SELECT public.refresh_item_stock_total((SELECT id FROM target_item));

COMMIT;

-- Validate:
-- select s.item_id, w.code, s.qty from public.stock_snapshots s join public.warehouses w on w.id=s.warehouse_id where s.item_id=(select id from target_item) order by w.code;
-- select b.item_id, w.code, b.qty_on_hand from public.inventory_balance b join public.warehouses w on w.id=b.warehouse_id where b.item_id=(select id from target_item) order by w.code;
-- select sku, stock_total from public.items where id=(select id from target_item);

