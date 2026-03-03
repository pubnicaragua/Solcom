
-- 1) Tabla: sales_orders
CREATE TABLE IF NOT EXISTS sales_orders (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number    TEXT NOT NULL UNIQUE,
    customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    warehouse_id    UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    date            DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    status          TEXT NOT NULL DEFAULT 'borrador'
                    CHECK (status IN ('borrador','confirmada','convertida','cancelada')),
    subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 15,
    tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    salesperson_name TEXT,
    source          TEXT,

    -- Zoho sync metadata
    zoho_salesorder_id      TEXT,
    zoho_salesorder_number  TEXT,
    zoho_synced_at          TIMESTAMPTZ,

    -- Conversion tracking
    converted_invoice_id    UUID,

    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 2) Tabla: sales_order_items
CREATE TABLE IF NOT EXISTS sales_order_items (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id        UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    item_id         UUID,
    description     TEXT NOT NULL DEFAULT '',
    quantity        NUMERIC(14,4) NOT NULL DEFAULT 0,
    unit_price      NUMERIC(14,4) NOT NULL DEFAULT 0,
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON sales_orders(date);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON sales_order_items(order_id);

-- 4) Funcion para generar el numero de orden de venta
CREATE OR REPLACE FUNCTION generate_sales_order_number()
RETURNS TEXT AS $$
DECLARE
    current_year INT;
    prefix TEXT;
    latest_number TEXT;
    next_num INT;
BEGIN
    current_year := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
    prefix := 'OV-' || current_year || '-';

    SELECT order_number INTO latest_number
    FROM sales_orders
    WHERE order_number ILIKE prefix || '%'
    ORDER BY order_number DESC
    LIMIT 1;

    IF latest_number IS NOT NULL THEN
        next_num := COALESCE(
            NULLIF(regexp_replace(latest_number, '.*-(\d+)$', '\1'), '')::INT,
            0
        ) + 1;
    ELSE
        next_num := 1;
    END IF;

    RETURN prefix || LPAD(next_num::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- 5) autogenerar updated_at y created_at al insertar o actualizar
CREATE OR REPLACE FUNCTION update_sales_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_orders_updated_at ON sales_orders;
CREATE TRIGGER trg_sales_orders_updated_at
    BEFORE UPDATE ON sales_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_sales_orders_updated_at();

-- 6) RLS policies (Manejo de la seguridad)
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;

-- manejar el acceso total a estas tablas para evitar errores de creacion y actualizacion
CREATE POLICY "sales_orders_all" ON sales_orders
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "sales_order_items_all" ON sales_order_items
    FOR ALL USING (true) WITH CHECK (true);
