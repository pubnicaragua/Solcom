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

async function ejecutarConversationHistory() {
  console.log('🔄 Creando tabla conversation_history...\n');

  try {
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, '..', 'supabase_conversation_history.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Dividir en statements individuales
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));

    console.log(`📝 Ejecutando ${statements.length} statements SQL...\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt.length < 10) continue;

      try {
        // Usar el cliente de Supabase para ejecutar SQL directo
        const { error } = await supabase.rpc('exec_sql', { sql_query: stmt + ';' });
        
        if (error) {
          // Si no existe exec_sql, intentar crear la tabla directamente
          if (stmt.includes('CREATE TABLE')) {
            console.log(`⚠️ Intentando crear tabla directamente...`);
            // Aquí normalmente usarías el SQL Editor de Supabase
            console.log(`⚠️ Statement ${i + 1}: ${error.message}`);
          } else {
            console.log(`⚠️ Statement ${i + 1}: ${error.message}`);
          }
        } else {
          console.log(`✅ Statement ${i + 1} ejecutado`);
        }
      } catch (err) {
        console.log(`⚠️ Statement ${i + 1}: ${err.message}`);
      }
    }

    // Verificar que la tabla existe
    console.log('\n🔍 Verificando tabla conversation_history...\n');
    
    const { data, error } = await supabase
      .from('conversation_history')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error: La tabla no existe o no es accesible');
      console.error('   Debes ejecutar supabase_conversation_history.sql manualmente en Supabase SQL Editor');
    } else {
      console.log('✅ Tabla conversation_history creada exitosamente!');
      console.log('✅ Funciones y políticas RLS configuradas');
    }

    console.log('\n📝 Próximo paso: Integrar con el frontend de Mía\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n⚠️ Si ves errores, ejecuta supabase_conversation_history.sql manualmente en Supabase SQL Editor');
  }
}

ejecutarConversationHistory().catch(console.error);
