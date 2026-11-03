/**
 * zoho-audit.js
 * 
 * 1. Obtiene token de Zoho
 * 2. Trae TODOS los items de Zoho Inventory paginados
 * 3. Trae TODOS los items del ERP (Supabase) con paginación completa
 * 4. Compara por zoho_item_id y sku
 * 5. Muestra las discrepancias reales
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Fix: use the correct org_id (without trailing characters)
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
                        console.log(`   ✅ Token obtenido con ${cred.name}`);
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
        const url = `${apiDomain}/inventory/v1/items?organization_id=${ORG_ID}&per_page=200&page=${page}`;
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
        await sleep(400);
    }

    console.log(`\n   ✅ Total items en Zoho: ${allItems.length}`);
    return allItems;
}

// Fetch ALL items from Supabase (paginated beyond 1000 limit)
async function fetchAllErpItems() {
    let all = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
        const { data } = await supabase
            .from('items')
            .select('id, sku, name, stock_total, zoho_item_id, zoho_removed_at')
            .range(from, from + PAGE - 1);
        all = all.concat(data || []);
        if (!data || data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

// Fetch inventory_balance and aggregate by item
async function fetchBalanceTotals() {
    let all = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
        const { data } = await supabase
            .from('inventory_balance')
            .select('item_id, qty_on_hand')
            .range(from, from + PAGE - 1);
        all = all.concat(data || []);
        if (!data || data.length < PAGE) break;
        from += PAGE;
    }
    const totals = new Map();
    for (const b of all) {
        totals.set(b.item_id, (totals.get(b.item_id) || 0) + b.qty_on_hand);
    }
    return totals;
}

// ── MAIN ──
async function main() {
    console.log('\n══════════════════════════════════════════════════');
    console.log('   AUDITORÍA ZOHO vs SOLCOM ERP');
    console.log('══════════════════════════════════════════════════\n');
    console.log(`   Organization ID (limpio): ${ORG_ID}\n`);

    // 1. Token
    console.log('1️⃣  Obteniendo token de Zoho...');
    const { token, api } = await getToken();

    // 2. Fetch Zoho items
    console.log('\n2️⃣  Descargando TODOS los items de Zoho Inventory...');
    const zohoItems = await fetchAllZohoItems(token, api);

    // 3. Fetch ERP items
    console.log('\n3️⃣  Cargando items del ERP (Supabase)...');
    const erpItems = await fetchAllErpItems();
    console.log(`   ✅ Total items en ERP: ${erpItems.length}`);

    // 4. Fetch balance totals
    console.log('\n4️⃣  Calculando stock desde inventory_balance...');
    const balanceTotals = await fetchBalanceTotals();

    // Build lookup maps
    const zohoByItemId = new Map();
    const zohoBySku = new Map();
    for (const z of zohoItems) {
        zohoByItemId.set(String(z.item_id), z);
        if (z.sku) zohoBySku.set(String(z.sku).trim(), z);
    }

    const erpByZohoId = new Map();
    const erpBySku = new Map();
    const erpByNormalizedSku = new Map();
    for (const e of erpItems) {
        if (e.zoho_item_id) erpByZohoId.set(String(e.zoho_item_id), e);
        if (e.sku) {
            erpBySku.set(e.sku, e);
            const normalizedSku = String(e.sku).trim().toUpperCase();
            if (!erpByNormalizedSku.has(normalizedSku)) erpByNormalizedSku.set(normalizedSku, []);
            erpByNormalizedSku.get(normalizedSku).push(e);
        }
    }

    const duplicateSkuGroups = [...erpByNormalizedSku.entries()]
        .filter(([, rows]) => rows.length > 1)
        .map(([sku, rows]) => ({
            sku,
            rows,
            stockTotal: rows.reduce((sum, row) => sum + Number(row.stock_total || 0), 0),
        }))
        .sort((a, b) => b.stockTotal - a.stockTotal);

    // 5. Compare
    console.log('\n5️⃣  Comparando...\n');

    // A) Items en Zoho con stock diferente al ERP
    const stockMismatches = [];
    for (const z of zohoItems) {
        const zohoId = String(z.item_id);
        const sku = String(z.sku || '').trim();
        const zohoStock = z.stock_on_hand || 0;

        const erp = erpByZohoId.get(zohoId) || erpBySku.get(sku);
        if (!erp) continue;

        const erpStock = erp.stock_total || 0;
        const erpCalcStock = balanceTotals.get(erp.id) || 0;

        if (zohoStock !== erpStock || zohoStock !== erpCalcStock) {
            stockMismatches.push({ sku, name: (z.name || '').substring(0, 45), zohoStock, erpStock, erpCalcStock });
        }
    }

    // B) Items en Zoho que NO existen en el ERP
    const missingInErp = [];
    for (const z of zohoItems) {
        const zohoId = String(z.item_id);
        const sku = String(z.sku || '').trim();
        const erp = erpByZohoId.get(zohoId) || erpBySku.get(sku);
        if (!erp) {
            missingInErp.push({ sku, name: (z.name || '').substring(0, 45), zohoStock: z.stock_on_hand || 0 });
        }
    }

    // C) Items en ERP con stock > 0 que NO existen en Zoho (y no marcados como removed)
    const missingInZoho = [];
    for (const e of erpItems) {
        if (e.zoho_removed_at) continue;
        const inZoho = (e.zoho_item_id && zohoByItemId.has(String(e.zoho_item_id))) || zohoBySku.has(e.sku);
        if (!inZoho && (e.stock_total || 0) > 0) {
            missingInZoho.push({ sku: e.sku, name: (e.name || '').substring(0, 45), erpStock: e.stock_total || 0 });
        }
    }

    // ── Print ──
    console.log('══════════════════════════════════════════════════');
    console.log('   RESULTADOS');
    console.log('══════════════════════════════════════════════════\n');

    console.log(`📊 Resumen:`);
    console.log(`   Items en Zoho:                    ${zohoItems.length}`);
    console.log(`   Items en ERP:                     ${erpItems.length}`);
    console.log(`   Stock diferente (Zoho vs ERP):    ${stockMismatches.length}`);
    console.log(`   En Zoho pero NO en ERP:           ${missingInErp.length}`);
    console.log(`   En ERP con stock pero NO en Zoho: ${missingInZoho.length}`);
    console.log(`   SKUs duplicados dentro del ERP:   ${duplicateSkuGroups.length}`);

    if (duplicateSkuGroups.length > 0) {
        console.log(`\n🟣 SKUs DUPLICADOS EN ERP — mostrando hasta 20:\n`);
        for (const group of duplicateSkuGroups.slice(0, 20)) {
            console.log(`   [${group.sku}] ${group.rows.length} registros | stock combinado: ${group.stockTotal}`);
            for (const row of group.rows) {
                console.log(`      - ${row.name || 'Sin nombre'} | Zoho: ${row.zoho_item_id || 'sin ID'} | stock: ${row.stock_total || 0}`);
            }
        }
        if (duplicateSkuGroups.length > 20) console.log(`   ... y ${duplicateSkuGroups.length - 20} SKUs duplicados más`);
    }

    if (stockMismatches.length > 0) {
        console.log(`\n\n🔴 DISCREPANCIAS DE STOCK (Zoho vs ERP) — mostrando hasta 50:\n`);
        console.log('SKU'.padEnd(35) + ' | ' + 'NOMBRE'.padEnd(45) + ' | ZOHO | ERP_TOTAL | ERP_CALC');
        console.log('-'.repeat(140));
        for (const m of stockMismatches.slice(0, 50)) {
            console.log(
                `${m.sku.padEnd(35)} | ${m.name.padEnd(45)} | ${String(m.zohoStock).padStart(5)} | ${String(m.erpStock).padStart(9)} | ${String(m.erpCalcStock).padStart(8)}`
            );
        }
        if (stockMismatches.length > 50) console.log(`   ... y ${stockMismatches.length - 50} más`);
        
        // Guardar para que trigger-fix.js lo pueda leer
        const fs = require('fs');
        fs.writeFileSync('mismatches.json', JSON.stringify(stockMismatches.map(m => m.sku), null, 2));
        fs.writeFileSync('mismatches_full.json', JSON.stringify(stockMismatches, null, 2));
        console.log('\n💾 Se guardaron los ' + stockMismatches.length + ' SKUs en mismatches.json para su corrección.');
    }

    if (missingInErp.length > 0) {
        console.log(`\n\n🟡 EN ZOHO PERO NO EN ERP — mostrando hasta 20:\n`);
        for (const m of missingInErp.slice(0, 20)) {
            console.log(`   [${m.sku}] ${m.name} (stock Zoho: ${m.zohoStock})`);
        }
        if (missingInErp.length > 20) console.log(`   ... y ${missingInErp.length - 20} más`);
    }

    if (missingInZoho.length > 0) {
        console.log(`\n\n🟠 EN ERP CON STOCK PERO NO EN ZOHO — mostrando hasta 20:\n`);
        for (const m of missingInZoho.slice(0, 20)) {
            console.log(`   [${m.sku}] ${m.name} (stock ERP: ${m.erpStock})`);
        }
        if (missingInZoho.length > 20) console.log(`   ... y ${missingInZoho.length - 20} más`);
    }

    console.log('\n══════════════════════════════════════════════════');
    console.log('   AUDITORÍA COMPLETA');
    console.log('══════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('\n💥 Error fatal:', err.message); process.exit(1); });
