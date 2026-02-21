import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

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
    const data = await res.json();
    return data.access_token;
}

async function testDeep() {
    try {
        const accessToken = await getZohoAccessToken();
        const testItemZohoId = '5776851000012460923';

        // Intento 3: Llamar al Webhook de movimientos de bodega (Transaction History de Zoho)
        console.log('\n--- INTENTO 3: HISTORIAL DE TRANSACCIONES DEL ITEM ---');
        const urlTrans = `https://www.zohoapis.com/inventory/v1/items/${testItemZohoId}/transactionhistory?organization_id=${ZOHO_ORG_ID}`;
        const resTrans = await fetch(urlTrans, { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } });
        
        if (resTrans.ok) {
            const dataTrans = await resTrans.json();
            console.log('Keys en transactionhistory:', Object.keys(dataTrans));
            if (dataTrans.transactions && dataTrans.transactions.length > 0) {
               console.log('Sample transaction:', JSON.stringify(dataTrans.transactions[0], null, 2).substring(0, 500));
            } else {
               console.log('No hay transacciones para este item.');
            }
        }
        
        // Intento 4: Llamar al Serial Number Tracking genérico
        console.log('\n--- INTENTO 4: REPORTE DE NUMEROS DE SERIE ---');
        // Este endpoint es diferente al de Inventory. Es reporte de Serial Numbers
        const urlReport = `https://www.zohoapis.com/inventory/v1/reports/serialnumber?organization_id=${ZOHO_ORG_ID}&item_id=${testItemZohoId}`;
        const resReport = await fetch(urlReport, { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } });
        if (resReport.ok) {
            const dataReport = await resReport.json();
            console.log('Exito en Reporte de Números de Serie:', JSON.stringify(dataReport, null, 2).substring(0, 500));
        } else {
            console.log('Error en reporte de números de serie:', await resReport.text());
        }

    } catch (e: any) {
        console.error('Error:', e.message);
    }
}
testDeep();
