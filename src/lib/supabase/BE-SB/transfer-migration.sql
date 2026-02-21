-- Transferencias entre bodegas - migracion
-- Ejecutar en Supabase SQL Editor

-- 1) Asegurar columna de mapeo Zoho en bodegas
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS zoho_warehouse_id TEXT;

-- 2) Ajustar tabla de movimientos para transferencias
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS to_warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS zoho_adjustment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_stock_movements_from_warehouse ON stock_movements(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_to_warehouse ON stock_movements(to_warehouse_id);

-- 3) Funcion transaccional para transferir stock
CREATE OR REPLACE FUNCTION transfer_stock(
  p_item_id UUID,
  p_from_warehouse_id UUID,
  p_to_warehouse_id UUID,
  p_quantity INTEGER,
  p_reason TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_from_qty INTEGER;
  v_to_qty INTEGER;
  v_transfer_id UUID;
  v_ts TIMESTAMP WITH TIME ZONE;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  IF p_from_warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION 'Warehouses must be different';
  END IF;

  SELECT cs.qty INTO v_from_qty
  FROM current_stock cs
  WHERE cs.item_id = p_item_id
    AND cs.warehouse_id = p_from_warehouse_id;

  IF v_from_qty IS NULL THEN
    RAISE EXCEPTION 'No stock in source warehouse';
  END IF;

  IF v_from_qty < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;

  SELECT cs.qty INTO v_to_qty
  FROM current_stock cs
  WHERE cs.item_id = p_item_id
    AND cs.warehouse_id = p_to_warehouse_id;

  IF v_to_qty IS NULL THEN
    v_to_qty := 0;
  END IF;

  INSERT INTO stock_movements (
    item_id,
    from_warehouse_id,
    to_warehouse_id,
    quantity,
    movement_type,
    status,
    reason
  ) VALUES (
    p_item_id,
    p_from_warehouse_id,
    p_to_warehouse_id,
    p_quantity,
    'transfer',
    'completed',
    p_reason
  )
  RETURNING id INTO v_transfer_id;

  v_ts := NOW();

  INSERT INTO stock_snapshots (
    warehouse_id,
    item_id,
    qty,
    source_ts,
    synced_at
  ) VALUES (
    p_from_warehouse_id,
    p_item_id,
    v_from_qty - p_quantity,
    v_ts,
    v_ts
  );

  INSERT INTO stock_snapshots (
    warehouse_id,
    item_id,
    qty,
    source_ts,
    synced_at
  ) VALUES (
    p_to_warehouse_id,
    p_item_id,
    v_to_qty + p_quantity,
    v_ts + INTERVAL '1 microsecond',
    v_ts + INTERVAL '1 microsecond'
  );

  RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql;
