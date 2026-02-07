-- Solis Comercial Database Schema
-- Execute this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  zoho_warehouse_id TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS zoho_warehouse_id TEXT;

-- Items table
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  state TEXT,
  zoho_item_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stock snapshots table
CREATE TABLE IF NOT EXISTS stock_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL DEFAULT 0,
  source_ts TIMESTAMP WITH TIME ZONE NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(warehouse_id, item_id, source_ts)
);

-- Stock movements table (optional, for phase 2)
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
  to_warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  movement_type TEXT NOT NULL,
  status TEXT DEFAULT 'completed',
  reason TEXT,
  document_id TEXT,
  zoho_adjustment_id TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS to_warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS zoho_adjustment_id TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_snapshots_warehouse ON stock_snapshots(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_snapshots_item ON stock_snapshots(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_snapshots_synced_at ON stock_snapshots(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_from_warehouse ON stock_movements(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_to_warehouse ON stock_movements(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
CREATE INDEX IF NOT EXISTS idx_warehouses_code ON warehouses(code);

-- Row Level Security (RLS)
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- Policies (allow all for now, refine later with auth)
CREATE POLICY "Allow all operations on warehouses" ON warehouses FOR ALL USING (true);
CREATE POLICY "Allow all operations on items" ON items FOR ALL USING (true);
CREATE POLICY "Allow all operations on stock_snapshots" ON stock_snapshots FOR ALL USING (true);
CREATE POLICY "Allow all operations on stock_movements" ON stock_movements FOR ALL USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for current stock (latest snapshot per warehouse/item)
CREATE OR REPLACE VIEW current_stock AS
SELECT DISTINCT ON (ss.warehouse_id, ss.item_id)
  ss.id,
  ss.warehouse_id,
  w.code AS warehouse_code,
  w.name AS warehouse_name,
  ss.item_id,
  i.sku,
  i.name AS item_name,
  i.color,
  i.state,
  ss.qty,
  ss.source_ts,
  ss.synced_at
FROM stock_snapshots ss
JOIN warehouses w ON ss.warehouse_id = w.id
JOIN items i ON ss.item_id = i.id
WHERE w.active = true
ORDER BY ss.warehouse_id, ss.item_id, ss.synced_at DESC;

-- Transfer stock between warehouses with audit trail
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
