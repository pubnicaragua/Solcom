

CREATE TABLE IF NOT EXISTS public.sales_order_serial_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  serial_code TEXT NOT NULL,
  line_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  line_zoho_warehouse_id TEXT,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'consumed', 'released', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  reserved_by UUID,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  invoice_id UUID REFERENCES public.sales_invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_order_serial_reservations_order_status
  ON public.sales_order_serial_reservations(sales_order_id, status);

CREATE INDEX IF NOT EXISTS idx_sales_order_serial_reservations_expires_status
  ON public.sales_order_serial_reservations(expires_at, status);

CREATE INDEX IF NOT EXISTS idx_sales_order_serial_reservations_item_zoho_status
  ON public.sales_order_serial_reservations(item_id, line_zoho_warehouse_id, status);

CREATE INDEX IF NOT EXISTS idx_sales_order_serial_reservations_item_serial
  ON public.sales_order_serial_reservations(item_id, serial_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_order_serial_reservations_unique_active
  ON public.sales_order_serial_reservations(item_id, serial_code)
  WHERE status = 'reserved';

ALTER TABLE public.sales_invoice_items
  ADD COLUMN IF NOT EXISTS serial_number_value TEXT;

CREATE OR REPLACE FUNCTION public.trg_sales_order_serial_reservations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_order_serial_reservations_set_updated_at
  ON public.sales_order_serial_reservations;

CREATE TRIGGER sales_order_serial_reservations_set_updated_at
  BEFORE UPDATE ON public.sales_order_serial_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sales_order_serial_reservations_updated_at();

CREATE OR REPLACE FUNCTION public.fn_expire_serial_reservations()
RETURNS INTEGER AS $$
DECLARE
  v_expired_count INTEGER := 0;
BEGIN
  UPDATE public.sales_order_serial_reservations
  SET
    status = 'expired',
    released_at = now(),
    release_reason = COALESCE(release_reason, 'ttl_expired'),
    updated_at = now()
  WHERE
    status = 'reserved'
    AND expires_at < now();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  RETURN COALESCE(v_expired_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_replace_order_serial_reservations(
  p_order_id UUID,
  p_user_id UUID,
  p_ttl_minutes INTEGER DEFAULT 120,
  p_lines JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_order_status TEXT;
  v_effective_ttl INTEGER := GREATEST(1, COALESCE(p_ttl_minutes, 120));
  v_reserved_count INTEGER := 0;
  v_released_count INTEGER := 0;
  v_row_count INTEGER := 0;
  v_conflict_order_id UUID;
  v_conflict_order_number TEXT;
  v_line RECORD;
BEGIN
  PERFORM public.fn_expire_serial_reservations();

  SELECT status INTO v_order_status
  FROM public.sales_orders
  WHERE id = p_order_id
  LIMIT 1;

  IF v_order_status IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: order_id=%', p_order_id;
  END IF;

  IF v_order_status NOT IN ('borrador', 'confirmada') THEN
    RAISE EXCEPTION 'ORDER_NOT_RESERVABLE: order_id=% status=%', p_order_id, v_order_status;
  END IF;

  UPDATE public.sales_order_serial_reservations r
  SET
    status = 'released',
    released_at = now(),
    release_reason = 'line_removed',
    updated_at = now()
  WHERE
    r.sales_order_id = p_order_id
    AND r.status = 'reserved'
    AND NOT EXISTS (
      SELECT 1
      FROM (
        SELECT DISTINCT
          (NULLIF(BTRIM(elem->>'item_id'), ''))::uuid AS item_id,
          BTRIM(elem->>'serial_code') AS serial_code
        FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) elem
        WHERE
          BTRIM(COALESCE(elem->>'item_id', '')) <> ''
          AND BTRIM(COALESCE(elem->>'serial_code', '')) <> ''
      ) incoming
      WHERE incoming.item_id = r.item_id
        AND incoming.serial_code = r.serial_code
    );

  GET DIAGNOSTICS v_released_count = ROW_COUNT;

  FOR v_line IN
    SELECT DISTINCT
      (NULLIF(BTRIM(elem->>'item_id'), ''))::uuid AS item_id,
      BTRIM(elem->>'serial_code') AS serial_code,
      (NULLIF(BTRIM(elem->>'line_warehouse_id'), ''))::uuid AS line_warehouse_id,
      NULLIF(BTRIM(elem->>'line_zoho_warehouse_id'), '') AS line_zoho_warehouse_id
    FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) elem
    WHERE
      BTRIM(COALESCE(elem->>'item_id', '')) <> ''
      AND BTRIM(COALESCE(elem->>'serial_code', '')) <> ''
  LOOP
    INSERT INTO public.sales_order_serial_reservations (
      sales_order_id,
      item_id,
      serial_code,
      line_warehouse_id,
      line_zoho_warehouse_id,
      status,
      expires_at,
      reserved_by,
      reserved_at,
      updated_at
    ) VALUES (
      p_order_id,
      v_line.item_id,
      v_line.serial_code,
      v_line.line_warehouse_id,
      v_line.line_zoho_warehouse_id,
      'reserved',
      now() + make_interval(mins => v_effective_ttl),
      p_user_id,
      now(),
      now()
    )
    ON CONFLICT (item_id, serial_code)
      WHERE status = 'reserved'
    DO UPDATE
      SET
        line_warehouse_id = EXCLUDED.line_warehouse_id,
        line_zoho_warehouse_id = EXCLUDED.line_zoho_warehouse_id,
        expires_at = EXCLUDED.expires_at,
        reserved_by = EXCLUDED.reserved_by,
        reserved_at = EXCLUDED.reserved_at,
        updated_at = now()
      WHERE public.sales_order_serial_reservations.sales_order_id = p_order_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT r.sales_order_id, so.order_number
      INTO v_conflict_order_id, v_conflict_order_number
      FROM public.sales_order_serial_reservations r
      LEFT JOIN public.sales_orders so ON so.id = r.sales_order_id
      WHERE
        r.item_id = v_line.item_id
        AND r.serial_code = v_line.serial_code
        AND r.status = 'reserved'
      LIMIT 1;

      RAISE EXCEPTION
        'SERIAL_ALREADY_RESERVED: serial=%; item_id=%; order_id=%; order_number=%',
        v_line.serial_code,
        v_line.item_id,
        COALESCE(v_conflict_order_id::text, ''),
        COALESCE(v_conflict_order_number, '');
    END IF;

    v_reserved_count := v_reserved_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'reserved_count', COALESCE(v_reserved_count, 0),
    'released_count', COALESCE(v_released_count, 0),
    'ttl_minutes', v_effective_ttl
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_consume_order_serial_reservations(
  p_order_id UUID,
  p_invoice_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_consumed_count INTEGER := 0;
BEGIN
  PERFORM public.fn_expire_serial_reservations();

  UPDATE public.sales_order_serial_reservations
  SET
    status = 'consumed',
    invoice_id = COALESCE(p_invoice_id, invoice_id),
    consumed_at = now(),
    expires_at = now(),
    updated_at = now()
  WHERE
    sales_order_id = p_order_id
    AND status = 'reserved';

  GET DIAGNOSTICS v_consumed_count = ROW_COUNT;
  RETURN COALESCE(v_consumed_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_release_order_serial_reservations(
  p_order_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_released_count INTEGER := 0;
BEGIN
  UPDATE public.sales_order_serial_reservations
  SET
    status = 'released',
    released_at = now(),
    release_reason = COALESCE(NULLIF(BTRIM(p_reason), ''), 'released'),
    expires_at = now(),
    updated_at = now()
  WHERE
    sales_order_id = p_order_id
    AND status = 'reserved';

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN COALESCE(v_released_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.sales_order_serial_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_order_serial_reservations_authenticated_all
  ON public.sales_order_serial_reservations;
CREATE POLICY sales_order_serial_reservations_authenticated_all
  ON public.sales_order_serial_reservations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS sales_order_serial_reservations_service_role_all
  ON public.sales_order_serial_reservations;
CREATE POLICY sales_order_serial_reservations_service_role_all
  ON public.sales_order_serial_reservations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
