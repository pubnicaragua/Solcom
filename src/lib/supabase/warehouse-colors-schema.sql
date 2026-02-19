-- =====================================================
-- SCHEMA DE COLORES DE BODEGAS - SOLIS COMERCIAL
-- =====================================================
-- Ejecutar este SQL en Supabase SQL Editor

-- 1. Crear tabla de colores de bodegas
CREATE TABLE IF NOT EXISTS warehouse_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code TEXT NOT NULL UNIQUE,
  warehouse_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6', -- Color en formato hex
  text_color TEXT NOT NULL DEFAULT '#FFFFFF', -- Color del texto
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Habilitar RLS
ALTER TABLE warehouse_colors ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS
CREATE POLICY "Todos pueden ver colores de bodegas"
  ON warehouse_colors
  FOR SELECT
  USING (true);

CREATE POLICY "Solo admins pueden modificar colores de bodegas"
  ON warehouse_colors
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 4. Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_warehouse_colors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS warehouse_colors_updated_at ON warehouse_colors;
CREATE TRIGGER warehouse_colors_updated_at
  BEFORE UPDATE ON warehouse_colors
  FOR EACH ROW
  EXECUTE FUNCTION update_warehouse_colors_updated_at();

-- 6. Insertar colores por defecto para las bodegas existentes
-- Colores tipo Kanban diferenciados
INSERT INTO warehouse_colors (warehouse_code, warehouse_name, color, text_color) VALUES
  ('X1', 'Bodega X1', '#3B82F6', '#FFFFFF'),
  ('X2', 'Bodega X2', '#8B5CF6', '#FFFFFF'),
  ('X3', 'Bodega X3', '#10B981', '#FFFFFF'),
  ('X4', 'Bodega X4', '#F59E0B', '#000000'),
  ('X5', 'Bodega X5', '#EF4444', '#FFFFFF'),
  ('X6', 'Bodega X6', '#EC4899', '#FFFFFF'),
  ('X7', 'Bodega X7', '#14B8A6', '#FFFFFF'),
  ('X8', 'Bodega X8', '#F97316', '#FFFFFF'),
  ('X9', 'Bodega X9', '#6366F1', '#FFFFFF'),
  ('X10', 'Bodega X10', '#84CC16', '#000000'),
  ('Z-1', 'Bodega Z-1', '#06B6D4', '#FFFFFF'),
  ('Z-2', 'Bodega Z-2', '#A855F7', '#FFFFFF')
ON CONFLICT (warehouse_code) DO NOTHING;
