-- Agregar columna category a la tabla items
-- Ejecutar ANTES del script assign-categories.sql

-- Agregar columna category si no existe
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS category text DEFAULT 'Sin categoría';

-- Verificar que la columna se agregó correctamente
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'items'
  AND column_name = 'category';

-- Ver estructura completa de la tabla
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'items'
ORDER BY ordinal_position;
