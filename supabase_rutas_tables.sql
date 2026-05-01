-- =====================================================
-- TABLAS PARA MÓDULO DE RUTAS
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. ENUMS (Tipos de datos)
DO $$ BEGIN
    CREATE TYPE delivery_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('pending', 'batched', 'routed', 'in_progress', 'completed', 'failed', 'rescheduled', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE route_status AS ENUM ('draft', 'optimizing', 'optimized', 'assigned', 'in_progress', 'completed', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. VEHÍCULOS
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number VARCHAR(20) UNIQUE NOT NULL,
    driver_name VARCHAR(255),
    driver_phone VARCHAR(20),
    capacity_weight DECIMAL(10,2),
    capacity_volume DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'active',
    current_lat DECIMAL(10,8),
    current_lng DECIMAL(10,8),
    last_location_update TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ENTREGAS / JOBS
CREATE TABLE IF NOT EXISTS delivery_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id VARCHAR(100),
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'normal',
    address_text TEXT NOT NULL,
    lat DECIMAL(10,8),
    lng DECIMAL(10,8),
    zone_id VARCHAR(50),
    time_window_start TIMESTAMPTZ,
    time_window_end TIMESTAMPTZ,
    service_time_seconds INT DEFAULT 600,
    weight DECIMAL(10,2),
    volume DECIMAL(10,2),
    assigned_route_id UUID,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RUTAS
CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'draft',
    driver_id UUID,
    vehicle_id UUID REFERENCES vehicles(id),
    start_time_planned TIMESTAMPTZ,
    end_time_planned TIMESTAMPTZ,
    start_time_actual TIMESTAMPTZ,
    end_time_actual TIMESTAMPTZ,
    total_distance_meters INT,
    total_duration_seconds INT,
    polyline TEXT,
    optimized_by VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PARADAS DE RUTA
CREATE TABLE IF NOT EXISTS route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    job_id UUID REFERENCES delivery_jobs(id) ON DELETE SET NULL,
    stop_type VARCHAR(20) DEFAULT 'delivery',
    sequence_order INT NOT NULL,
    eta_planned TIMESTAMPTZ,
    eta_realtime TIMESTAMPTZ,
    arrival_time TIMESTAMPTZ,
    departure_time TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. EVENTOS GPS
CREATE TABLE IF NOT EXISTS gps_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id),
    vehicle_id UUID REFERENCES vehicles(id),
    driver_id UUID,
    lat DECIMAL(10,8) NOT NULL,
    lng DECIMAL(10,8) NOT NULL,
    speed_kmh DECIMAL(5,2),
    heading DECIMAL(5,2),
    accuracy DECIMAL(5,2),
    battery_level INT,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ALERTAS
CREATE TABLE IF NOT EXISTS route_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    job_id UUID REFERENCES delivery_jobs(id) ON DELETE CASCADE,
    rule_triggered VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    status VARCHAR(20) DEFAULT 'open',
    message TEXT NOT NULL,
    assigned_to UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_status ON delivery_jobs(status);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_route ON delivery_jobs(assigned_route_id);
CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);
CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_gps_events_route ON gps_events(route_id);
CREATE INDEX IF NOT EXISTS idx_gps_events_recorded ON gps_events(recorded_at);

-- RLS
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_alerts ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Allow all for authenticated" ON vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON delivery_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON routes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON route_stops FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON gps_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON route_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Datos de ejemplo
INSERT INTO vehicles (plate_number, driver_name, driver_phone, status) VALUES
('M123-456', 'Juan Pérez', '8888-1234', 'active'),
('M789-012', 'Carlos Ruiz', '8888-5678', 'active'),
('M345-678', 'Pedro Martínez', '8888-9012', 'active')
ON CONFLICT (plate_number) DO NOTHING;

-- Entregas de ejemplo
INSERT INTO delivery_jobs (customer_name, customer_phone, address_text, lat, lng, zone_id, status) VALUES
('Ferretería El Constructor', '2222-1111', 'Km 4 Carretera Norte, Managua', 12.1364, -86.2514, 'managua-norte', 'pending'),
('Distribuidora Central', '2222-2222', 'Altamira, Managua', 12.1328, -86.2689, 'managua-centro', 'pending'),
('Materiales San José', '2222-3333', 'Carretera a Masaya Km 8', 12.0892, -86.2156, 'masaya', 'pending'),
('Comercial Los Robles', '2222-4444', 'Los Robles, Managua', 12.1256, -86.2734, 'managua-centro', 'pending'),
('Ferretería La Económica', '2222-5555', 'Mercado Oriental, Managua', 12.1412, -86.2589, 'managua-este', 'pending')
ON CONFLICT DO NOTHING;
