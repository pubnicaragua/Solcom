-- Contar total de items
SELECT count(*) as total_items FROM items;

-- Buscar duplicados por SKU
SELECT sku, count(*) 
FROM items 
GROUP BY sku 
HAVING count(*) > 1;

-- Buscar duplicados por zoho_item_id
SELECT zoho_item_id, count(*) 
FROM items 
WHERE zoho_item_id IS NOT NULL 
GROUP BY zoho_item_id 
HAVING count(*) > 1;

-- Ver items inactivos o con status extraño si existiera esa columna (no existe status en items, pero sí en warehouses, chequeamos items sin zoho_id)
SELECT id, sku, name, zoho_item_id 
FROM items 
WHERE zoho_item_id IS NULL;
