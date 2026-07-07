require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const querystring = require('querystring');
const fs = require('fs');

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
            .select('sku, name, stock_total')
            .range(page * limit, (page + 1) * limit - 1);
        if (error) throw error;
        if (data.length === 0) break;
        allItems.push(...data);
        page++;
    }
    return allItems;
}

async function run() {
    console.log("Iniciando comparación total de inventario...");
    
    try {
        console.log("1. Obteniendo token de Zoho...");
        const token = await getZohoToken();
        
        console.log("2. Descargando todos los items de Zoho...");
        const zohoItemsRaw = await getAllZohoItems(token);
        const zohoMap = new Map();
        for (const item of zohoItemsRaw) {
            if (!item.sku) continue;
            zohoMap.set(item.sku.trim().toUpperCase(), {
                name: item.name,
                stockOnHand: Number(item.stock_on_hand ?? 0),
                availableStock: Number(item.available_stock ?? 0)
            });
        }
        console.log(`-> ${zohoMap.size} items con SKU en Zoho.`);

        console.log("3. Descargando todos los items del ERP...");
        const localItemsRaw = await getAllSupabaseItems();
        const localMap = new Map();
        for (const item of localItemsRaw) {
            if (!item.sku) continue;
            localMap.set(item.sku.trim().toUpperCase(), {
                name: item.name,
                stockTotal: Number(item.stock_total ?? 0)
            });
        }
        console.log(`-> ${localMap.size} items con SKU en ERP.`);

        console.log("4. Comparando y generando reporte de discrepancias...");
        
        let reportLines = [];
        reportLines.push("REPORTE COMPLETO DE DISCREPANCIAS DE INVENTARIO (ZOHO VS ERP)");
        reportLines.push(`Fecha: ${new Date().toLocaleString()}`);
        reportLines.push("==========================================================================================");
        reportLines.push(String("SKU").padEnd(20) + " | " + String("Nombre Producto").padEnd(50) + " | " + String("Zoho A Mano").padStart(12) + " | " + String("Zoho Disponible").padStart(15) + " | " + String("ERP Stock Total").padStart(15));
        reportLines.push("------------------------------------------------------------------------------------------");

        let diffCount = 0;
        
        // Verificamos todos los SKUs que existen en Zoho
        for (const [sku, zohoData] of zohoMap.entries()) {
            const localData = localMap.get(sku);
            const localStock = localData ? localData.stockTotal : 0;
            
            // Si hay alguna diferencia entre el stock físico de Zoho y el stock del ERP
            if (zohoData.stockOnHand !== localStock) {
                diffCount++;
                const line = `${sku.padEnd(20)} | ${zohoData.name.substring(0, 50).padEnd(50)} | ${String(zohoData.stockOnHand).padStart(12)} | ${String(zohoData.availableStock).padStart(15)} | ${String(localStock).padStart(15)}`;
                reportLines.push(line);
            }
        }
        
        reportLines.push("==========================================================================================");
        reportLines.push(`Total de productos analizados: ${zohoMap.size}`);
        reportLines.push(`Total de discrepancias encontradas: ${diffCount}`);

        const txtContent = reportLines.join("\n");
        const filePath = 'comparacion_total_inventario.txt';
        
        fs.writeFileSync(filePath, txtContent, 'utf-8');
        
        console.log(`\n✅ Reporte de comparación total guardado con éxito en: ${filePath}`);
        console.log(`Total de discrepancias reales encontradas: ${diffCount}`);
        
    } catch (err) {
        console.error("Error en script:", err);
    }
}

run();
