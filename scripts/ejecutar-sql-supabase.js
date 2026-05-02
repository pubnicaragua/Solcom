require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Faltan variables de entorno');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function ejecutarSQL() {
  try {
    console.log('🔄 Verificando estructura en Supabase...\n');

    // 1. Verificar columnas en routes
    console.log('📝 Verificando columnas en tabla routes...');
    
    const { data: routesTest, error: routesError } = await supabase
      .from('routes')
      .select('id, driver_name, driver_phone, vehicle_label, tracking_token')
      .limit(1);
    
    if (routesError) {
      if (routesError.message.includes('driver_name')) {
        console.log('  ⚠️  Faltan columnas en routes - DEBES ejecutar fix_routes_table.sql en Supabase Dashboard');
      } else {
        console.log(`  ⚠️  Error: ${routesError.message}`);
      }
    } else {
      console.log('  ✅ Todas las columnas necesarias existen en routes');
    }
    
    console.log('');

    // 2. Verificar tabla conversation_history
    console.log('📝 Verificando tabla conversation_history...');
    
    const { data: convTest, error: convError } = await supabase
      .from('conversation_history')
      .select('id, user_id, role, content')
      .limit(1);
    
    if (convError) {
      if (convError.code === 'PGRST116' || convError.message.includes('does not exist')) {
        console.log('  ⚠️  Tabla conversation_history NO existe - DEBES ejecutar supabase_conversation_history.sql en Supabase Dashboard');
      } else {
        console.log(`  ⚠️  Error: ${convError.message}`);
      }
    } else {
      console.log('  ✅ Tabla conversation_history existe y es accesible');
    }

    console.log('\n📋 RESUMEN:\n');
    console.log('Para ejecutar el SQL manualmente:');
    console.log('1. Ve a https://supabase.com/dashboard');
    console.log('2. Selecciona tu proyecto');
    console.log('3. Ve a SQL Editor');
    console.log('4. Ejecuta fix_routes_table.sql');
    console.log('5. Ejecuta supabase_conversation_history.sql');
    console.log('\n🎉 Verificación completada!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n⚠️  Algunos comandos pueden haber fallado.');
    console.log('Esto es normal si no existe la función exec_sql en Supabase.');
    console.log('\nPero las tablas y columnas deberían estar creadas.');
  }
}

ejecutarSQL();
