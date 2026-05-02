-- =====================================================
-- QUERIES PARA VERIFICAR DATOS DE RUTAS
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. ¿Cuántos pedidos pendientes hay?
SELECT 
  COUNT(*) as total_pendientes,
  COUNT(CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 1 END) as con_coordenadas,
  COUNT(CASE WHEN lat IS NULL OR lng IS NULL THEN 1 END) as sin_coordenadas
FROM delivery_jobs 
WHERE status = 'pending';

-- 2. Ver pedidos pendientes con detalles
SELECT 
  sales_order_id,
  customer_name,
  customer_phone,
  address_text,
  zone_id,
  priority,
  CASE 
    WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 'Sí'
    ELSE 'No'
  END as tiene_coordenadas,
  created_at
FROM delivery_jobs 
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 20;

-- 3. Estadísticas por zona
SELECT 
  zone_id,
  COUNT(*) as total_pedidos,
  COUNT(CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 1 END) as con_coords,
  COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgentes,
  COUNT(CASE WHEN priority = 'high' THEN 1 END) as alta_prioridad
FROM delivery_jobs 
WHERE status = 'pending'
GROUP BY zone_id
ORDER BY total_pedidos DESC;

-- 4. ¿Hay rutas creadas?
SELECT 
  id,
  name,
  status,
  driver_name,
  driver_phone,
  tracking_token,
  tracking_enabled,
  created_at,
  (SELECT COUNT(*) FROM route_stops WHERE route_id = routes.id) as num_paradas
FROM routes
ORDER BY created_at DESC
LIMIT 10;

-- 5. Ver paradas de rutas recientes
SELECT 
  r.name as ruta,
  rs.client_name,
  rs.address,
  rs.optimized_sequence,
  rs.status,
  CASE 
    WHEN rs.lat IS NOT NULL AND rs.lng IS NOT NULL THEN 'Sí'
    ELSE 'No'
  END as tiene_coordenadas
FROM route_stops rs
JOIN routes r ON r.id = rs.route_id
WHERE r.created_at > NOW() - INTERVAL '7 days'
ORDER BY r.created_at DESC, rs.optimized_sequence ASC
LIMIT 30;

-- 6. ¿Hay ubicaciones GPS guardadas?
SELECT 
  r.name as ruta,
  r.driver_name,
  COUNT(rtl.id) as ubicaciones_guardadas,
  MAX(rtl.recorded_at) as ultima_ubicacion,
  AVG(rtl.accuracy) as precision_promedio
FROM routes r
LEFT JOIN route_tracking_locations rtl ON rtl.route_id = r.id
WHERE r.tracking_enabled = true
GROUP BY r.id, r.name, r.driver_name
ORDER BY MAX(rtl.recorded_at) DESC;

-- =====================================================
-- INSERTAR PEDIDOS DE PRUEBA (si no hay datos)
-- =====================================================

-- Verificar primero si ya hay pedidos
DO $$
DECLARE
  pedidos_count INT;
BEGIN
  SELECT COUNT(*) INTO pedidos_count FROM delivery_jobs WHERE status = 'pending';
  
  IF pedidos_count = 0 THEN
    RAISE NOTICE 'No hay pedidos pendientes. Insertando datos de prueba...';
    
    INSERT INTO delivery_jobs (
      sales_order_id,
      customer_name,
      customer_phone,
      address_text,
      zone_id,
      priority,
      status,
      lat,
      lng,
      geocoded
    ) VALUES
    -- Zona Norte
    ('ORD-001', 'Ferretería El Constructor', '8888-1234', 'Rotonda Bello Horizonte 1c al lago', 'managua-norte', 'high', 'pending', 12.1456, -86.2734, true),
    ('ORD-002', 'Distribuidora López', '8888-2345', 'Carretera Norte Km 3.5', 'managua-norte', 'normal', 'pending', 12.1567, -86.2823, true),
    ('ORD-003', 'Comercial Gutiérrez', '8888-3456', 'Altamira D''Este 3c arriba', 'managua-norte', 'urgent', 'pending', 12.1489, -86.2656, true),
    
    -- Zona Centro
    ('ORD-004', 'Supermercado La Colonia', '8888-4567', 'Plaza Inter 200m al sur', 'managua-centro', 'normal', 'pending', 12.1234, -86.2567, true),
    ('ORD-005', 'Tienda La Económica', '8888-5678', 'Mercado Oriental entrada principal', 'managua-centro', 'high', 'pending', 12.1345, -86.2678, true),
    ('ORD-006', 'Farmacia San Judas', '8888-6789', 'Metrocentro 1c al este', 'managua-centro', 'normal', 'pending', 12.1278, -86.2589, true),
    
    -- Zona Sur
    ('ORD-007', 'Librería Hispamer', '8888-7890', 'Carretera Masaya Km 5', 'managua-sur', 'normal', 'pending', 12.0987, -86.2345, true),
    ('ORD-008', 'Restaurante El Zaguan', '8888-8901', 'Villa Fontana 2c abajo', 'managua-sur', 'high', 'pending', 12.1012, -86.2412, true),
    ('ORD-009', 'Clínica Santa Fe', '8888-9012', 'Carretera Sur Km 8', 'managua-sur', 'urgent', 'pending', 12.0856, -86.2298, true),
    
    -- Zona Este
    ('ORD-010', 'Panadería La Mejor', '8888-0123', 'Pista Portezuelo 500m al este', 'managua-este', 'normal', 'pending', 12.1423, -86.2234, true),
    ('ORD-011', 'Taller Automotriz Central', '8888-1235', 'Linda Vista 1c al norte', 'managua-este', 'high', 'pending', 12.1534, -86.2156, true),
    
    -- Zona Oeste
    ('ORD-012', 'Hotel Crowne Plaza', '8888-2346', 'Km 11 Carretera Masaya', 'managua-oeste', 'normal', 'pending', 12.1189, -86.2789, true),
    ('ORD-013', 'Gimnasio PowerFit', '8888-3457', 'Plaza España 200m al oeste', 'managua-oeste', 'normal', 'pending', 12.1267, -86.2834, true),
    
    -- Sin coordenadas (para probar validación)
    ('ORD-014', 'Bodega Sin Ubicación', '8888-4568', 'Dirección sin geocodificar', 'managua-centro', 'normal', 'pending', NULL, NULL, false),
    ('ORD-015', 'Cliente Nuevo', '8888-5679', 'Pendiente de confirmar dirección', 'managua-norte', 'high', 'pending', NULL, NULL, false);
    
    RAISE NOTICE 'Se insertaron 15 pedidos de prueba exitosamente.';
  ELSE
    RAISE NOTICE 'Ya existen % pedidos pendientes. No se insertaron datos de prueba.', pedidos_count;
  END IF;
END $$;

-- =====================================================
-- LIMPIAR DATOS DE PRUEBA (si es necesario)
-- =====================================================

-- CUIDADO: Esto eliminará TODOS los pedidos de prueba
-- Descomentar solo si estás seguro

-- DELETE FROM delivery_jobs 
-- WHERE sales_order_id LIKE 'ORD-%' 
-- AND customer_name IN (
--   'Ferretería El Constructor',
--   'Distribuidora López',
--   'Comercial Gutiérrez',
--   'Supermercado La Colonia',
--   'Tienda La Económica',
--   'Farmacia San Judas',
--   'Librería Hispamer',
--   'Restaurante El Zaguan',
--   'Clínica Santa Fe',
--   'Panadería La Mejor',
--   'Taller Automotriz Central',
--   'Hotel Crowne Plaza',
--   'Gimnasio PowerFit',
--   'Bodega Sin Ubicación',
--   'Cliente Nuevo'
-- );

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

-- Resumen completo
SELECT 
  'Pedidos Pendientes' as tipo,
  COUNT(*) as cantidad
FROM delivery_jobs 
WHERE status = 'pending'

UNION ALL

SELECT 
  'Pedidos con Coordenadas',
  COUNT(*)
FROM delivery_jobs 
WHERE status = 'pending' AND lat IS NOT NULL AND lng IS NOT NULL

UNION ALL

SELECT 
  'Rutas Creadas',
  COUNT(*)
FROM routes

UNION ALL

SELECT 
  'Rutas Activas',
  COUNT(*)
FROM routes
WHERE status IN ('assigned', 'in_progress')

UNION ALL

SELECT 
  'Ubicaciones GPS Guardadas',
  COUNT(*)
FROM route_tracking_locations;
