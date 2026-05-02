require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const connectionString = 'postgresql://postgres.pknkpvysiarfxvrhjqcx:9J8pjZWdCUO6uQxo@aws-1-us-east-2.pooler.supabase.com:6543/postgres';

async function reloadSchema() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✅ Conectado a Supabase');
    
    // Recargar schema cache
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('✅ Schema cache recargado');
    
    // Verificar columnas
    const { rows } = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'routes' 
      AND column_name IN ('driver_name', 'driver_phone', 'vehicle_label', 'tracking_token')
      ORDER BY column_name
    `);
    
    console.log('\nColumnas en routes:');
    rows.forEach(r => console.log(`  ✅ ${r.column_name}`));
    
    console.log('\n🎉 Schema actualizado correctamente');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

reloadSchema();
