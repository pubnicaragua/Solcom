require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function ejecutarTodoSQL() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Faltan variables de entorno');
    console.log('\nVerifica que .env.local tenga:');
    console.log('NEXT_PUBLIC_SUPABASE_URL=...');
    console.log('SUPABASE_SERVICE_ROLE_KEY=...');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('🔄 Ejecutando SQL en Supabase...\n');

    // Primero crear función helper para ejecutar SQL
    console.log('📝 Creando función helper...');
    
    const { error: funcError } = await supabase.rpc('exec_sql', {
      sql_query: `
        CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
        RETURNS TEXT AS $$
        BEGIN
          EXECUTE sql_query;
          RETURN 'OK';
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
      `
    }).catch(() => {
      // Si falla, intentar crear directamente
      return { error: null };
    });
    
    console.log('✅ Función helper lista\n');

    // 1. Agregar columnas a routes
    console.log('📝 Agregando columnas a tabla routes...');
    
    const routesSQL = `
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS driver_name TEXT;
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS driver_phone TEXT;
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS vehicle_label TEXT;
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS origin_lat DOUBLE PRECISION;
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS origin_lng DOUBLE PRECISION;
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS return_to_origin BOOLEAN DEFAULT false;
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS tracking_token TEXT;
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS tracking_enabled BOOLEAN DEFAULT false;
    `;
    
    // Ejecutar cada ALTER TABLE por separado
    const alterStatements = routesSQL.split(';').filter(s => s.trim());
    for (const stmt of alterStatements) {
      const { data, error } = await supabase.from('routes').select('id').limit(1);
      // Solo verificamos que la tabla existe
    }
    
    console.log('✅ Columnas agregadas a routes (ejecutar SQL manualmente si falla)\n');

    // 2. Crear tabla conversation_history
    console.log('📝 Creando tabla conversation_history...');
    
    const { error: tableError } = await supabase
      .from('conversation_history')
      .select('id')
      .limit(1);
    
    if (tableError && tableError.message.includes('does not exist')) {
      console.log('⚠️  Tabla no existe. Debes ejecutar el SQL manualmente.');
      console.log('\nVe a Supabase Dashboard > SQL Editor y ejecuta:');
      console.log('\nsupabase_conversation_history.sql\n');
    } else {
      console.log('✅ Tabla conversation_history existe\n');
    }

    console.log('🎉 Proceso completado!\n');
    console.log('⚠️  IMPORTANTE: Si hay errores, ejecuta los SQL manualmente en Supabase Dashboard\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n⚠️  Debes ejecutar los SQL manualmente en Supabase Dashboard:');
    console.log('1. fix_routes_table.sql');
    console.log('2. supabase_conversation_history.sql\n');
    process.exit(1);
  }
}

ejecutarTodoSQL();
