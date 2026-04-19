import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("No se encontraron claves de Supabase en .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runTest() {
  console.log("Iniciando inyección de pruebas en vivo...");

  try {
    // 1. Obtener 1 producto activo y 1 warehouse
    const { data: items } = await supabase.from('items').select('id, name, stock_total').limit(1);
    const { data: warehouses } = await supabase.from('warehouses').select('id').limit(1);

    if (!items || items.length === 0) {
      console.log("No hay productos en tu base de datos para probar.");
      return;
    }

    const testItem = items[0];
    const testWhId = warehouses?.[0]?.id || null;

    console.log(`Usando producto prueba: ${testItem.name} (Stock: ${testItem.stock_total || 0})`);

    // 2. Simular ventas reales espaciadas temporalmente
    // Venta de 20 unidades hace 2 semanas
    const date1 = new Date();
    date1.setDate(date1.getDate() - 14); 

    // Venta de 40 unidades la semana pasada
    const date2 = new Date();
    date2.setDate(date2.getDate() - 7);

    // Venta de 60 unidades el día de hoy
    const date3 = new Date();

    const mockEvents = [
      {
        idempotency_key: `test-sale-${Date.now()}-1`,
        source: 'test_script',
        event_type: 'sale',
        item_id: testItem.id,
        warehouse_id: testWhId,
        qty_delta: -20, // Salieron 20 unidades
        external_ts: date1.toISOString(),
      },
      {
        idempotency_key: `test-sale-${Date.now()}-2`,
        source: 'test_script',
        event_type: 'sale',
        item_id: testItem.id,
        warehouse_id: testWhId,
        qty_delta: -40, // Salieron 40 unidades
        external_ts: date2.toISOString(),
      },
      {
        idempotency_key: `test-sale-${Date.now()}-3`,
        source: 'test_script',
        event_type: 'sale',
        item_id: testItem.id,
        warehouse_id: testWhId,
        qty_delta: -60, // Salieron 60 unidades
        external_ts: date3.toISOString(),
      }
    ];

    console.log("Insertando ventas (Total=120 unidades salidas)...");
    
    // Total unidades = 120 vendidas. 
    // Magia de 4 semanas = 120 / 4 = 30 unidades sugeridas de restock semanal.

    const { error } = await supabase.from('inventory_events').insert(mockEvents);

    if (error) {
      console.error(error);
    } else {
      console.log(`¡Éxito!
---------------------------------------
Ventas inyectadas: 120 unidades
Matemática Esperada: 120 / 4 = 30 uds.

=> Ve a tu panel de Compras en la web y presiona "Generar Análisis". Deberías ver a ${testItem.name} requiriendo 30 unidades de reposición.
---------------------------------------`);
    }

  } catch (err) {
    console.error(err);
  }
}

runTest();
