CREATE OR REPLACE FUNCTION public.get_restock_analytics(p_weeks integer DEFAULT 4)
RETURNS TABLE (
  item_id uuid,
  sku text,
  name text,
  price numeric,
  stock_total integer,
  sales_sum bigint,
  weekly_avg numeric,
  restock_sugerido numeric,
  presupuesto numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.sku,
    i.name,
    COALESCE(i.price, 0) AS price,
    i.stock_total,
    COALESCE(SUM(ABS(e.qty_delta)), 0) AS sales_sum,
    ROUND(COALESCE(SUM(ABS(e.qty_delta)), 0)::numeric / p_weeks, 2) AS weekly_avg,
    ROUND(COALESCE(SUM(ABS(e.qty_delta)), 0)::numeric / p_weeks, 2) AS restock_sugerido,
    ROUND(COALESCE(SUM(ABS(e.qty_delta)), 0)::numeric / p_weeks * COALESCE(i.price, 0), 2) AS presupuesto
  FROM public.items i
  LEFT JOIN public.inventory_events e 
    ON e.item_id = i.id 
   AND e.event_type = 'sale'
   AND e.source = 'webhook_invoice'
   AND e.external_ts >= (now() - (p_weeks || ' weeks')::interval)
  GROUP BY i.id, i.sku, i.name, i.price, i.stock_total
  HAVING COALESCE(SUM(ABS(e.qty_delta)), 0) > 0;
END;
$$;

-- Zoho-backed sales snapshot for Compras.
-- These tables are read models only; they do not update inventory stock.
CREATE TABLE IF NOT EXISTS public.zoho_invoice_sales_documents (
  zoho_invoice_id text PRIMARY KEY,
  invoice_number text,
  status text,
  invoice_date date,
  customer_name text,
  total numeric NOT NULL DEFAULT 0,
  zoho_last_modified_at timestamp with time zone,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.zoho_invoice_sales_lines (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  zoho_invoice_id text NOT NULL,
  zoho_invoice_number text,
  zoho_line_item_id text NOT NULL,
  zoho_item_id text NOT NULL,
  local_item_id uuid,
  sku text,
  item_name text,
  invoice_date date NOT NULL,
  invoice_status text,
  quantity numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  location_id text,
  location_name text,
  zoho_last_modified_at timestamp with time zone,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT zoho_invoice_sales_lines_pkey PRIMARY KEY (id),
  CONSTRAINT zoho_invoice_sales_lines_unique UNIQUE (zoho_invoice_id, zoho_line_item_id),
  CONSTRAINT zoho_invoice_sales_lines_document_fkey
    FOREIGN KEY (zoho_invoice_id)
    REFERENCES public.zoho_invoice_sales_documents(zoho_invoice_id)
    ON DELETE CASCADE,
  CONSTRAINT zoho_invoice_sales_lines_item_fkey
    FOREIGN KEY (local_item_id)
    REFERENCES public.items(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_zoho_invoice_sales_lines_local_item_date
  ON public.zoho_invoice_sales_lines(local_item_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_zoho_invoice_sales_lines_zoho_item_date
  ON public.zoho_invoice_sales_lines(zoho_item_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_zoho_invoice_sales_lines_invoice_date
  ON public.zoho_invoice_sales_lines(invoice_date DESC);

CREATE OR REPLACE FUNCTION public.get_restock_analytics_zoho(
  p_weeks integer DEFAULT 4,
  p_days integer DEFAULT 30,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  item_id uuid,
  sku text,
  name text,
  price numeric,
  stock_total integer,
  sales_sum bigint,
  weekly_avg numeric,
  restock_sugerido numeric,
  presupuesto numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_date_to date := COALESCE(p_date_to, (now() AT TIME ZONE 'America/Managua')::date);
  v_weeks integer := GREATEST(COALESCE(p_weeks, 4), 1);
  v_days integer := GREATEST(COALESCE(p_days, 30), 1);
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.sku,
    i.name,
    COALESCE(i.price, 0) AS price,
    i.stock_total,
    ROUND(COALESCE(SUM(z.quantity), 0), 0)::bigint AS sales_sum,
    ROUND(COALESCE(SUM(z.quantity), 0)::numeric / v_weeks, 2) AS weekly_avg,
    ROUND(COALESCE(SUM(z.quantity), 0)::numeric / v_weeks, 2) AS restock_sugerido,
    ROUND(COALESCE(SUM(z.quantity), 0)::numeric / v_weeks * COALESCE(i.price, 0), 2) AS presupuesto
  FROM public.items i
  LEFT JOIN public.zoho_invoice_sales_lines z
    ON z.local_item_id = i.id
   AND z.invoice_date >= (v_date_to - v_days)
   AND z.invoice_date <= v_date_to
   AND COALESCE(z.invoice_status, '') NOT IN ('void', 'draft', 'cancelled', 'cancelled_void')
  GROUP BY i.id, i.sku, i.name, i.price, i.stock_total
  HAVING COALESCE(SUM(z.quantity), 0) > 0;
END;
$$;
