-- ============================================================
-- SALES ORDERS V3 - Seriales por línea y bodega origen por línea
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE sales_order_items
  ADD COLUMN IF NOT EXISTS serial_number_value TEXT,
  ADD COLUMN IF NOT EXISTS line_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS line_zoho_warehouse_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_order_items_line_warehouse_id
  ON sales_order_items(line_warehouse_id);
