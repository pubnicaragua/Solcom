require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Variables de entorno no configuradas');
  console.error('Asegurate de tener NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function ejecutarSQL() {
  console.log('🔄 Verificando pedidos pendientes...\n');

  // 1. Verificar cuántos pedidos hay
  const { data: pedidos, error: errorPedidos } = await supabase
    .from('delivery_jobs')
    .select('*', { count: 'exact' })
    .eq('status', 'pending');

  if (errorPedidos) {
    console.error('❌ Error:', errorPedidos);
    return;
  }

  console.log(`📦 Pedidos pendientes actuales: ${pedidos?.length || 0}\n`);

  if (pedidos && pedidos.length > 0) {
    console.log('✅ Ya hay pedidos en el sistema. Mostrando primeros 5:\n');
    pedidos.slice(0, 5).forEach((p, i) => {
      console.log(`${i + 1}. ${p.customer_name} - ${p.address_text}`);
      console.log(`   Zona: ${p.zone_id} | Prioridad: ${p.priority}`);
      console.log(`   Coordenadas: ${p.lat ? 'Sí' : 'No'}\n`);
    });
    return;
  }

  console.log('📝 No hay pedidos. Insertando datos de prueba...\n');

  // 2. Insertar pedidos de prueba
  const pedidosPrueba = [
    {
      sales_order_id: 'ORD-001',
      customer_name: 'Ferretería El Constructor',
      customer_phone: '8888-1234',
      address_text: 'Rotonda Bello Horizonte 1c al lago',
      zone_id: 'managua-norte',
      priority: 'high',
      status: 'pending',
      lat: 12.1456,
      lng: -86.2734,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-002',
      customer_name: 'Distribuidora López',
      customer_phone: '8888-2345',
      address_text: 'Carretera Norte Km 3.5',
      zone_id: 'managua-norte',
      priority: 'normal',
      status: 'pending',
      lat: 12.1567,
      lng: -86.2823,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-003',
      customer_name: 'Comercial Gutiérrez',
      customer_phone: '8888-3456',
      address_text: 'Altamira D\'Este 3c arriba',
      zone_id: 'managua-norte',
      priority: 'urgent',
      status: 'pending',
      lat: 12.1489,
      lng: -86.2656,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-004',
      customer_name: 'Supermercado La Colonia',
      customer_phone: '8888-4567',
      address_text: 'Plaza Inter 200m al sur',
      zone_id: 'managua-centro',
      priority: 'normal',
      status: 'pending',
      lat: 12.1234,
      lng: -86.2567,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-005',
      customer_name: 'Tienda La Económica',
      customer_phone: '8888-5678',
      address_text: 'Mercado Oriental entrada principal',
      zone_id: 'managua-centro',
      priority: 'high',
      status: 'pending',
      lat: 12.1345,
      lng: -86.2678,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-006',
      customer_name: 'Farmacia San Judas',
      customer_phone: '8888-6789',
      address_text: 'Metrocentro 1c al este',
      zone_id: 'managua-centro',
      priority: 'normal',
      status: 'pending',
      lat: 12.1278,
      lng: -86.2589,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-007',
      customer_name: 'Librería Hispamer',
      customer_phone: '8888-7890',
      address_text: 'Carretera Masaya Km 5',
      zone_id: 'managua-sur',
      priority: 'normal',
      status: 'pending',
      lat: 12.0987,
      lng: -86.2345,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-008',
      customer_name: 'Restaurante El Zaguan',
      customer_phone: '8888-8901',
      address_text: 'Villa Fontana 2c abajo',
      zone_id: 'managua-sur',
      priority: 'high',
      status: 'pending',
      lat: 12.1012,
      lng: -86.2412,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-009',
      customer_name: 'Clínica Santa Fe',
      customer_phone: '8888-9012',
      address_text: 'Carretera Sur Km 8',
      zone_id: 'managua-sur',
      priority: 'urgent',
      status: 'pending',
      lat: 12.0856,
      lng: -86.2298,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-010',
      customer_name: 'Panadería La Mejor',
      customer_phone: '8888-0123',
      address_text: 'Pista Portezuelo 500m al este',
      zone_id: 'managua-este',
      priority: 'normal',
      status: 'pending',
      lat: 12.1423,
      lng: -86.2234,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-011',
      customer_name: 'Taller Automotriz Central',
      customer_phone: '8888-1235',
      address_text: 'Linda Vista 1c al norte',
      zone_id: 'managua-este',
      priority: 'high',
      status: 'pending',
      lat: 12.1534,
      lng: -86.2156,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-012',
      customer_name: 'Hotel Crowne Plaza',
      customer_phone: '8888-2346',
      address_text: 'Km 11 Carretera Masaya',
      zone_id: 'managua-oeste',
      priority: 'normal',
      status: 'pending',
      lat: 12.1189,
      lng: -86.2789,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-013',
      customer_name: 'Gimnasio PowerFit',
      customer_phone: '8888-3457',
      address_text: 'Plaza España 200m al oeste',
      zone_id: 'managua-oeste',
      priority: 'normal',
      status: 'pending',
      lat: 12.1267,
      lng: -86.2834,
      geocoded: true
    },
    {
      sales_order_id: 'ORD-014',
      customer_name: 'Bodega Sin Ubicación',
      customer_phone: '8888-4568',
      address_text: 'Dirección sin geocodificar',
      zone_id: 'managua-centro',
      priority: 'normal',
      status: 'pending',
      lat: null,
      lng: null,
      geocoded: false
    },
    {
      sales_order_id: 'ORD-015',
      customer_name: 'Cliente Nuevo',
      customer_phone: '8888-5679',
      address_text: 'Pendiente de confirmar dirección',
      zone_id: 'managua-norte',
      priority: 'high',
      status: 'pending',
      lat: null,
      lng: null,
      geocoded: false
    }
  ];

  const { data: insertados, error: errorInsert } = await supabase
    .from('delivery_jobs')
    .insert(pedidosPrueba)
    .select();

  if (errorInsert) {
    console.error('❌ Error insertando:', errorInsert);
    return;
  }

  console.log(`✅ Se insertaron ${insertados?.length || 0} pedidos de prueba exitosamente!\n`);

  // 3. Mostrar resumen
  const { data: resumen } = await supabase
    .from('delivery_jobs')
    .select('zone_id, priority', { count: 'exact' })
    .eq('status', 'pending');

  const porZona = {};
  const porPrioridad = {};

  resumen?.forEach(p => {
    porZona[p.zone_id] = (porZona[p.zone_id] || 0) + 1;
    porPrioridad[p.priority] = (porPrioridad[p.priority] || 0) + 1;
  });

  console.log('📊 Resumen por zona:');
  Object.entries(porZona).forEach(([zona, count]) => {
    console.log(`   ${zona}: ${count} pedidos`);
  });

  console.log('\n📊 Resumen por prioridad:');
  Object.entries(porPrioridad).forEach(([prioridad, count]) => {
    console.log(`   ${prioridad}: ${count} pedidos`);
  });

  console.log('\n✅ Datos listos para usar en Centro de Rutas!');
}

ejecutarSQL().catch(console.error);
