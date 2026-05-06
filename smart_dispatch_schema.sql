
-- 1. ENUMS (Tipos de datos estrictos)
CREATE TYPE delivery_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE job_status AS ENUM ('pending', 'batched', 'routed', 'in_progress', 'completed', 'failed', 'rescheduled', 'canceled');
CREATE TYPE route_status AS ENUM ('draft', 'optimizing', 'optimized', 'assigned', 'in_progress', 'completed', 'canceled');
CREATE TYPE stop_type AS ENUM ('pickup', 'delivery', 'break', 'refuel');
CREATE TYPE evidence_type AS ENUM ('signature', 'photo', 'document', 'gps_only');
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'resolved');

-- 2. VEHÍCULOS (Flota Física)
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number VARCHAR(20) UNIQUE NOT NULL,
    capacity_weight DECIMAL(10,2), -- Capacidad en KG
    capacity_volume DECIMAL(10,2), -- Capacidad en M3
    status VARCHAR(50) DEFAULT 'active', -- active, maintenance, inactive
    metadata JSONB DEFAULT '{}', -- Extras: Marca, modelo, año
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- (Nota: Se asume que los Conductores se manejan con la tabla auth.users o perfiles existentes)

-- 3. ENTREGAS / JOBS (Unidad atómica de entrega, generada desde Sales Orders)
CREATE TABLE delivery_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id UUID NOT NULL, -- Ref a tu tabla actual de Sales Orders
    customer_id UUID NOT NULL,    -- Ref a tu tabla actual de Clientes
    status job_status DEFAULT 'pending',
    priority delivery_priority DEFAULT 'normal',
    
    -- Geoubicación del destino
    address_text TEXT NOT NULL,
    lat DECIMAL(10,8) NOT NULL,
    lng DECIMAL(10,8) NOT NULL,
    zone_id VARCHAR(50), -- Región logística (Ej: "Managua Norte")
    
    -- Restricciones de negocio y peso para el Optimizer API
    time_window_start TIMESTAMPTZ, -- Inicio de ventana de entrega aceptada
    time_window_end TIMESTAMPTZ,   -- Fin de ventana de entrega
    service_time_seconds INT DEFAULT 600, -- Tiempo promedio asumiendo 10mins para descargar
    weight DECIMAL(10,2),          -- Peso de este pedido
    volume DECIMAL(10,2),          -- Volumen
    
    assigned_route_id UUID,        -- FK a la ruta si ya se agrupó
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RUTAS (Planificación global de un vehículo para un periodo)
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status route_status DEFAULT 'draft',
    driver_id UUID,                -- Conductor asignado
    vehicle_id UUID REFERENCES vehicles(id),
    
    -- Control de Tiempos
    start_time_planned TIMESTAMPTZ,
    end_time_planned TIMESTAMPTZ,
    start_time_actual TIMESTAMPTZ,
    end_time_actual TIMESTAMPTZ,
    
    -- Kilometrajes e 히stóricos
    total_distance_meters_planned INT,
    total_distance_meters_actual INT,
    
    optimized_by VARCHAR(50) DEFAULT 'manual', -- 'google_routes_api', 'manual'
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. HISTORICO DE VERSIONES DE RUTA (Auditoría para reoptimizaciones en vivo)
CREATE TABLE route_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    route_snapshot JSONB NOT NULL, -- Matriz entera de orden de paradas guardada
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PARADAS DE RUTA (La secuencia exacta paso a paso)
CREATE TABLE route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    job_id UUID REFERENCES delivery_jobs(id) ON DELETE SET NULL, -- Null si la parada es para recargar gas (break)
    
    stop_type stop_type DEFAULT 'delivery',
    sequence_order INT NOT NULL,
    
    -- Tiempos de seguimiento en vivo
    eta_planned TIMESTAMPTZ,      -- Hora prometida al optimizar
    eta_realtime TIMESTAMPTZ,     -- Hora inferida recalculada en base al tráfico
    arrival_time TIMESTAMPTZ,     -- Momento puntual en el que marca CheckIn
    departure_time TIMESTAMPTZ,   -- Momento puntual en el que cierra la entrega y arranca
    
    status VARCHAR(50) DEFAULT 'pending', -- pending, arrived, completed, failed
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. EVENTOS GPS TRACKING (Telemetría pura para Supabase Realtime)
CREATE TABLE gps_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id),
    driver_id UUID,
    lat DECIMAL(10,8) NOT NULL,
    lng DECIMAL(10,8) NOT NULL,
    speed_kmh DECIMAL(5,2),
    battery_level INT,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. INTENTOS DE ENTREGA (Gestión de fallos y reprocesos)
CREATE TABLE delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES delivery_jobs(id) ON DELETE CASCADE,
    stop_id UUID REFERENCES route_stops(id),
    driver_id UUID,
    
    status VARCHAR(50) NOT NULL,   -- 'success', 'partial', 'failed'
    fail_reason VARCHAR(255),      -- Ej: "Cliente no estaba", "Dirección errónea"
    notes TEXT,
    
    attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. EVIDENCIAS FÍSICAS O DIGITALES (Verificación POD - Proof Of Delivery)
CREATE TABLE delivery_evidences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID REFERENCES delivery_attempts(id) ON DELETE CASCADE,
    evidence_type evidence_type NOT NULL,
    file_url TEXT NOT NULL,        -- Enlace a Supabase Storage
    lat DECIMAL(10,8),             -- Coordenada donde se tomó la foto (auditoría)
    lng DECIMAL(10,8),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. ALERTAS INTELIGENTES OPERATIVAS (Panel Lateral Dispatcher)
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    job_id UUID REFERENCES delivery_jobs(id) ON DELETE CASCADE,
    
    rule_triggered VARCHAR(100) NOT NULL, -- ej: 'eta_delay_critical', 'out_of_geofence'
    severity alert_severity DEFAULT 'info',
    status alert_status DEFAULT 'open',
    
    message TEXT NOT NULL,
    assigned_to UUID, -- Dispatcher que asume el problema
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 11. AUDIT TRAIL (Registro de qué cambió, quién y cuándo)
CREATE TABLE status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL, -- 'job', 'route'
    entity_id UUID NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by UUID, -- UUID del usuario que cambia, nulo si es cron automático
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. INSIGHTS HISTÓRICOS Y APRENDIZAJE (Retroalimenta futuras agrupaciones)
CREATE TABLE historical_zone_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id VARCHAR(50) NOT NULL,
    date_trunc DATE NOT NULL,
    avg_service_time_seconds INT,
    avg_delay_seconds INT,
    success_rate DECIMAL(5,2),
    total_deliveries INT,
    UNIQUE(zone_id, date_trunc)
);

CREATE TABLE historical_driver_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL,
    date_trunc DATE NOT NULL,
    efficiency_score DECIMAL(5,2), -- 0 a 100
    on_time_rate DECIMAL(5,2),
    incidents_count INT,
    UNIQUE(driver_id, date_trunc)
);

-- 13. ÍNDICES DE PERFORMANCE (Obligatorios para reportes rápidos y Realtime)
CREATE INDEX idx_jobs_status ON delivery_jobs(status);
CREATE INDEX idx_jobs_zone ON delivery_jobs(zone_id);
CREATE INDEX idx_routes_status ON routes(status);
CREATE INDEX idx_route_stops_route_id ON route_stops(route_id);
CREATE INDEX idx_gps_recorded_at ON gps_events(recorded_at);
CREATE INDEX idx_alerts_status ON alerts(status);
