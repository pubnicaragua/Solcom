require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

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

async function recalculate() {
  let client;
  try {
    client = await connectClient();

    // Recalcular costos
    console.log('📝 Recalculando costos históricos...');
    await client.query(`
      UPDATE ai_usage_logs
      SET cost = (tokens / 1000000.0) * 1.20
      WHERE request_type = 'salesiq_chatbot'
    `);

    // Verificar resultado
    const result = await client.query(`
      SELECT 
        COUNT(*) as total_registros,
        SUM(tokens) as total_tokens,
        ROUND(SUM(cost)::numeric, 2) as costo_total
      FROM ai_usage_logs
      WHERE request_type = 'salesiq_chatbot'
    `);

    console.log('✅ Costos recalculados exitosamente!\n');
    console.log('📊 Resultado:');
    console.log(`   - Registros actualizados: ${result.rows[0].total_registros}`);
    console.log(`   - Total tokens: ${parseInt(result.rows[0].total_tokens).toLocaleString()}`);
    console.log(`   - Costo total: $${result.rows[0].costo_total}`);

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

recalculate();
