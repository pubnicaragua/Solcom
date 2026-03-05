-- ============================================================
-- SALES FISCAL V4 - Impuesto por línea + garantía por línea
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS tax_name TEXT,
  ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warranty TEXT;

ALTER TABLE public.sales_invoice_items
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS tax_name TEXT,
  ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warranty TEXT;

ALTER TABLE public.sales_quote_items
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS tax_name TEXT,
  ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warranty TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_order_items_tax_percentage_range'
  ) THEN
    ALTER TABLE public.sales_order_items
      ADD CONSTRAINT sales_order_items_tax_percentage_range
      CHECK (tax_percentage >= 0 AND tax_percentage <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_invoice_items_tax_percentage_range'
  ) THEN
    ALTER TABLE public.sales_invoice_items
      ADD CONSTRAINT sales_invoice_items_tax_percentage_range
      CHECK (tax_percentage >= 0 AND tax_percentage <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_quote_items_tax_percentage_range'
  ) THEN
    ALTER TABLE public.sales_quote_items
      ADD CONSTRAINT sales_quote_items_tax_percentage_range
      CHECK (tax_percentage >= 0 AND tax_percentage <= 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_order_items_tax_id
  ON public.sales_order_items(tax_id);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_tax_id
  ON public.sales_invoice_items(tax_id);

CREATE INDEX IF NOT EXISTS idx_sales_quote_items_tax_id
  ON public.sales_quote_items(tax_id);
