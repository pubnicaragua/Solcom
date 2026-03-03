-- =====================================================
-- Agregar jerarquía de bodegas (empresarial/almacén)
-- =====================================================
-- Ejecutar en Supabase SQL Editor
-- NO modifica columnas existentes, solo agrega nuevas

-- 1. Tipo de bodega: 'empresarial' o 'almacen'
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS warehouse_type TEXT;

-- 2. Referencia al padre (empresarial) para almacenes hijos
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS parent_warehouse_id UUID REFERENCES warehouses(id);

-- 3. ID de ubicación en Zoho Books (locations API, diferente de warehouse_id de Inventory)
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS zoho_location_id TEXT;

-- 4. Indice para búsquedas por tipo y por padre
CREATE INDEX IF NOT EXISTS idx_warehouses_type ON warehouses(warehouse_type);
CREATE INDEX IF NOT EXISTS idx_warehouses_parent ON warehouses(parent_warehouse_id);
