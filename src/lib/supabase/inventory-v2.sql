-- Inventory V2 model
-- Purpose: move from snapshot-driven runtime queries to event + balance model.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0) Normalize weak column types used by reporting/stock logic.
ALTER TABLE public.items
  ALTER COLUMN stock_total TYPE integer USING stock_total::integer;

ALTER TABLE public.items
  ALTER COLUMN price TYPE numeric(14,2)
  USING CASE
    WHEN price IS NULL THEN NULL
    ELSE round(price::numeric, 2)
  END;

-- 1) Current stock by item + warehouse (single source of truth for "now").
CREATE TABLE IF NOT EXISTS public.inventory_balance (
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  qty_on_hand integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'sync',
  source_ts timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_balance_pkey PRIMARY KEY (item_id, warehouse_id)
);

-- Legacy runs may have created a non-negative check; drop it to allow negative stock balances.
ALTER TABLE public.inventory_balance
  DROP CONSTRAINT IF EXISTS inventory_balance_qty_on_hand_check;

CREATE INDEX IF NOT EXISTS idx_inventory_balance_warehouse_id
  ON public.inventory_balance(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balance_updated_at
  ON public.inventory_balance(updated_at DESC);

-- 2) Immutable event ledger with idempotency.
CREATE TABLE IF NOT EXISTS public.inventory_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key text NOT NULL UNIQUE,
  source text NOT NULL, -- webhook, erp, full_sync, manual, transfer
  event_type text NOT NULL, -- absolute_set, delta, transfer_out, transfer_in, sale, purchase, adjustment, sync
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  qty_delta integer,
  qty_before integer,
  qty_after integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_ts timestamp with time zone,
  processed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_events_item_created
  ON public.inventory_events(item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_events_warehouse_created
  ON public.inventory_events(warehouse_id, created_at DESC);

-- 3) Webhook inbox for traceability and replay.
CREATE TABLE IF NOT EXISTS public.webhook_inbox (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider text NOT NULL, -- zoho, erp, etc
  source_event_id text,
  idempotency_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  status text NOT NULL DEFAULT 'pending', -- pending, processed, failed, ignored
  error text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_inbox_provider_event
  ON public.webhook_inbox(provider, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_inbox_status_received
  ON public.webhook_inbox(status, received_at DESC);

-- 4) Lots/batches for aging and remanente.
CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  lot_code text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  qty_received integer NOT NULL CHECK (qty_received >= 0),
  qty_remaining integer NOT NULL CHECK (qty_remaining >= 0),
  unit_cost numeric(14,2),
  source text NOT NULL DEFAULT 'purchase',
  external_ref text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_item_wh
  ON public.inventory_lots(item_id, warehouse_id, received_at ASC);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_qty_remaining
  ON public.inventory_lots(qty_remaining)
  WHERE qty_remaining > 0;

-- Updated-at helper.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_balance_set_updated_at ON public.inventory_balance;
CREATE TRIGGER trg_inventory_balance_set_updated_at
BEFORE UPDATE ON public.inventory_balance
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_lots_set_updated_at ON public.inventory_lots;
CREATE TRIGGER trg_inventory_lots_set_updated_at
BEFORE UPDATE ON public.inventory_lots
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Keep items.stock_total in sync with active warehouses.
CREATE OR REPLACE FUNCTION public.refresh_item_stock_total(p_item_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_item_id IS NULL THEN
    UPDATE public.items i
    SET stock_total = COALESCE(agg.qty_total, 0)
    FROM (
      SELECT b.item_id, SUM(b.qty_on_hand)::integer AS qty_total
      FROM public.inventory_balance b
      JOIN public.warehouses w ON w.id = b.warehouse_id
      WHERE w.active = true
      GROUP BY b.item_id
    ) agg
    WHERE i.id = agg.item_id;

    UPDATE public.items i
    SET stock_total = 0
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.inventory_balance b
      JOIN public.warehouses w ON w.id = b.warehouse_id
      WHERE b.item_id = i.id
        AND w.active = true
    );
  ELSE
    UPDATE public.items i
    SET stock_total = COALESCE((
      SELECT SUM(b.qty_on_hand)::integer
      FROM public.inventory_balance b
      JOIN public.warehouses w ON w.id = b.warehouse_id
      WHERE b.item_id = p_item_id
        AND w.active = true
    ), 0)
    WHERE i.id = p_item_id;
  END IF;
END;
$$;

-- 6) Atomic single-event applier with idempotency.
CREATE OR REPLACE FUNCTION public.apply_inventory_event(
  p_idempotency_key text,
  p_source text,
  p_event_type text,
  p_item_id uuid,
  p_warehouse_id uuid,
  p_qty_delta integer DEFAULT NULL,
  p_qty_after integer DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_external_ts timestamp with time zone DEFAULT NULL
)
RETURNS TABLE (
  applied boolean,
  event_id uuid,
  qty_before integer,
  qty_after integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id uuid;
  v_existing public.inventory_events%ROWTYPE;
  v_before integer;
  v_after integer;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  IF p_event_type NOT IN ('absolute_set', 'delta', 'transfer_out', 'transfer_in', 'sale', 'purchase', 'adjustment', 'sync') THEN
    RAISE EXCEPTION 'Unsupported event_type: %', p_event_type;
  END IF;

  BEGIN
    INSERT INTO public.inventory_events (
      idempotency_key, source, event_type, item_id, warehouse_id, qty_delta, payload, external_ts
    ) VALUES (
      p_idempotency_key, p_source, p_event_type, p_item_id, p_warehouse_id, p_qty_delta, COALESCE(p_payload, '{}'::jsonb), p_external_ts
    )
    RETURNING id INTO v_event_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.inventory_events
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    RETURN QUERY
    SELECT false, v_existing.id, v_existing.qty_before, v_existing.qty_after;
    RETURN;
  END;

  INSERT INTO public.inventory_balance (item_id, warehouse_id, qty_on_hand, source, source_ts, updated_at)
  VALUES (p_item_id, p_warehouse_id, 0, p_source, COALESCE(p_external_ts, now()), now())
  ON CONFLICT (item_id, warehouse_id) DO NOTHING;

  SELECT qty_on_hand
  INTO v_before
  FROM public.inventory_balance
  WHERE item_id = p_item_id
    AND warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF p_event_type = 'absolute_set' THEN
    IF p_qty_after IS NULL THEN
      RAISE EXCEPTION 'qty_after is required for absolute_set';
    END IF;
    v_after := p_qty_after;
  ELSE
    IF p_qty_delta IS NULL THEN
      RAISE EXCEPTION 'qty_delta is required for delta-like events';
    END IF;
    v_after := COALESCE(v_before, 0) + p_qty_delta;
  END IF;

  UPDATE public.inventory_balance
  SET qty_on_hand = v_after,
      source = p_source,
      source_ts = COALESCE(p_external_ts, now()),
      updated_at = now()
  WHERE item_id = p_item_id
    AND warehouse_id = p_warehouse_id;

  UPDATE public.inventory_events
  SET qty_before = v_before,
      qty_after = v_after,
      processed_at = now()
  WHERE id = v_event_id;

  PERFORM public.refresh_item_stock_total(p_item_id);

  RETURN QUERY
  SELECT true, v_event_id, v_before, v_after;
END;
$$;

-- 7) Atomic transfer helper (out + in with linked idempotency keys).
CREATE OR REPLACE FUNCTION public.apply_inventory_transfer(
  p_idempotency_key text,
  p_source text,
  p_item_id uuid,
  p_from_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_quantity integer,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_external_ts timestamp with time zone DEFAULT NULL
)
RETURNS TABLE (
  applied boolean,
  from_qty_after integer,
  to_qty_after integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_out record;
  v_in record;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be > 0';
  END IF;
  IF p_from_warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION 'from and to warehouse must be different';
  END IF;

  SELECT * INTO v_out
  FROM public.apply_inventory_event(
    p_idempotency_key || ':out',
    p_source,
    'transfer_out',
    p_item_id,
    p_from_warehouse_id,
    -p_quantity,
    NULL,
    p_payload,
    p_external_ts
  );

  SELECT * INTO v_in
  FROM public.apply_inventory_event(
    p_idempotency_key || ':in',
    p_source,
    'transfer_in',
    p_item_id,
    p_to_warehouse_id,
    p_quantity,
    NULL,
    p_payload,
    p_external_ts
  );

  RETURN QUERY
  SELECT (v_out.applied OR v_in.applied), v_out.qty_after, v_in.qty_after;
END;
$$;

-- 8) Backfill inventory_balance from the latest snapshot per item + warehouse.
INSERT INTO public.inventory_balance (item_id, warehouse_id, qty_on_hand, source, source_ts, updated_at)
SELECT
  latest.item_id,
  latest.warehouse_id,
  latest.qty AS qty_on_hand,
  'snapshot_backfill' AS source,
  latest.synced_at,
  now()
FROM (
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
) latest
WHERE latest.rn = 1
ON CONFLICT (item_id, warehouse_id)
DO UPDATE SET
  qty_on_hand = EXCLUDED.qty_on_hand,
  source = EXCLUDED.source,
  source_ts = EXCLUDED.source_ts,
  updated_at = now();

SELECT public.refresh_item_stock_total(NULL);

-- 8.1) Seed initial lots from current balances (approximate aging baseline).
-- This enables remanente-days reporting immediately after migration.
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
  'INIT-' || to_char(now(), 'YYYYMMDD') AS lot_code,
  COALESCE(
    (
      SELECT MIN(s.source_ts)
      FROM public.stock_snapshots s
      WHERE s.item_id = b.item_id
        AND s.warehouse_id = b.warehouse_id
        AND s.qty > 0
    ),
    b.source_ts,
    now()
  ) AS received_at,
  b.qty_on_hand AS qty_received,
  b.qty_on_hand AS qty_remaining,
  i.price AS unit_cost,
  'initial_balance' AS source,
  'inventory_v2_seed' AS external_ref,
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

-- 9) Operational views.
CREATE OR REPLACE VIEW public.v_item_stock_totals AS
SELECT
  i.id AS item_id,
  i.sku,
  i.name,
  COALESCE(SUM(b.qty_on_hand), 0)::integer AS total_all_warehouses,
  COALESCE(SUM(CASE WHEN w.active THEN b.qty_on_hand ELSE 0 END), 0)::integer AS total_active_warehouses
FROM public.items i
LEFT JOIN public.inventory_balance b ON b.item_id = i.id
LEFT JOIN public.warehouses w ON w.id = b.warehouse_id
GROUP BY i.id, i.sku, i.name;

CREATE OR REPLACE VIEW public.v_inventory_lot_aging AS
SELECT
  l.id,
  l.item_id,
  i.sku,
  i.name AS item_name,
  l.warehouse_id,
  w.code AS warehouse_code,
  l.lot_code,
  l.received_at,
  l.expires_at,
  l.qty_received,
  l.qty_remaining,
  l.unit_cost,
  GREATEST(0, floor(EXTRACT(epoch FROM (now() - l.received_at)) / 86400))::integer AS days_in_stock
FROM public.inventory_lots l
JOIN public.items i ON i.id = l.item_id
JOIN public.warehouses w ON w.id = l.warehouse_id
WHERE l.qty_remaining > 0;
