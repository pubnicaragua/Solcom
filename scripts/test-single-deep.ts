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

async function testDeep() {
    console.log('🧪 BUSCANDO EL ENDPOINT CON FECHA DE CREACIÓN Y BODEGA...\n');
    try {
        const accessToken = await getZohoAccessToken();
        const testItemZohoId = '5776851000012460923';

        // Intento 1: Obtener el producto completo para ver si trae el detalle de las series incrustado
        const urlItem = `https://www.zohoapis.com/inventory/v1/items/${testItemZohoId}?organization_id=${ZOHO_ORG_ID}`;
        const resItem = await fetch(urlItem, { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } });
        const dataItem = await resItem.json();
        
        console.log('--- INTENTO 1: GET SINGLE ITEM ---');
        // Buscamos si existe alguna key 'serial' en todo el json
        const itemKeys = Object.keys(dataItem.item || {});
        console.log('Keys disponibles en el ITEM:', itemKeys.filter(k => k.includes('serial')));
        
        // Intento 2: Tracking endpoint
        const urlTrack = `https://www.zohoapis.com/inventory/v1/items/serialnumbers?organization_id=${ZOHO_ORG_ID}&item_id=${testItemZohoId}`;
        const resTrack = await fetch(urlTrack, { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } });
        const dataTrack = await resTrack.json();
        
        console.log('\n--- INTENTO 2: DETALLE DE 1 SERIE ESPECÍFICA ---');
        // Si dataTrack tiene series, probemos pidiendo el detalle individual de una de ellas (si el API existe)
        if (dataTrack.serial_numbers && dataTrack.serial_numbers.length > 0) {
            const sampleSerialId = dataTrack.serial_numbers[0].serialnumber_id;
            console.log(`Intentando pedir el detalle profundo del Serial ID: ${sampleSerialId}`);
            
            // Endpoint teorizado basado en la arquitectura REST de Zoho
            const urlDeep = `https://www.zohoapis.com/inventory/v1/serialnumbers/${sampleSerialId}?organization_id=${ZOHO_ORG_ID}`;
            const resDeep = await fetch(urlDeep, { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } });
            
            if (resDeep.ok) {
                const dataDeep = await resDeep.json();
                console.log('¡Éxito! Zoho tiene un endpoint para series individuales:');
                console.log(dataDeep);
            } else {
                console.log('No existe el endpoint para detalle de serie individual.');
                console.log('Error de Zoho:', await resDeep.text());
            }
        }
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}
testDeep();
