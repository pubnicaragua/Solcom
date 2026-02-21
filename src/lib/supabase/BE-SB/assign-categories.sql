-- Script para asignar categorías a productos basándose en el nombre del producto
-- Ejecutar en Supabase SQL Editor

-- Actualizar productos con categorías basadas en palabras clave en el nombre

-- Celulares
UPDATE items
SET category = 'Celular'
WHERE (
  LOWER(name) LIKE '%iphone%' OR
  LOWER(name) LIKE '%samsung%' OR
  LOWER(name) LIKE '%galaxy%' OR
  LOWER(name) LIKE '%xiaomi%' OR
  LOWER(name) LIKE '%huawei%' OR
  LOWER(name) LIKE '%motorola%' OR
  LOWER(name) LIKE '%nokia%' OR
  LOWER(name) LIKE '%oppo%' OR
  LOWER(name) LIKE '%vivo%' OR
  LOWER(name) LIKE '%realme%' OR
  LOWER(name) LIKE '%oneplus%' OR
  LOWER(name) LIKE '%phone%' OR
  LOWER(name) LIKE '%celular%' OR
  LOWER(name) LIKE '%smartphone%'
)
AND (category IS NULL OR category = 'Sin categoría');

-- Laptops
UPDATE items
SET category = 'Laptop'
WHERE (
  LOWER(name) LIKE '%laptop%' OR
  LOWER(name) LIKE '%macbook%' OR
  LOWER(name) LIKE '%notebook%' OR
  LOWER(name) LIKE '%thinkpad%' OR
  LOWER(name) LIKE '%pavilion%' OR
  LOWER(name) LIKE '%inspiron%' OR
  LOWER(name) LIKE '%zenbook%' OR
  LOWER(name) LIKE '%vivobook%'
)
AND (category IS NULL OR category = 'Sin categoría');

-- Tablets
UPDATE items
SET category = 'Tablet'
WHERE (
  LOWER(name) LIKE '%ipad%' OR
  LOWER(name) LIKE '%tablet%' OR
  LOWER(name) LIKE '%tab %' OR
  LOWER(name) LIKE '%galaxy tab%'
)
AND (category IS NULL OR category = 'Sin categoría');

-- Monitores
UPDATE items
SET category = 'Monitor'
WHERE (
  LOWER(name) LIKE '%monitor%' OR
  LOWER(name) LIKE '%display%' OR
  LOWER(name) LIKE '%pantalla%'
)
AND (category IS NULL OR category = 'Sin categoría');

-- TVs
UPDATE items
SET category = 'TV'
WHERE (
  LOWER(name) LIKE '%tv%' OR
  LOWER(name) LIKE '%television%' OR
  LOWER(name) LIKE '%smart tv%' OR
  LOWER(name) LIKE '%led tv%' OR
  LOWER(name) LIKE '%oled%' OR
  LOWER(name) LIKE '%qled%'
)
AND (category IS NULL OR category = 'Sin categoría');

-- Accesorios
UPDATE items
SET category = 'Accesorio'
WHERE (
  LOWER(name) LIKE '%cable%' OR
  LOWER(name) LIKE '%cargador%' OR
  LOWER(name) LIKE '%funda%' OR
  LOWER(name) LIKE '%case%' OR
  LOWER(name) LIKE '%protector%' OR
  LOWER(name) LIKE '%auricular%' OR
  LOWER(name) LIKE '%audifono%' OR
  LOWER(name) LIKE '%mouse%' OR
  LOWER(name) LIKE '%teclado%' OR
  LOWER(name) LIKE '%keyboard%' OR
  LOWER(name) LIKE '%adaptador%' OR
  LOWER(name) LIKE '%hub%' OR
  LOWER(name) LIKE '%soporte%'
)
AND (category IS NULL OR category = 'Sin categoría');

-- Verificar resultados
SELECT category, COUNT(*) as total
FROM public.items
GROUP BY category
ORDER BY total DESC;
