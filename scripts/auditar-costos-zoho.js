/**
 * auditar-costos-zoho.js
 * 
 * Consulta el Reporte Oficial de Valoración de Inventario de Zoho Books
 * y compara el costo unitario contable real (asset_value / quantity_available)
 * con el campo 'price' de los items en Supabase.
 * 
 * Genera mismatches_costos.json con todos los items a corregir.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ORG_ID = (process.env.ZOHO_BOOKS_ORGANIZATION_ID || '').replace(/[^0-9]/g, '');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getToken() {
    const domain = 'https://accounts.zoho.com';
    const params = new URLSearchParams({
        refresh_token: process.env.ZOHO_BOOKS_REFRESH_TOKEN,
        client_id: process.env.ZOHO_BOOKS_CLIENT_ID,
        client_secret: process.env.ZOHO_BOOKS_CLIENT_SECRET,
        grant_type: 'refresh_token',
    });
    const res = await fetch(`${domain}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });
    const data = await res.json();
    if (!data.access_token) {
        throw new Error(`Error obteniendo token Zoho: ${JSON.stringify(data)}`);
    }
    return { token: data.access_token, api: data.api_domain || 'https://www.zohoapis.com' };
}

async function fetchAllZohoValuation(token, api) {
    let items = [];
    let page = 1;
    let hasMore = true;

    console.log('Descargando reporte oficial de valoración de Zoho Books...');
    while (hasMore) {
        const url = `${api}/books/v3/reports/inventoryvaluation?organization_id=${ORG_ID}&page=${page}&per_page=200`;
        const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
        if (!res.ok) {
            console.error(`Error en página ${page}:`, res.status, await res.text());
            break;
        }
        const data = await res.json();
        const groups = data.inventory_valuation || [];
        for (const g of groups) {
            if (g.item_details) {
                items.push(...g.item_details);
            }
        }
        hasMore = data.page_context?.has_more_page === true;
        process.stdout.write(`\r  📥 Página ${page} procesada (${items.length} items)...`);
        page++;
        await sleep(200);
    }
    console.log(`\n  ✅ Total items obtenidos de Zoho Valuation: ${items.length}`);
    return items;
}

async function fetchAllErpItems() {
    console.log('Cargando items de Supabase...');
    let all = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('items')
            .select('id, sku, name, stock_total, price, zoho_item_id')
            .range(from, from + 999);
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < 1000) break;
        from += 1000;
    }
    console.log(`  ✅ Total items cargados de Supabase: ${all.length}`);
    return all;
}

async function main() {
    console.log('========================================================');
    console.log('   AUDITORÍA DE COSTOS REALES (ZOHO vs ERP)');
    console.log('========================================================\n');

    const { token, api } = await getToken();
    const zohoItems = await fetchAllZohoValuation(token, api);
    const erpItems = await fetchAllErpItems();

    // Map Zoho items
    const zohoById = new Map();
    const zohoBySku = new Map();
    for (const z of zohoItems) {
        if (z.item_id) zohoById.set(String(z.item_id).trim(), z);
        if (z.sku) zohoBySku.set(String(z.sku).trim(), z);
    }

    const mismatches = [];
    let currentErpTotalVal = 0;
    let expectedErpTotalVal = 0;

    for (const item of erpItems) {
        const sku = String(item.sku || '').trim();
        const erpStock = Number(item.stock_total || 0);
        const erpPrice = Number(item.price || 0);
        currentErpTotalVal += erpStock * erpPrice;

        const zohoItem = zohoById.get(String(item.zoho_item_id).trim()) || zohoBySku.get(sku);
        if (!zohoItem) {
            expectedErpTotalVal += erpStock * erpPrice;
            continue;
        }

        const zohoQty = Number(zohoItem.quantity_available || 0);
        const zohoAssetVal = Number(zohoItem.asset_value || 0);

        // Calculate real unit cost
        let realUnitCost = erpPrice;
        if (zohoQty > 0 && zohoAssetVal > 0) {
            realUnitCost = Number((zohoAssetVal / zohoQty).toFixed(4));
        } else if (zohoQty === 0 && zohoItem.purchase_rate) {
            const pr = Number(zohoItem.purchase_rate);
            if (pr > 0) realUnitCost = pr;
        }

        expectedErpTotalVal += erpStock * realUnitCost;

        // Check if there is a discrepancy in unit cost
        const priceDiff = Math.abs(erpPrice - realUnitCost);
        const totalImpact = (realUnitCost - erpPrice) * erpStock;

        if (priceDiff > 0.01) {
            mismatches.push({
                id: item.id,
                sku: item.sku,
                name: item.name,
                zoho_item_id: item.zoho_item_id || zohoItem.item_id,
                stock: erpStock,
                erp_price: erpPrice,
                real_unit_cost: realUnitCost,
                price_diff: Number((realUnitCost - erpPrice).toFixed(2)),
                total_impact: Number(totalImpact.toFixed(2)),
            });
        }
    }

    mismatches.sort((a, b) => Math.abs(b.total_impact) - Math.abs(a.total_impact));

    // Save to mismatches_costos.json
    const outputPath = path.join(__dirname, '..', 'mismatches_costos.json');
    fs.writeFileSync(outputPath, JSON.stringify(mismatches, null, 2));

    console.log('\n========================================================');
    console.log('   RESULTADOS DE AUDITORÍA');
    console.log('========================================================');
    console.log(`Total productos con costo desfasado: ${mismatches.length}`);
    console.log(`Valor actual ERP (stock * price):     $${currentErpTotalVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Valor proyectado ERP corregido:       $${expectedErpTotalVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Ajuste neto proyectado:               $${(expectedErpTotalVal - currentErpTotalVal).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

    console.log('\nTop 15 productos con mayor impacto en el valor:');
    console.log('SKU'.padEnd(22) + ' | ' + 'STOCK'.padStart(6) + ' | ' + 'P. ERP'.padStart(9) + ' | ' + 'COSTO ZOHO'.padStart(11) + ' | ' + 'IMPACTO NETO'.padStart(14));
    console.log('-'.repeat(72));
    for (const m of mismatches.slice(0, 15)) {
        console.log(
            `${(m.sku || '').substring(0, 22).padEnd(22)} | ` +
            `${String(m.stock).padStart(6)} | ` +
            `$${m.erp_price.toFixed(2).padStart(8)} | ` +
            `$${m.real_unit_cost.toFixed(2).padStart(10)} | ` +
            `${(m.total_impact >= 0 ? '+$' : '-$') + Math.abs(m.total_impact).toFixed(2).padStart(11)}`
        );
    }

    console.log(`\nArchivo generado con éxito: mismatches_costos.json`);
    console.log('Listo para ejecutar: node scripts/reparar-costos-zoho.js\n');
}

main().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
