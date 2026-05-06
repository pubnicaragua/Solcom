-- =====================================================
-- MIGRACIÓN PARA MVP DE RUTAS - TRACKING SIN LOGIN
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Agregar campos faltantes a routes para tracking sin login
ALTER TABLE routes 
ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS vehicle_label VARCHAR(100),
ADD COLUMN IF NOT EXISTS origin_lat DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS origin_lng DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS return_to_origin BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tracking_token VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS tracking_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS optimized_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tracking_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tracking_ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS estimated_distance INT,
ADD COLUMN IF NOT EXISTS estimated_duration INT,
ADD COLUMN IF NOT EXISTS actual_duration INT,
ADD COLUMN IF NOT EXISTS encoded_polyline TEXT;

-- Agregar campos a route_stops para orden optimizado
ALTER TABLE route_stops
ADD COLUMN IF NOT EXISTS original_sequence INT,
ADD COLUMN IF NOT EXISTS optimized_sequence INT,
ADD COLUMN IF NOT EXISTS client_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS lat DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS lng DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS estimated_arrival TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS actual_arrival TIMESTAMPTZ;

-- Crear tabla para tracking locations (reemplaza gps_events con estructura más simple)
CREATE TABLE IF NOT EXISTS route_tracking_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    tracking_token VARCHAR(100) NOT NULL,
    driver_name VARCHAR(255),
    lat DECIMAL(10,8) NOT NULL,
    lng DECIMAL(10,8) NOT NULL,
    accuracy DECIMAL(6,2),
    heading DECIMAL(5,2),
    speed DECIMAL(5,2),
    battery_level DECIMAL(3,2),
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para tracking
CREATE INDEX IF NOT EXISTS idx_tracking_locations_route ON route_tracking_locations(route_id);
CREATE INDEX IF NOT EXISTS idx_tracking_locations_token ON route_tracking_locations(tracking_token);
CREATE INDEX IF NOT EXISTS idx_tracking_locations_recorded ON route_tracking_locations(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_routes_tracking_token ON routes(tracking_token);

-- RLS para tracking público
ALTER TABLE route_tracking_locations ENABLE ROW LEVEL SECURITY;

-- Política: Permitir INSERT público con tracking_token válido
CREATE POLICY "Allow public insert with valid token" 
ON route_tracking_locations 
FOR INSERT 
TO anon
WITH CHECK (
    EXISTS (
        SELECT 1 FROM routes 
        WHERE routes.tracking_token = route_tracking_locations.tracking_token 
        AND routes.tracking_enabled = true
    )
);

-- Política: Permitir SELECT autenticado
CREATE POLICY "Allow authenticated select" 
ON route_tracking_locations 
FOR SELECT 
TO authenticated 
USING (true);

-- Política: Permitir SELECT público solo con token válido (para vista del motorizado)
CREATE POLICY "Allow public select with valid token" 
ON route_tracking_locations 
FOR SELECT 
TO anon
USING (
    EXISTS (
        SELECT 1 FROM routes 
        WHERE routes.tracking_token = route_tracking_locations.tracking_token 
        AND routes.tracking_enabled = true
    )
);

-- Función para generar tracking token único
CREATE OR REPLACE FUNCTION generate_tracking_token()
RETURNS TEXT AS $$
DECLARE
    token TEXT;
    exists BOOLEAN;
BEGIN
    LOOP
        -- Generar token aleatorio de 32 caracteres
        token := encode(gen_random_bytes(24), 'base64');
        token := replace(token, '/', '_');
        token := replace(token, '+', '-');
        token := replace(token, '=', '');
        
        -- Verificar si ya existe
        SELECT EXISTS(SELECT 1 FROM routes WHERE tracking_token = token) INTO exists;
        
        EXIT WHEN NOT exists;
    END LOOP;
    
    RETURN token;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener última ubicación de una ruta
CREATE OR REPLACE FUNCTION get_latest_location(p_route_id UUID)
RETURNS TABLE (
    lat DECIMAL(10,8),
    lng DECIMAL(10,8),
    recorded_at TIMESTAMPTZ,
    accuracy DECIMAL(6,2),
    heading DECIMAL(5,2),
    speed DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rtl.lat,
        rtl.lng,
        rtl.recorded_at,
        rtl.accuracy,
        rtl.heading,
        rtl.speed
    FROM route_tracking_locations rtl
    WHERE rtl.route_id = p_route_id
    ORDER BY rtl.recorded_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Actualizar delivery_jobs para agregar geocoding status
ALTER TABLE delivery_jobs
ADD COLUMN IF NOT EXISTS geocoded BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS geocoding_failed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS geocoding_error TEXT;

-- Índice para búsqueda de pedidos sin geocodificar
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_geocoded ON delivery_jobs(geocoded) WHERE geocoded = false;

COMMENT ON TABLE route_tracking_locations IS 'Ubicaciones GPS del motorizado durante el recorrido. Permite INSERT público con token válido.';
COMMENT ON COLUMN routes.tracking_token IS 'Token único para compartir con motorizado sin login';
COMMENT ON COLUMN routes.tracking_enabled IS 'Si está habilitado el tracking público para esta ruta';
COMMENT ON COLUMN routes.driver_name IS 'Nombre del motorizado (no requiere usuario en sistema)';
COMMENT ON COLUMN routes.driver_phone IS 'Teléfono del motorizado para enviar link de tracking';
COMMENT ON COLUMN routes.vehicle_label IS 'Etiqueta del vehículo (placa o identificador simple)';
