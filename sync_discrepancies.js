require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const querystring = require('querystring');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = '872034702';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode >= 400) {
                        reject(new Error(`Status ${res.statusCode}: ${data}`));
                    } else {
                        resolve(JSON.parse(data));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        if (options.body) req.write(options.body);
        req.on('error', reject);
        req.end();
    });
}

async function getZohoToken() {
    const postData = querystring.stringify({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN || process.env.ZOHO_BOOKS_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID || process.env.ZOHO_BOOKS_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET || process.env.ZOHO_BOOKS_CLIENT_SECRET,
        grant_type: 'refresh_token'
    });

    const res = await fetchJson('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        },
        body: postData
    });
    return res.access_token;
}

async function getAllZohoItems(token) {
    let allItems = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const res = await fetchJson(`https://www.zohoapis.com/inventory/v1/items?organization_id=${ORG_ID}&page=${page}`, {
            headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
        });
        if (res.items) allItems.push(...res.items);
        hasMore = res.page_context?.has_more_page;
        page++;
    }
    return allItems;
}

async function getAllSupabaseItems() {
    let allItems = [];
    let page = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('items')
            .select('sku, stock_total')
            .range(page * limit, (page + 1) * limit - 1);
        if (error) throw error;
        if (data.length === 0) break;
        allItems.push(...data);
        page++;
    }
    return allItems;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log("Iniciando Sincronización Selectiva...");
    
    try {
        console.log("1. Obteniendo token de Zoho...");
        const token = await getZohoToken();
        
        console.log("2. Descargando items de Zoho...");
        const zohoItemsRaw = await getAllZohoItems(token);
        const zohoMap = new Map();
        for (const item of zohoItemsRaw) {
            if (!item.sku) continue;
            const stock = item.available_stock !== undefined ? item.available_stock : (item.stock_on_hand || 0);
            zohoMap.set(item.sku.trim().toUpperCase(), { name: item.name, stock });
        }

        console.log("3. Descargando items de ERP...");
        const localItemsRaw = await getAllSupabaseItems();
        const localMap = new Map();
        for (const item of localItemsRaw) {
            if (!item.sku) continue;
            localMap.set(item.sku.trim().toUpperCase(), item.stock_total || 0);
        }

        const toSync = [];
        for (const [sku, zohoData] of zohoMap.entries()) {
            const localStock = localMap.get(sku);
            if (localStock !== undefined && zohoData.stock !== localStock) {
                toSync.push({ sku, name: zohoData.name, zohoStock: zohoData.stock, localStock });
            }
        }

        console.log(`\nSe encontraron ${toSync.length} productos con discrepancias.`);
        if (toSync.length === 0) {
            console.log("✅ Sin discrepancias por sincronizar.");
            return;
        }

        console.log("\n4. Iniciando sincronización uno por uno en Vercel...");
        let successCount = 0;
        for (let i = 0; i < toSync.length; i++) {
            const item = toSync[i];
            console.log(`[${i + 1}/${toSync.length}] Sincronizando SKU: ${item.sku} (${item.name})...`);
            
            try {
                // Codificar SKU para URL segura
                const encodedSku = encodeURIComponent(item.sku);
                const url = `https://solcom-erp.vercel.app/api/debug/sync-item?sku=${encodedSku}`;
                
                const res = await fetchJson(url);
                if (res.success) {
                    console.log(`   ✅ Sincronizado. Nuevo Stock: ${res.cleanStock}`);
                    successCount++;
                } else {
                    console.log(`   ❌ Error en endpoint: ${JSON.stringify(res)}`);
                }
            } catch (err) {
                console.log(`   ❌ Fallo de red/petición: ${err.message}`);
            }

            // Esperar 250ms para no saturar
            await delay(250);
        }

        console.log(`\nSincronización terminada. Exitosos: ${successCount}/${toSync.length}`);

    } catch (err) {
        console.error("Error global en script:", err);
    }
}

run();
