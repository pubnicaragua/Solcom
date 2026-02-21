

-- 1) Permitir SKUs duplicados (Zoho puede repetir)
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_sku_key;
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_sku_unique;

-- 2) Limpiar columnas legacy en movimientos (opcional)
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_warehouse_id_fkey;
ALTER TABLE stock_movements DROP COLUMN IF EXISTS warehouse_id;
ALTER TABLE stock_movements DROP COLUMN IF EXISTS qty_change;

-- 3) Evitar snapshots duplicados del mismo evento
CREATE UNIQUE INDEX IF NOT EXISTS stock_snapshots_unique_snapshot
ON stock_snapshots (warehouse_id, item_id, source_ts);
