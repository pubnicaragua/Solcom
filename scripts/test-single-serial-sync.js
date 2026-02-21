const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ZOHO_CLIENT_ID = process.env.ZOHO_BOOKS_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_BOOKS_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
const ZOHO_ORG_ID = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

async function getZohoAccessToken() {
    const params = new URLSearchParams();
    params.append('refresh_token', ZOHO_REFRESH_TOKEN);
    params.append('client_id', ZOHO_CLIENT_ID);
    params.append('client_secret', ZOHO_CLIENT_SECRET);
    params.append('grant_type', 'refresh_token');

    const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        body: params,
    });
    if (!res.ok) throw new Error('Error getting Zoho Access Token');
    const data = await res.json();
    return data.access_token;
}

// Reusa la logica de test-serials para mapear nombres de bodegas a UUIDs
async function fetchWarehouses() {
    const { data: warehouses, error } = await supabase.from('warehouses').select('id, name, code');
    if (error) throw error;

    // Convert to map for easy lookup by name or code
    const whMap = new Map();
    warehouses.forEach(wh => {
        whMap.set(wh.name.toUpperCase(), wh.id);
        if (wh.code) whMap.set(wh.code.toUpperCase(), wh.id);
    });
    return whMap;
}

async function testSingleItemSync() {
    console.log('🧪 INICIANDO PRUEBA SEGURA DE NÚMEROS DE SERIE CON 1 SOLO PRODUCTO...\n');

    try {
        console.log('⏳ Obteniendo token de Zoho...');
        const accessToken = await getZohoAccessToken();
        console.log('✅ Token obtenido.');

        console.log('⏳ Consultando bodegas en Supabase...');
        const whMap = await fetchWarehouses();
        console.log(`✅ ${whMap.size} bodegas mapeadas.`);

        // 1. Encontrar 1 producto en Supabase que sepamos que es trackeable en Zoho (que tenga ID de Zoho válido)
        console.log('⏳ Buscando un item en Supabase...');
        const { data: testItems, error: itemErr } = await supabase
            .from('items')
            .select('id, zoho_item_id, sku, name')
            .not('zoho_item_id', 'is', null)
            .limit(10);

        if (itemErr || !testItems || testItems.length === 0) throw new Error('No se encontró ningún item en Supabase para probar.');

        const testItem = testItems[0];
        console.log(`📦 Producto Seleccionado: ${testItem.sku} - ${testItem.name}`);
        console.log(`🔗 Zoho Item ID: ${testItem.zoho_item_id}\n`);

        // 2. Fetch de series desde Zoho Books para ESTE item específico
        console.log(`📡 Consultando a Zoho Inventory las series para el item: ${testItem.zoho_item_id}...`);

        // CORRECCIÓN DEL ENDPOINT (Igual que en test-serials.ts)
        const url = `https://www.zohoapis.com/inventory/v1/items/serialnumbers?organization_id=${ZOHO_ORG_ID}&item_id=${testItem.zoho_item_id}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Zoho API Error: ${errText}`);
        }

        const data = await response.json();
        const serials = data.serialnumbers || [];

        console.log(`✅ Zoho devolvió ${serials.length} números de serie para este producto.\n`);

        if (serials.length === 0) {
            console.log('⚠️ El producto seleccionado no tiene series en Zoho actualmente. Para una prueba real, intenta correr la prueba de nuevo y si es necesario podemos buscar un producto que sí tenga.');
            return;
        }

        // 3. Mapear la respuesta a nuestro formato de Supabase
        console.log('🛠️ Preparando datos para Supabase...');
        const payloadToInsert = [];

        for (const s of serials) {
            // Mapear el nombre de la bodega (ej. MATRIZ - SC) al UUID de Supabase
            const whNameRaw = (s.warehouse_name || '').toUpperCase().trim();
            const supabaseWarehouseId = whMap.get(whNameRaw) || null;

            if (!supabaseWarehouseId) {
                console.log(`⚠️ ALERTA: No se encontró mapeo para la bodega "${s.warehouse_name}". Se guardará con warehouse_id = null.`);
            }

            payloadToInsert.push({
                zoho_serial_id: String(s.serialnumber_id),
                zoho_item_id: testItem.zoho_item_id, // Usamos la misma foreign key inmutable
                warehouse_id: supabaseWarehouseId,
                serial_number: s.serial_number,
                status: s.status, // ej. 'available', 'sold'
                created_time: s.created_time || null,
            });
        }

        console.log('\n📄 Muestra del formato a insertar:');
        console.log(payloadToInsert[0]);

        // 4. Inserción (Upsert) en Supabase
        console.log('\n🚀 Haciendo UPSERT en la tabla `item_serials`...');

        const { data: upsertData, error: upsertErr } = await supabase
            .from('item_serials')
            .upsert(payloadToInsert, {
                onConflict: 'zoho_serial_id' // Evita duplicados basados en el ID oficial de Zoho
            })
            .select();

        if (upsertErr) {
            console.error('\n❌ Error al insertar en Supabase:', upsertErr.message);
            console.error('Detalles:', upsertErr);
            return;
        }

        console.log(`\n🎉 ¡PRUEBA EXITOSA! Se insertaron/actualizaron ${payloadToInsert.length} series en la tabla item_serials.`);
        console.log('Ve a tu consola de Supabase y revisa la tabla `item_serials` para verificar los datos con tus propios ojos.');

    } catch (e) {
        console.error('\n❌ ERROR NO CONTROLADO:', e.message);
    }
}

testSingleItemSync();
