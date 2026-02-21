import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const ZOHO_CLIENT_ID = process.env.ZOHO_BOOKS_CLIENT_ID!;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_BOOKS_CLIENT_SECRET!;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_BOOKS_REFRESH_TOKEN!;
const ZOHO_ORG_ID = process.env.ZOHO_BOOKS_ORGANIZATION_ID!;

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

async function fetchWarehouses() {
    const { data: warehouses, error } = await supabase.from('warehouses').select('id, name, code');
    if (error) throw error;

    const whMap = new Map<string, string>();
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

        // Utilizar el ID exacto que el usuario confirmó que tiene series
        const testItemZohoId = '5776851000012460923';
        const testItemSku = 'TEST-ITEM'; // Hardcoded para la prueba

        console.log(`\n✅ Usando Producto Manual: ${testItemSku}`);
        console.log(`🔗 Zoho Item ID: ${testItemZohoId}`);

        console.log(`📡 Consultando a Zoho Inventory las series para el item: ${testItemZohoId}...`);
        const url = `https://www.zohoapis.com/inventory/v1/items/serialnumbers?organization_id=${ZOHO_ORG_ID}&item_id=${testItemZohoId}`;

        const response = await fetch(url, { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } });
        if (!response.ok) throw new Error(`Zoho API Error: ${await response.text()}`);

        const data = await response.json();
        const foundSerials = data.serial_numbers || []; // ¡EL ERROR ERA EL GUION BAJO!

        console.log(`✅ Zoho tiene ${foundSerials.length} números de serie activos para este producto.\n`);

        if (foundSerials.length === 0) {
            console.log('⚠️ Aún indica que devolvió 0. Revisa si se han vendido en Zoho.');
            return;
        }

        console.log('🛠️ Preparando datos para Supabase...');
        const payloadToInsert = [];

        for (const s of foundSerials) {
            const whNameRaw = (s.warehouse_name || '').toUpperCase().trim();
            const supabaseWarehouseId = whMap.get(whNameRaw) || null;

            payloadToInsert.push({
                zoho_serial_id: String(s.serialnumber_id),
                zoho_item_id: testItemZohoId,
                warehouse_id: supabaseWarehouseId,
                serial_number: s.serialnumber, // ¡ESTE NO LLEVA GUION BAJO SEGUN TU SCREENSHOT!
                status: s.status,
                created_time: s.created_time || null,
            });
        }

        console.log('\n📄 Muestra del formato a insertar:');
        console.log(payloadToInsert[0]);

        console.log('\n🚀 Haciendo UPSERT en la tabla `item_serials`...');
        const { data: upsertData, error: upsertErr } = await supabase
            .from('item_serials')
            .upsert(payloadToInsert, { onConflict: 'zoho_serial_id' })
            .select();

        if (upsertErr) {
            console.error('\n❌ Error al insertar en Supabase:', upsertErr.message);
            return;
        }

        console.log(`\n🎉 ¡PRUEBA EXITOSA! Se insertaron/actualizaron ${payloadToInsert.length} series en la tabla item_serials.`);

    } catch (e: any) {
        console.error('\n❌ ERROR:', e.message);
    }
}

testSingleItemSync();
