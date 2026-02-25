-- ============================================================
-- MÓDULO DE FACTURACIÓN - Schema SQL
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Tabla de Clientes
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  ruc TEXT,              -- RUC o Cédula
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de Facturas
CREATE TABLE IF NOT EXISTS sales_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'borrador'
    CHECK (status IN ('borrador', 'enviada', 'pagada', 'vencida', 'cancelada')),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabla de Líneas de Factura
CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON sales_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON sales_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON sales_invoices(date DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON sales_invoice_items(invoice_id);

-- Función para auto-incrementar número de factura
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  year_prefix TEXT;
BEGIN
  year_prefix := to_char(CURRENT_DATE, 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM '\d+$') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM sales_invoices
  WHERE invoice_number LIKE 'FAC-' || year_prefix || '-%';

  RETURN 'FAC-' || year_prefix || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- RLS Policies (ajustar según necesidad)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_items ENABLE ROW LEVEL SECURITY;

-- Policy: allow authenticated users full access
CREATE POLICY "Allow authenticated full access on customers"
  ON customers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated full access on sales_invoices"
  ON sales_invoices FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated full access on sales_invoice_items"
  ON sales_invoice_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow service_role full access (for API routes)
CREATE POLICY "Allow service_role full access on customers"
  ON customers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service_role full access on sales_invoices"
  ON sales_invoices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service_role full access on sales_invoice_items"
  ON sales_invoice_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
