-- ============================================================
-- SALES PRICING PROFILES V2 - Catálogo de listas de precios
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.price_profiles (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  currency_code TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_profiles_active
  ON public.price_profiles(active, name);

-- Semilla opcional de listas comunes (ajusta nombres/códigos según negocio)
INSERT INTO public.price_profiles (code, name, currency_code, active) VALUES
  ('barato', 'Barato', 'USD', TRUE),
  ('precio_r1', 'Precio R1', 'USD', TRUE),
  ('precio_r1_plus', 'Precio de R1+', 'USD', TRUE),
  ('precio_especial', 'Precio Especial', 'USD', TRUE)
ON CONFLICT (code) DO NOTHING;

