

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const CLIENT_ID = process.env.ZOHO_BOOKS_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_BOOKS_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
const ORG_ID = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Zoho Auth ──
async function getToken() {
    const domains = [
        'https://accounts.zoho.com',
        'https://accounts.zoho.eu',
        'https://accounts.zoho.in',
    ];
    for (const domain of domains) {
        const params = new URLSearchParams({
            refresh_token: REFRESH_TOKEN,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'refresh_token',
        });
        const res = await fetch(`${domain}/oauth/v2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
        if (res.ok) {
            const data = await res.json();
            if (data.access_token) {
                return { token: data.access_token, api: data.api_domain || 'https://www.zohoapis.com' };
            }
        }
    }
    throw new Error('Could not get Zoho token');
}

// ── Fetch ALL items from Zoho listing (paginated) ──
// The listing already includes: sku, name, rate, category_name, brand, manufacturer,
// cf_estado, cf_marca, cf_color, cf_categor_a, cf_precio_minimo, stock_on_hand, etc.
async function fetchAllZohoItems(token, apiDomain) {
    const allItems = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const url = `${apiDomain}/inventory/v1/items?organization_id=${ORG_ID}&page=${page}&per_page=200`;
        const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
        if (!res.ok) { console.error(`\n❌ List page ${page} failed: ${res.status}`); break; }

        const data = await res.json();
        allItems.push(...(data.items || []));

        hasMore = data.page_context?.has_more_page === true;
        page++;
        process.stdout.write(`\r   Fetched ${allItems.length} items from Zoho...`);
        await sleep(300);
    }

    console.log(`\n   ✅ Total: ${allItems.length} items`);
    return allItems;
}

// ── Fetch stock per warehouse via /locationdetails ──
async function fetchLocationDetails(token, apiDomain, itemId) {
    const url = `${apiDomain}/inventory/v1/items/${itemId}/locationdetails?organization_id=${ORG_ID}`;
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.item_location_details?.locations || [];
}

function normalizeState(value) {
    const raw = String(value ?? '').trim().toUpperCase();
    if (!raw || raw === 'ACTIVE' || raw === 'INACTIVE') return null;
    if (raw === 'NEW' || raw === 'NUEVO') return 'NUEVO';
    if (raw === 'USED' || raw === 'USADO' || raw === 'SEMINUEVO') return 'USADO';
    return null;
}

// ── MAIN ──
async function main() {
    console.log('\n🚀 FULL ZOHO → SUPABASE SYNC');
    console.log('═'.repeat(50));

    // 1. Auth
    console.log('\n1️⃣  Getting Zoho token...');
    const { token, api } = await getToken();
    console.log(`   ✅ Token OK`);

    // 2. Load warehouses
    console.log('\n2️⃣  Loading warehouses...');
    const { data: warehouses } = await supabase.from('warehouses').select('id, code, name, active, zoho_warehouse_id');
    const whByZohoId = new Map();
    const whByName = new Map();
    for (const w of warehouses || []) {
        if (w.zoho_warehouse_id) whByZohoId.set(String(w.zoho_warehouse_id), w);
        whByName.set(w.name, w);
        whByName.set(w.code, w);
    }
    console.log(`   ✅ ${warehouses?.length || 0} warehouses`);

    // 3. Fetch ALL items from Zoho listing
    console.log('\n3️⃣  Fetching ALL items from Zoho...');
    const zohoItems = await fetchAllZohoItems(token, api);

    // 4. Load existing Supabase items
    console.log('\n4️⃣  Loading existing Supabase items...');
    const { data: existingItems } = await supabase.from('items').select('id, zoho_item_id, sku');
    const byZohoId = new Map();
    const bySku = new Map();
    for (const item of existingItems || []) {
        if (item.zoho_item_id) byZohoId.set(item.zoho_item_id, item);
        if (item.sku) bySku.set(item.sku, item);
    }
    console.log(`   ✅ ${existingItems?.length || 0} existing items`);

    // 5. Quick validation: test ONE item's locationdetails
    console.log('\n5️⃣  Validating locationdetails endpoint...');
    const testLocs = await fetchLocationDetails(token, api, String(zohoItems[0].item_id));
    console.log(`   ✅ Test item returned ${testLocs.length} locations`);
    if (testLocs[0]) {
        console.log(`   First location: ${testLocs[0].location_name} → stock: ${testLocs[0].location_stock_on_hand}`);
    }

    // 6. Process each item
    console.log('\n6️⃣  Syncing all items...');
    console.log(`   (ETA: ~${Math.ceil(zohoItems.length * 0.6 / 60)} minutes)\n`);

    let created = 0, updated = 0, errors = 0;
    let totalSnapshots = 0, totalBalance = 0;
    const startTime = Date.now();
    const errorLog = [];

    for (let i = 0; i < zohoItems.length; i++) {
        const zi = zohoItems[i];
        const zohoItemId = String(zi.item_id);
        const sku = String(zi.sku || '').trim() || `NO-SKU-${zohoItemId}`;
        const name = String(zi.name || zi.item_name || '').trim() || sku;

        // Progress display
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = i > 0 ? (Date.now() - startTime) / i : 600;
        const remaining = ((zohoItems.length - i) * rate / 1000 / 60).toFixed(1);
        const pct = ((i / zohoItems.length) * 100).toFixed(1);
        process.stdout.write(
            `\r   [${pct}%] ${i + 1}/${zohoItems.length} | ✅${updated} 🆕${created} ❌${errors} | 📸${totalSnapshots} | ETA:${remaining}m | ${name.substring(0, 35).padEnd(35)}  `
        );

        try {
            // ─── Extract metadata from listing ───
            const color = String(zi.cf_color || '').trim() || null;
            const state = normalizeState(zi.cf_estado || zi.cf_estado_unformatted);
            const marca = String(zi.cf_marca || zi.brand || zi.manufacturer || '').trim() || null;
            const categoria = String(zi.cf_categor_a || zi.category_name || '').trim() || 'Sin categoría';
            const price = Number.isFinite(Number(zi.rate)) ? Number(zi.rate) : null;

            const metadata = {
                sku,
                name,
                zoho_item_id: zohoItemId,
                color,
                state,
                marca,
                category: categoria,
                price,
                updated_at: new Date().toISOString(),
            };

            // ─── Upsert item ───
            let supabaseItemId = byZohoId.get(zohoItemId)?.id || bySku.get(sku)?.id;

            if (supabaseItemId) {
                const { error } = await supabase.from('items').update(metadata).eq('id', supabaseItemId);
                if (error) { errorLog.push(`${sku}: update: ${error.message}`); errors++; await sleep(100); continue; }
                updated++;
            } else {
                const { data: newItem, error: insErr } = await supabase
                    .from('items')
                    .insert({ ...metadata, stock_total: 0 })
                    .select('id')
                    .single();

                if (insErr) {
                    // SKU conflict — link existing
                    const { data: match } = await supabase.from('items').select('id').eq('sku', sku).limit(1);
                    if (match?.[0]) {
                        supabaseItemId = match[0].id;
                        await supabase.from('items').update(metadata).eq('id', supabaseItemId);
                        updated++;
                    } else {
                        errorLog.push(`${sku}: insert: ${insErr.message}`);
                        errors++;
                        await sleep(100);
                        continue;
                    }
                } else {
                    supabaseItemId = newItem.id;
                    // Track for future lookups
                    byZohoId.set(zohoItemId, { id: supabaseItemId, zoho_item_id: zohoItemId, sku });
                    bySku.set(sku, { id: supabaseItemId, zoho_item_id: zohoItemId, sku });
                    created++;
                }
            }

            // ─── Fetch stock per warehouse ───
            const locations = await fetchLocationDetails(token, api, zohoItemId);

            let stockTotal = 0;
            const snapshots = [];
            const balanceRows = [];
            const nowIso = new Date().toISOString();

            for (const loc of locations) {
                const locId = String(loc.location_id || '');
                const locName = String(loc.location_name || '');
                const qty = Number(loc.location_stock_on_hand ?? 0);

                let wh = whByZohoId.get(locId) || whByName.get(locName);

                if (!wh) {
                    // Auto-create warehouse
                    const code = locName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 40) || `WH-${locId}`;
                    const { data: newWh, error: whErr } = await supabase
                        .from('warehouses')
                        .insert({ code, name: locName || code, active: loc.status === 'active', zoho_warehouse_id: locId })
                        .select('id, code, name, active, zoho_warehouse_id')
                        .single();

                    if (newWh) {
                        whByZohoId.set(locId, newWh);
                        whByName.set(locName, newWh);
                        wh = newWh;
                        console.log(`\n   📦 New warehouse: ${locName} (${locId})`);
                    } else if (whErr) {
                        // Maybe it already exists by code
                        const { data: existing } = await supabase.from('warehouses').select('*').eq('zoho_warehouse_id', locId).limit(1);
                        if (existing?.[0]) {
                            wh = existing[0];
                            whByZohoId.set(locId, wh);
                        }
                    }
                }

                if (!wh) continue;

                if (wh.active) stockTotal += qty;

                snapshots.push({
                    warehouse_id: wh.id,
                    item_id: supabaseItemId,
                    qty,
                    source_ts: nowIso,
                    synced_at: nowIso,
                });

                balanceRows.push({
                    item_id: supabaseItemId,
                    warehouse_id: wh.id,
                    qty_on_hand: qty,
                    source: 'full-sync',
                    source_ts: nowIso,
                    updated_at: nowIso,
                });
            }

            // ─── Update stock_total ───
            await supabase.from('items').update({ stock_total: stockTotal }).eq('id', supabaseItemId);

            // ─── Replace snapshots ───
            await supabase.from('stock_snapshots').delete().eq('item_id', supabaseItemId);
            if (snapshots.length > 0) {
                const { error: snapErr } = await supabase.from('stock_snapshots').insert(snapshots);
                if (snapErr) {
                    errorLog.push(`${sku}: snapshots: ${snapErr.message}`);
                } else {
                    totalSnapshots += snapshots.length;
                }
            }

            // ─── Replace inventory_balance ───
            await supabase.from('inventory_balance').delete().eq('item_id', supabaseItemId);
            if (balanceRows.length > 0) {
                const { error: balErr } = await supabase.from('inventory_balance').insert(balanceRows);
                if (balErr) {
                    errorLog.push(`${sku}: balance: ${balErr.message}`);
                } else {
                    totalBalance += balanceRows.length;
                }
            }

            // Rate limit protection
            await sleep(350);

        } catch (err) {
            errorLog.push(`${sku}: ${err.message}`);
            errors++;
            await sleep(500);
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('\n\n' + '═'.repeat(50));
    console.log('🎉 SYNC COMPLETE');
    console.log('═'.repeat(50));
    console.log(`   Total Zoho items:    ${zohoItems.length}`);
    console.log(`   Updated:             ${updated}`);
    console.log(`   Created:             ${created}`);
    console.log(`   Errors:              ${errors}`);
    console.log(`   Snapshots created:   ${totalSnapshots}`);
    console.log(`   Balance rows:        ${totalBalance}`);
    console.log(`   Duration:            ${totalTime} min`);

    if (errorLog.length > 0) {
        console.log(`\n❌ Errors (${errorLog.length}):`);
        for (const e of errorLog.slice(0, 40)) console.log(`   - ${e}`);
        if (errorLog.length > 40) console.log(`   ... and ${errorLog.length - 40} more`);
    }

    console.log('\n✅ Done! All inventory data is fresh from Zoho.\n');
}

main().catch(err => { console.error('\n💥 Fatal:', err); process.exit(1); });
