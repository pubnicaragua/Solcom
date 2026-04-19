CREATE OR REPLACE FUNCTION public.get_restock_analytics(p_weeks integer DEFAULT 4)
RETURNS TABLE (
  item_id uuid,
  sku text,
  name text,
  price numeric,
  stock_total integer,
  sales_sum bigint,
  weekly_avg numeric,
  restock_sugerido numeric,
  presupuesto numeric
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
    i.stock_total,
    COALESCE(SUM(ABS(e.qty_delta)), 0) AS sales_sum,
    ROUND(COALESCE(SUM(ABS(e.qty_delta)), 0)::numeric / p_weeks, 2) AS weekly_avg,
    ROUND(COALESCE(SUM(ABS(e.qty_delta)), 0)::numeric / p_weeks, 2) AS restock_sugerido,
    ROUND(COALESCE(SUM(ABS(e.qty_delta)), 0)::numeric / p_weeks * COALESCE(i.price, 0), 2) AS presupuesto
  FROM public.items i
  LEFT JOIN public.inventory_events e 
    ON e.item_id = i.id 
   AND e.event_type = 'sale'
   AND e.external_ts >= (now() - (p_weeks || ' weeks')::interval)
  GROUP BY i.id, i.sku, i.name, i.price, i.stock_total
  HAVING COALESCE(SUM(ABS(e.qty_delta)), 0) > 0;
END;
$$;
