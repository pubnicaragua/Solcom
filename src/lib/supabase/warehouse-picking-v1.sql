-- ============================================================
-- Warehouse Picking V1
-- Flujo: OV confirmada -> cola de alistamiento en bodega
-- ============================================================

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS delivery_requested BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.warehouse_pick_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL UNIQUE REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  sales_order_number TEXT,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  salesperson_id UUID,
  salesperson_name TEXT,
  delivery_requested BOOLEAN NOT NULL DEFAULT false,
  delivery_method TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'queued',
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  last_synced_from_order_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_pick_orders_priority_chk
    CHECK (priority IN ('urgent', 'normal')),
  CONSTRAINT warehouse_pick_orders_status_chk
    CHECK (
      status IN (
        'queued',
        'claimed',
        'picking',
        'ready',
        'completed_floor',
        'completed_dispatch',
        'cancelled'
      )
    )
);

CREATE TABLE IF NOT EXISTS public.warehouse_pick_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_order_id UUID NOT NULL REFERENCES public.warehouse_pick_orders(id) ON DELETE CASCADE,
  sales_order_item_id UUID REFERENCES public.sales_order_items(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  serials_required BOOLEAN NOT NULL DEFAULT false,
  serial_numbers_requested TEXT,
  serial_numbers_selected TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_pick_order_items_quantity_chk
    CHECK (quantity >= 0)
);

CREATE TABLE IF NOT EXISTS public.warehouse_pick_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_order_id UUID NOT NULL REFERENCES public.warehouse_pick_orders(id) ON DELETE CASCADE,
  sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_pick_orders_queue
  ON public.warehouse_pick_orders (warehouse_id, status, priority, queued_at, created_at);

CREATE INDEX IF NOT EXISTS idx_warehouse_pick_orders_sales_order_id
  ON public.warehouse_pick_orders (sales_order_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_pick_orders_assigned
  ON public.warehouse_pick_orders (assigned_user_id, status);

CREATE INDEX IF NOT EXISTS idx_warehouse_pick_orders_status_created
  ON public.warehouse_pick_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_pick_order_items_pick_order
  ON public.warehouse_pick_order_items (pick_order_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_warehouse_pick_events_pick_order
  ON public.warehouse_pick_events (pick_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_pick_events_sales_order
  ON public.warehouse_pick_events (sales_order_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_warehouse_pick_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.bump_warehouse_pick_orders_row_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.row_version := COALESCE(OLD.row_version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_warehouse_pick_order_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_warehouse_pick_orders_updated_at ON public.warehouse_pick_orders;
CREATE TRIGGER trg_warehouse_pick_orders_updated_at
BEFORE UPDATE ON public.warehouse_pick_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_warehouse_pick_orders_updated_at();

DROP TRIGGER IF EXISTS trg_warehouse_pick_orders_row_version ON public.warehouse_pick_orders;
CREATE TRIGGER trg_warehouse_pick_orders_row_version
BEFORE UPDATE ON public.warehouse_pick_orders
FOR EACH ROW
EXECUTE FUNCTION public.bump_warehouse_pick_orders_row_version();

DROP TRIGGER IF EXISTS trg_warehouse_pick_order_items_updated_at ON public.warehouse_pick_order_items;
CREATE TRIGGER trg_warehouse_pick_order_items_updated_at
BEFORE UPDATE ON public.warehouse_pick_order_items
FOR EACH ROW
EXECUTE FUNCTION public.update_warehouse_pick_order_items_updated_at();

ALTER TABLE public.warehouse_pick_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_pick_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_pick_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_pick_orders'
      AND policyname = 'Allow authenticated full access on warehouse_pick_orders'
  ) THEN
    CREATE POLICY "Allow authenticated full access on warehouse_pick_orders"
      ON public.warehouse_pick_orders
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_pick_order_items'
      AND policyname = 'Allow authenticated full access on warehouse_pick_order_items'
  ) THEN
    CREATE POLICY "Allow authenticated full access on warehouse_pick_order_items"
      ON public.warehouse_pick_order_items
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_pick_events'
      AND policyname = 'Allow authenticated full access on warehouse_pick_events'
  ) THEN
    CREATE POLICY "Allow authenticated full access on warehouse_pick_events"
      ON public.warehouse_pick_events
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_pick_orders'
      AND policyname = 'Allow service_role full access on warehouse_pick_orders'
  ) THEN
    CREATE POLICY "Allow service_role full access on warehouse_pick_orders"
      ON public.warehouse_pick_orders
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_pick_order_items'
      AND policyname = 'Allow service_role full access on warehouse_pick_order_items'
  ) THEN
    CREATE POLICY "Allow service_role full access on warehouse_pick_order_items"
      ON public.warehouse_pick_order_items
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_pick_events'
      AND policyname = 'Allow service_role full access on warehouse_pick_events'
  ) THEN
    CREATE POLICY "Allow service_role full access on warehouse_pick_events"
      ON public.warehouse_pick_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;
