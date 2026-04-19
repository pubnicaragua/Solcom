CREATE OR REPLACE FUNCTION public.get_top_sales_today()
RETURNS TABLE (
  item_id uuid,
  sku text,
  name text,
  price numeric,
  sales_sum bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.sku,
    i.name,
    COALESCE(i.price, 0) AS price,
    COALESCE(SUM(ABS(e.qty_delta)), 0) AS sales_sum
  FROM public.items i
  INNER JOIN public.inventory_events e 
    ON e.item_id = i.id 
   AND e.event_type = 'sale'
   AND e.external_ts >= current_date
  GROUP BY i.id, i.sku, i.name, i.price
  HAVING COALESCE(SUM(ABS(e.qty_delta)), 0) > 0
  ORDER BY sales_sum DESC
  LIMIT 5;
END;
$$;
