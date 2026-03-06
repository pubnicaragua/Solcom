-- ============================================================
-- SALES PRICING PROFILES V1 - Base de tarifas Fase 2
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.item_price_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  warehouse_id UUID NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  profile_code TEXT NOT NULL,
  unit_price NUMERIC(12,4) NOT NULL DEFAULT 0,
  currency_code TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT item_price_profiles_unit_price_non_negative CHECK (unit_price >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_price_profiles_global
  ON public.item_price_profiles(item_id, profile_code)
  WHERE warehouse_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_price_profiles_by_warehouse
  ON public.item_price_profiles(item_id, warehouse_id, profile_code)
  WHERE warehouse_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_item_price_profiles_lookup
  ON public.item_price_profiles(profile_code, item_id, warehouse_id)
  WHERE active = TRUE;

ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS price_profile_code TEXT;

ALTER TABLE public.sales_invoice_items
  ADD COLUMN IF NOT EXISTS price_profile_code TEXT;

ALTER TABLE public.sales_quote_items
  ADD COLUMN IF NOT EXISTS price_profile_code TEXT;

