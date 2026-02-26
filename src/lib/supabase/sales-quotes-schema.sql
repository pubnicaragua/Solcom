-- 1. Tabla de Cotizaciones
CREATE TABLE IF NOT EXISTS sales_quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'borrador'
    CHECK (status IN ('borrador', 'enviada', 'aceptada', 'rechazada', 'vencida', 'convertida')),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  template_key TEXT,
  converted_invoice_id UUID REFERENCES sales_invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Líneas de cotización
CREATE TABLE IF NOT EXISTS sales_quote_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES sales_quotes(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON sales_quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON sales_quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_date ON sales_quotes(date DESC);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON sales_quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_converted_invoice ON sales_quotes(converted_invoice_id);

-- Función para número de cotización
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  year_prefix TEXT;
BEGIN
  year_prefix := to_char(CURRENT_DATE, 'YYYY');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(quote_number FROM '\d+$') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM sales_quotes
  WHERE quote_number LIKE 'COT-' || year_prefix || '-%';

  RETURN 'COT-' || year_prefix || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE sales_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access on sales_quotes"
  ON sales_quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on sales_quotes"
  ON sales_quotes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access on sales_quote_items"
  ON sales_quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on sales_quote_items"
  ON sales_quote_items FOR ALL TO service_role USING (true) WITH CHECK (true);
