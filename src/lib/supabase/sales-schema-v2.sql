-- ============================================================
-- MÓDULO DE FACTURACIÓN V2 - Migración de campos adicionales
-- Ejecutar en Supabase SQL Editor DESPUÉS del schema inicial
-- ============================================================

-- 1. Tabla de Deliverys (repartidores)
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de Motivos de Anulación
CREATE TABLE IF NOT EXISTS cancellation_reasons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Nuevas columnas en sales_invoices
ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS terms TEXT,
  ADD COLUMN IF NOT EXISTS salesperson_id UUID,
  ADD COLUMN IF NOT EXISTS delivery_requested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_detail TEXT,
  ADD COLUMN IF NOT EXISTS shipping_charge NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_reason_id UUID REFERENCES cancellation_reasons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_comments TEXT;

-- Índices
CREATE INDEX IF NOT EXISTS idx_deliveries_active ON deliveries(active);
CREATE INDEX IF NOT EXISTS idx_cancellation_reasons_active ON cancellation_reasons(active, sort_order);
CREATE INDEX IF NOT EXISTS idx_invoices_warehouse ON sales_invoices(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_invoices_salesperson ON sales_invoices(salesperson_id);

-- RLS Policies
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access on deliveries"
  ON deliveries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on deliveries"
  ON deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access on cancellation_reasons"
  ON cancellation_reasons FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on cancellation_reasons"
  ON cancellation_reasons FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Motivos de anulación iniciales (opcionales)
INSERT INTO cancellation_reasons (label, sort_order) VALUES
  ('Error en datos del cliente', 1),
  ('Producto agotado', 2),
  ('Cliente canceló el pedido', 3),
  ('Duplicado', 4),
  ('Error en precio o descuento', 5),
  ('Otro', 99)
ON CONFLICT DO NOTHING;
