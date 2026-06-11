-- ============================================================
-- Warehouse Picking Serial Scan V2
-- Seriales se asignan durante alistamiento, no al crear la OV.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.warehouse_pick_serial_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_order_id UUID NOT NULL REFERENCES public.warehouse_pick_orders(id) ON DELETE CASCADE,
  pick_order_item_id UUID NOT NULL REFERENCES public.warehouse_pick_order_items(id) ON DELETE CASCADE,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  sales_order_item_id UUID REFERENCES public.sales_order_items(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  serial_code TEXT NOT NULL,
  scanned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_pick_serial_scans_order_serial
  ON public.warehouse_pick_serial_scans (sales_order_id, item_id, serial_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_pick_serial_scans_active_serial
  ON public.warehouse_pick_serial_scans (item_id, serial_code);

CREATE INDEX IF NOT EXISTS idx_warehouse_pick_serial_scans_pick_item
  ON public.warehouse_pick_serial_scans (pick_order_item_id, scanned_at);

ALTER TABLE public.warehouse_pick_serial_scans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_pick_serial_scans'
      AND policyname = 'Allow authenticated full access on warehouse_pick_serial_scans'
  ) THEN
    CREATE POLICY "Allow authenticated full access on warehouse_pick_serial_scans"
      ON public.warehouse_pick_serial_scans
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_pick_serial_scans'
      AND policyname = 'Allow service_role full access on warehouse_pick_serial_scans'
  ) THEN
    CREATE POLICY "Allow service_role full access on warehouse_pick_serial_scans"
      ON public.warehouse_pick_serial_scans
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END;
$$;
