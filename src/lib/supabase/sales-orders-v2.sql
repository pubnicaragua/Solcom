-- ============================================================
-- SALES ORDERS V2 - Campos comerciales para edición avanzada
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS delivery_method TEXT,
  ADD COLUMN IF NOT EXISTS shipping_zone TEXT,
  ADD COLUMN IF NOT EXISTS salesperson_id UUID;

CREATE INDEX IF NOT EXISTS idx_sales_orders_reference_number ON sales_orders(reference_number);
CREATE INDEX IF NOT EXISTS idx_sales_orders_payment_terms ON sales_orders(payment_terms);
CREATE INDEX IF NOT EXISTS idx_sales_orders_salesperson_id ON sales_orders(salesperson_id);
