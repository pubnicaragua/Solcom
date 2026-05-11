require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionStrings = [
  process.env.SUPABASE_DB_URL,
  'postgresql://postgres.pknkpvysiarfxvrhjqcx:9J8pjZWdCUO6uQxo@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
  'postgresql://postgres:9J8pjZWdCUO6uQxo@db.pknkpvysiarfxvrhjqcx.supabase.co:5432/postgres'
].filter(Boolean);

async function connectClient() {
  let lastError = null;

  for (const connectionString of connectionStrings) {
    const client = new Client({ connectionString });
    try {
      console.log(`🔄 Probando conexión: ${connectionString.includes('db.pknkpvysiarfxvrhjqcx.supabase.co') ? 'directa' : 'pooler/env'}...`);
      await client.connect();
      console.log('✅ Conectado exitosamente!\n');
      return client;
    } catch (error) {
      lastError = error;
      console.error(`⚠️  Falló conexión: ${error.message}`);
      try {
        await client.end();
      } catch {}
    }
  }

  throw lastError || new Error('No se pudo conectar a PostgreSQL');
}

async function ejecutarSQL() {
  let client;

  try {
    console.log('🔄 Conectando a Supabase PostgreSQL...\n');
    client = await connectClient();

    // 1. Ejecutar fix_routes_table.sql
    console.log('📝 Ejecutando fix_routes_table.sql...');
    const routesSQL = fs.readFileSync(path.join(__dirname, '..', 'fix_routes_table.sql'), 'utf8');
    await client.query(routesSQL);
    
    console.log('✅ fix_routes_table.sql ejecutado\n');

    // 2. Ejecutar supabase_conversation_history.sql
    // 2. Ejecutar create-credit-system.sql
    console.log('📝 Ejecutando create-credit-system.sql...');
    const creditSQL = fs.readFileSync(path.join(__dirname, 'create-credit-system.sql'), 'utf8');
    await client.query(creditSQL);
    console.log('✅ create-credit-system.sql ejecutado\n');

    // 3. Ejecutar supabase_conversation_history.sql
    console.log('📝 Ejecutando supabase_conversation_history.sql...');
    const conversationSQL = fs.readFileSync(path.join(__dirname, '..', 'supabase_conversation_history.sql'), 'utf8');
    
    // Dividir en bloques (CREATE TABLE, CREATE INDEX, CREATE FUNCTION, etc.)
    const conversationStatements = conversationSQL
      .split(/(?=CREATE TABLE|CREATE INDEX|CREATE OR REPLACE FUNCTION|ALTER TABLE|DO \$\$)/g)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const stmt of conversationStatements) {
      try {
        await client.query(stmt);
        const preview = stmt.substring(0, 60).replace(/\n/g, ' ');
        console.log(`  ✅ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          const preview = stmt.substring(0, 60).replace(/\n/g, ' ');
          console.log(`  ⚠️  Ya existe: ${preview}...`);
        } else {
          console.error(`  ❌ Error: ${error.message}`);
          console.error(`  Sentencia: ${stmt.substring(0, 100)}...`);
        }
      }
    }
    
    console.log('✅ supabase_conversation_history.sql ejecutado\n');

    // 3. Recargar schema cache
    console.log('📝 Recargando schema cache...');
    await client.query(`NOTIFY pgrst, 'reload schema'`);
    console.log('✅ Schema cache recargado\n');

    // 4. Verificar
    console.log('🔍 Verificando cambios...\n');
    
    const { rows: routesCols } = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'routes' 
      AND column_name IN ('driver_name', 'driver_phone', 'vehicle_label', 'tracking_token')
      ORDER BY column_name
    `);
    
    console.log('Columnas agregadas a routes:');
    routesCols.forEach(row => console.log(`  ✅ ${row.column_name}`));
    
    const { rows: convTable } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'conversation_history'
    `);
    
    if (convTable.length > 0) {
      console.log('\n✅ Tabla conversation_history creada');
      
      const { rows: convCols } = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'conversation_history'
        ORDER BY ordinal_position
      `);
      
      console.log('\nColumnas en conversation_history:');
      convCols.forEach(row => console.log(`  - ${row.column_name}`));
    } else {
      console.log('\n⚠️  Tabla conversation_history no se creó');
    }
    
    console.log('\n🎉 ¡SQL ejecutado exitosamente!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('Conexión cerrada.');
    }
  }
}

ejecutarSQL();
