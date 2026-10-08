/**
 * auditar-precios-zoho.js
 * 
 * 1. Obtiene token de Zoho
 * 2. Trae TODOS los items de Zoho Inventory paginados
 * 3. Trae TODOS los items del ERP (Supabase)
 * 4. Calcula el valor total de capital invertido usando:
 *    - price del ERP
 *    - purchase_rate de Zoho (costo)
 *    - rate de Zoho (precio de venta)
 * 5. Muestra cuántos items caen en el fallback (purchase_rate = 0 -> usa rate)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ORG_ID = (process.env.ZOHO_BOOKS_ORGANIZATION_ID || '').replace(/[^0-9]/g, '');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getToken() {
    const credSets = [
        {
            name: 'ZOHO_BOOKS',
            clientId: process.env.ZOHO_BOOKS_CLIENT_ID,
            clientSecret: process.env.ZOHO_BOOKS_CLIENT_SECRET,
            refreshToken: process.env.ZOHO_BOOKS_REFRESH_TOKEN,
        },
        {
            name: 'ZOHO (Inventory)',
            clientId: process.env.ZOHO_CLIENT_ID,
            clientSecret: process.env.ZOHO_CLIENT_SECRET,
            refreshToken: process.env.ZOHO_REFRESH_TOKEN,
        },
    ];

    const domains = [
        process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com',
        'https://accounts.zoho.com',
    ];
    const uniqueDomains = [...new Set(domains)];

    for (const cred of credSets) {
        if (!cred.clientId || !cred.refreshToken) continue;
        for (const domain of uniqueDomains) {
            try {
                const res = await fetch(`${domain}/oauth/v2/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        refresh_token: cred.refreshToken,
                        client_id: cred.clientId,
                        client_secret: cred.clientSecret,
                        grant_type: 'refresh_token',
                    }).toString(),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.access_token) {
                        return { token: data.access_token, api: data.api_domain || 'https://www.zohoapis.com' };
                    }
                }
            } catch (e) { /* next */ }
        }
    }
    throw new Error('No se pudo obtener token de Zoho con ninguna credencial');
}

// Fetch ALL items from Zoho Inventory (paginated)
async function fetchAllZohoItems(token, apiDomain) {
    const allItems = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        // Use Books API to match full-sync.js which uses books/v3/items
        const url = `${apiDomain}/books/v3/items?organization_id=${ORG_ID}&page=${page}&per_page=200`;
        const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });

        if (!res.ok) {
            const errText = await res.text();
            if (errText.includes('too many requests') || res.status === 429) {
                console.log(`\n   ⏳ Rate limited en página ${page}, esperando 60s...`);
                await sleep(60000);
                continue;
            }
            console.error(`\n   ❌ Página ${page} falló: ${res.status} ${errText.substring(0, 200)}`);
            break;
        }

        const data = await res.json();
        const items = data.items || [];
        allItems.push(...items);

        hasMore = data.page_context?.has_more_page === true;
        process.stdout.write(`\r   📥 ${allItems.length} items de Zoho (página ${page})...`);
        page++;
        await sleep(300);
    }

    console.log(`\n   ✅ Total items en Zoho: ${allItems.length}`);
    return allItems;
}

// Fetch ALL items from Supabase
async function fetchAllErpItems() {
    let all = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
        const { data } = await supabase
            .from('items')
            .select('id, sku, name, stock_total, price, zoho_item_id')
            .range(from, from + PAGE - 1);
        all = all.concat(data || []);
        if (!data || data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

async function main() {
    console.log('\n══════════════════════════════════════════════════');
    console.log('   AUDITORÍA DE PRECIOS ZOHO vs SOLCOM ERP');
    console.log('══════════════════════════════════════════════════\n');

    console.log('1️⃣  Obteniendo token de Zoho...');
    const { token, api } = await getToken();

    console.log('\n2️⃣  Descargando TODOS los items de Zoho Books...');
    const zohoItems = await fetchAllZohoItems(token, api);

    console.log('\n3️⃣  Cargando items del ERP (Supabase)...');
    const erpItems = await fetchAllErpItems();
    console.log(`   ✅ Total items en ERP: ${erpItems.length}`);

    // Build lookup for Zoho items
    const zohoByItemId = new Map();
    const zohoBySku = new Map();
    for (const z of zohoItems) {
        zohoByItemId.set(String(z.item_id), z);
        if (z.sku) zohoBySku.set(String(z.sku).trim(), z);
    }

    console.log('\n4️⃣  Calculando valores...');

    let totalValueErp = 0;
    let totalValueZohoPurchaseRate = 0;
    let totalValueZohoRate = 0;
    
    let countFallbackToRate = 0;
    let countZeroPrice = 0;
    let totalStockAllItems = 0;

    const fallbackItems = [];

    for (const erpItem of erpItems) {
        const stock = erpItem.stock_total || 0;
        const erpPrice = erpItem.price || 0;
        
        // Match with Zoho
        const zohoItem = zohoByItemId.get(String(erpItem.zoho_item_id)) || zohoBySku.get(String(erpItem.sku).trim());
        
        let purchaseRate = 0;
        let rate = 0;

        if (zohoItem) {
            purchaseRate = Number(zohoItem.purchase_rate) || 0;
            rate = Number(zohoItem.rate) || 0;
        }

        totalStockAllItems += stock;
        
        // Sumamos valores (solo considerando el stock que sí existe)
        totalValueErp += (erpPrice * stock);
        totalValueZohoPurchaseRate += (purchaseRate * stock);
        totalValueZohoRate += (rate * stock);

        // Track behavior ONLY for items WITH stock
        if (stock > 0) {
            if (purchaseRate === 0 && rate > 0) {
                countFallbackToRate++;
                fallbackItems.push({
                    sku: erpItem.sku,
                    name: erpItem.name.substring(0, 45),
                    stock: stock,
                    purchaseRate: purchaseRate,
                    rate: rate,
                    erpPrice: erpPrice
                });
            } else if (purchaseRate === 0 && rate === 0) {
                countZeroPrice++;
            }
        }
    }

    console.log('\n══════════════════════════════════════════════════');
    console.log('   RESULTADOS DE VALORACIÓN');
    console.log('══════════════════════════════════════════════════\n');

    console.log(`Total Stock Físico (ERP):        ${totalStockAllItems.toLocaleString()}`);
    console.log(`\nVALORES DE INVENTARIO:`);
    console.log(`💰 Capital Invertido ERP:        $${totalValueErp.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    console.log(`   (Usa el campo 'price' guardado en Supabase)`);
    
    console.log(`\n🛒 Valor por Purchase Rate Zoho: $${totalValueZohoPurchaseRate.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    console.log(`   (Costo referencial puro en Zoho)`);
    
    console.log(`\n🏷️ Valor por Rate Zoho:          $${totalValueZohoRate.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    console.log(`   (Precio de venta puro en Zoho)`);

    console.log('\nANÁLISIS DE FALLBACKS (Solo items con stock > 0):');
    console.log(`- Items con purchase_rate = 0 que usan precio de venta (rate): ${countFallbackToRate}`);
    console.log(`- Items donde purchase_rate = 0 y rate = 0 (precio $0):        ${countZeroPrice}`);

    if (fallbackItems.length > 0) {
        console.log(`\n🔴 Ejemplos de items con stock usando precio de venta en vez de costo (inflan el capital):\n`);
        console.log('SKU'.padEnd(20) + ' | ' + 'NOMBRE'.padEnd(45) + ' | STOCK | ERP_PRICE | ZOHO_PURCHASE | ZOHO_RATE');
        console.log('-'.repeat(120));
        
        fallbackItems.sort((a,b) => (b.erpPrice * b.stock) - (a.erpPrice * a.stock)); // sort by value impact

        for (const m of fallbackItems.slice(0, 15)) {
            console.log(
                `${m.sku.padEnd(20)} | ${m.name.padEnd(45)} | ${String(m.stock).padStart(5)} | $${String(m.erpPrice).padStart(8)} | $${String(m.purchaseRate).padStart(11)} | $${String(m.rate).padStart(8)}`
            );
        }
        if (fallbackItems.length > 15) {
            console.log(`   ... y ${fallbackItems.length - 15} más`);
        }
    }

    console.log('\nNota: Zoho Books/Inventory reporta en su balance contable usando "Costo Promedio Ponderado" (MAC) calculado de las facturas.');
    console.log('Estos valores basados en precio fijo de perfil (purchase_rate) sirven de referencia, pero casi nunca cuadrarán exacto al centavo con el MAC.\n');
}

main().catch(err => { console.error('\n💥 Error fatal:', err); process.exit(1); });
