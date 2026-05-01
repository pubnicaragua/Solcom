const { Client } = require('pg');

const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  if (!connectionString) {
    throw new Error('Falta la variable de entorno SUPABASE_DB_URL');
  }
  const client = new Client({ connectionString });

  try {
    console.log('Conectando a Supabase...');
    await client.connect();
    console.log('✅ Conectado exitosamente!\n');

    // Obtener tablas existentes
    console.log('📋 Tablas existentes en public:');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    console.log(`\nTotal: ${tablesResult.rows.length} tablas\n`);

    // =====================================================
    // TABLAS PARA SOLCOM AI
    // =====================================================
    console.log('🤖 Creando tablas para Solcom AI...');

    // 1. Tabla de Claves de API
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        key VARCHAR(50) NOT NULL,
        full_key TEXT,
        status VARCHAR(20) DEFAULT 'active',
        tokens_used BIGINT DEFAULT 0,
        last_used TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ ai_api_keys');

    // 2. Tabla de Asistentes IA
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_assistants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        capabilities JSONB DEFAULT '{"text": true, "inventory": false, "sales": false}',
        system_prompt TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ ai_assistants');

    // 3. Tabla de Logs de Uso
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key_id UUID,
        assistant_id UUID,
        tokens INT NOT NULL DEFAULT 0,
        cost DECIMAL(10,6) DEFAULT 0,
        request_type VARCHAR(50),
        user_message TEXT,
        assistant_response TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ ai_usage_logs');

    // Índices para Solcom AI
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_api_key ON ai_usage_logs(api_key_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_api_keys_status ON ai_api_keys(status)`);
    console.log('  ✅ Índices creados');

    // RLS para Solcom AI
    await client.query(`ALTER TABLE ai_api_keys ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE ai_assistants ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY`);

    // Políticas
    await client.query(`
      DO $$ BEGIN
        CREATE POLICY "Allow all for authenticated users" ON ai_api_keys
          FOR ALL TO authenticated USING (true) WITH CHECK (true);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE POLICY "Allow all for anon users" ON ai_api_keys
          FOR ALL TO anon USING (true) WITH CHECK (true);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE POLICY "Allow all for authenticated users" ON ai_assistants
          FOR ALL TO authenticated USING (true) WITH CHECK (true);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE POLICY "Allow all for anon users" ON ai_assistants
          FOR ALL TO anon USING (true) WITH CHECK (true);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE POLICY "Allow all for authenticated users" ON ai_usage_logs
          FOR ALL TO authenticated USING (true) WITH CHECK (true);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE POLICY "Allow all for anon users" ON ai_usage_logs
          FOR ALL TO anon USING (true) WITH CHECK (true);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    console.log('  ✅ RLS y políticas configuradas');

    // Insertar asistente de ejemplo
    await client.query(`
      INSERT INTO ai_assistants (name, description, capabilities) 
      VALUES ('Mía - Asistente de Compras', 'Analiza inventario y recomienda qué productos comprar', '{"text": true, "inventory": true, "sales": true}')
      ON CONFLICT DO NOTHING
    `);
    console.log('  ✅ Asistente de ejemplo creado\n');

    // =====================================================
    // TABLAS PARA MÓDULO DE RUTAS
    // =====================================================
    console.log('🚛 Creando tablas para Módulo de Rutas...');

    // 1. VEHÍCULOS
    await client.query(`
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
      )
    `);
    console.log('  ✅ vehicles');

    // 2. ENTREGAS / JOBS
    await client.query(`
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
      )
    `);
    console.log('  ✅ delivery_jobs');

    // 3. RUTAS
    await client.query(`
      CREATE TABLE IF NOT EXISTS routes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'draft',
        driver_id UUID,
        vehicle_id UUID,
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
      )
    `);
    console.log('  ✅ routes');

    // 4. PARADAS DE RUTA
    await client.query(`
      CREATE TABLE IF NOT EXISTS route_stops (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        route_id UUID,
        job_id UUID,
        stop_type VARCHAR(20) DEFAULT 'delivery',
        sequence_order INT NOT NULL,
        eta_planned TIMESTAMPTZ,
        eta_realtime TIMESTAMPTZ,
        arrival_time TIMESTAMPTZ,
        departure_time TIMESTAMPTZ,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ route_stops');

    // 5. EVENTOS GPS
    await client.query(`
      CREATE TABLE IF NOT EXISTS gps_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        route_id UUID,
        vehicle_id UUID,
        driver_id UUID,
        lat DECIMAL(10,8) NOT NULL,
        lng DECIMAL(10,8) NOT NULL,
        speed_kmh DECIMAL(5,2),
        heading DECIMAL(5,2),
        accuracy DECIMAL(5,2),
        battery_level INT,
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ gps_events');

    // 6. ALERTAS
    await client.query(`
      CREATE TABLE IF NOT EXISTS route_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        route_id UUID,
        job_id UUID,
        rule_triggered VARCHAR(100) NOT NULL,
        severity VARCHAR(20) DEFAULT 'info',
        status VARCHAR(20) DEFAULT 'open',
        message TEXT NOT NULL,
        assigned_to UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      )
    `);
    console.log('  ✅ route_alerts');

    // Índices para Rutas
    await client.query(`CREATE INDEX IF NOT EXISTS idx_delivery_jobs_status ON delivery_jobs(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_delivery_jobs_route ON delivery_jobs(assigned_route_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gps_events_route ON gps_events(route_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gps_events_recorded ON gps_events(recorded_at)`);
    console.log('  ✅ Índices creados');

    await client.query(`ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS customer_id UUID`);
    console.log('  ✅ Columna customer_id verificada');

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_vehicle_id_fkey') THEN
          ALTER TABLE public.routes
          ADD CONSTRAINT routes_vehicle_id_fkey
          FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_jobs_assigned_route_id_fkey') THEN
          ALTER TABLE public.delivery_jobs
          ADD CONSTRAINT delivery_jobs_assigned_route_id_fkey
          FOREIGN KEY (assigned_route_id) REFERENCES public.routes(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_stops_route_id_fkey') THEN
          ALTER TABLE public.route_stops
          ADD CONSTRAINT route_stops_route_id_fkey
          FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_stops_job_id_fkey') THEN
          ALTER TABLE public.route_stops
          ADD CONSTRAINT route_stops_job_id_fkey
          FOREIGN KEY (job_id) REFERENCES public.delivery_jobs(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gps_events_route_id_fkey') THEN
          ALTER TABLE public.gps_events
          ADD CONSTRAINT gps_events_route_id_fkey
          FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gps_events_vehicle_id_fkey') THEN
          ALTER TABLE public.gps_events
          ADD CONSTRAINT gps_events_vehicle_id_fkey
          FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_alerts_route_id_fkey') THEN
          ALTER TABLE public.route_alerts
          ADD CONSTRAINT route_alerts_route_id_fkey
          FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_alerts_job_id_fkey') THEN
          ALTER TABLE public.route_alerts
          ADD CONSTRAINT route_alerts_job_id_fkey
          FOREIGN KEY (job_id) REFERENCES public.delivery_jobs(id) ON DELETE CASCADE;
        END IF;
      END $$
    `);
    console.log('  ✅ Relaciones y claves foráneas verificadas');

    // RLS para Rutas
    await client.query(`ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE delivery_jobs ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE routes ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE gps_events ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE route_alerts ENABLE ROW LEVEL SECURITY`);

    // Políticas para Rutas
    const routeTables = ['vehicles', 'delivery_jobs', 'routes', 'route_stops', 'gps_events', 'route_alerts'];
    for (const table of routeTables) {
      await client.query(`
        DO $$ BEGIN
          CREATE POLICY "Allow all for authenticated" ON ${table}
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await client.query(`
        DO $$ BEGIN
          CREATE POLICY "Allow all for anon" ON ${table}
            FOR ALL TO anon USING (true) WITH CHECK (true);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
    }
    console.log('  ✅ RLS y políticas configuradas');

    await client.query(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role`);
    for (const table of ['ai_api_keys', 'ai_assistants', 'ai_usage_logs', ...routeTables]) {
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO anon, authenticated, service_role`);
    }
    console.log('  ✅ Permisos de acceso verificados');

    // Datos de ejemplo - Vehículos
    await client.query(`
      INSERT INTO vehicles (plate_number, driver_name, driver_phone, status) VALUES
      ('M123-456', 'Juan Pérez', '8888-1234', 'active'),
      ('M789-012', 'Carlos Ruiz', '8888-5678', 'active'),
      ('M345-678', 'Pedro Martínez', '8888-9012', 'active')
      ON CONFLICT (plate_number) DO NOTHING
    `);
    console.log('  ✅ Vehículos de ejemplo creados');

    // Datos de ejemplo - Entregas
    await client.query(`
      INSERT INTO delivery_jobs (customer_name, customer_phone, address_text, lat, lng, zone_id, status) VALUES
      ('Ferretería El Constructor', '2222-1111', 'Km 4 Carretera Norte, Managua', 12.1364, -86.2514, 'managua-norte', 'pending'),
      ('Distribuidora Central', '2222-2222', 'Altamira, Managua', 12.1328, -86.2689, 'managua-centro', 'pending'),
      ('Materiales San José', '2222-3333', 'Carretera a Masaya Km 8', 12.0892, -86.2156, 'masaya', 'pending'),
      ('Comercial Los Robles', '2222-4444', 'Los Robles, Managua', 12.1256, -86.2734, 'managua-centro', 'pending'),
      ('Ferretería La Económica', '2222-5555', 'Mercado Oriental, Managua', 12.1412, -86.2589, 'managua-este', 'pending')
      ON CONFLICT DO NOTHING
    `);
    console.log('  ✅ Entregas de ejemplo creadas\n');

    // Verificar tablas creadas
    console.log('📋 Verificando tablas creadas:');
    const newTablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('ai_api_keys', 'ai_assistants', 'ai_usage_logs', 'vehicles', 'delivery_jobs', 'routes', 'route_stops', 'gps_events', 'route_alerts')
      ORDER BY table_name
    `);
    
    newTablesResult.rows.forEach(row => {
      console.log(`  ✅ ${row.table_name}`);
    });

    await client.query(`NOTIFY pgrst, 'reload schema'`);
    console.log('  ✅ Schema cache de PostgREST recargado');

    console.log('\n🎉 ¡Todas las tablas fueron creadas exitosamente!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('\nConexión cerrada.');
  }
}

main();
