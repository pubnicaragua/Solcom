-- ============================================================
-- MÓDULO DE FACTURACIÓN - Migración clientes Zoho
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS zoho_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS zoho_last_modified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_source TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  ALTER TABLE customers
    ADD CONSTRAINT customers_sync_source_check
    CHECK (sync_source IN ('manual', 'zoho'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

DROP INDEX IF EXISTS idx_customers_zoho_contact_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_zoho_contact_id_unique
  ON customers (zoho_contact_id);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
