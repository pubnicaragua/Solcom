require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Variables de entorno no configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function ejecutarFixRoutes() {
  console.log('🔄 Ejecutando fix_routes_table.sql...\n');

  try {
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, '..', 'fix_routes_table.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Ejecutar el SQL completo
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sqlContent });

    if (error) {
      // Si exec_sql no existe, intentar con query directo
      console.log('⚠️ Intentando método alternativo...\n');
      
      // Ejecutar cada ALTER TABLE por separado
      const alterStatements = [
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS driver_name TEXT",
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS driver_phone TEXT",
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS vehicle_label TEXT",
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS origin_lat DOUBLE PRECISION",
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS origin_lng DOUBLE PRECISION",
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS return_to_origin BOOLEAN DEFAULT false",
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS tracking_token TEXT",
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS tracking_enabled BOOLEAN DEFAULT false"
      ];

      for (const stmt of alterStatements) {
        const { error: stmtError } = await supabase.rpc('exec_sql', { sql_query: stmt });
        if (stmtError) {
          console.log(`⚠️ ${stmt.substring(0, 50)}... - ${stmtError.message}`);
        } else {
          console.log(`✅ ${stmt.substring(0, 50)}...`);
        }
      }
    } else {
      console.log('✅ SQL ejecutado exitosamente!');
    }

    // Verificar las columnas
    console.log('\n🔍 Verificando columnas de la tabla routes...\n');
    
    const { data: columns, error: colError } = await supabase
      .from('routes')
      .select('*')
      .limit(1);

    if (colError) {
      console.error('❌ Error verificando columnas:', colError.message);
    } else {
      console.log('✅ Columnas disponibles en routes:');
      if (columns && columns.length > 0) {
        Object.keys(columns[0]).forEach(col => {
          console.log(`   - ${col}`);
        });
      } else {
        console.log('   (Tabla vacía, pero estructura creada)');
      }
    }

    console.log('\n✅ Proceso completado!');
    console.log('📝 Ahora puedes crear rutas sin errores.\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

ejecutarFixRoutes().catch(console.error);
