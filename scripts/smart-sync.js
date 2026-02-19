/**
 * Smart Sync: fetches recently-modified items from Zoho Inventory
 * and syncs them to Supabase. No duplicates (uses upsert logic).
 * 
 * Usage: node scripts/smart-sync.js [count]
 *   count = number of items to sync (default 50)
 *   Use "all" to fetch everything
 */

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

// ── Zoho Auth (tries multiple domains) ──
async function getToken() {
    const domains = [
        process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com',
        'https://accounts.zoho.com',
        'https://accounts.zoho.eu',
    ];
    // deduplicate
    const unique = [...new Set(domains)];

    for (const domain of unique) {
        try {
            const res = await fetch(`${domain}/oauth/v2/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    refresh_token: REFRESH_TOKEN,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    grant_type: 'refresh_token',
                }).toString(),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.access_token) {
                    return { token: data.access_token, api: data.api_domain || 'https://www.zohoapis.com' };
                }
            }
        } catch (e) {
            // try next domain
        }
    }
    throw new Error('Could not get Zoho token from any domain');
}

// ── Fetch recently modified items (sorted by last_modified_time DESC) ──
async function fetchRecentItems(token, apiDomain, itemCount) {
    const allItems = [];
    let page = 1;
    let hasMore = true;
    const perPage = Math.min(itemCount, 200);

    while (hasMore && allItems.length < itemCount) {
        const url = `${apiDomain}/inventory/v1/items?organization_id=${ORG_ID}&sort_column=last_modified_time&sort_order=D&per_page=${perPage}&page=${page}`;
        const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });

        if (!res.ok) {
            const errText = await res.text();
            if (errText.includes('too many requests')) {
                console.log(`\n⏳ Rate limited on page ${page}, waiting 60s...`);
                await sleep(60000);
                continue; // retry same page
            }
            console.error(`\n❌ Page ${page} failed: ${res.status} ${errText.substring(0, 200)}`);
            break;
        }

        const data = await res.json();
        const items = data.items || [];
        allItems.push(...items);

        hasMore = data.page_context?.has_more_page === true;
        process.stdout.write(`\r   📥 Fetched ${allItems.length} items (page ${page})...`);
        page++;
        await sleep(400);
    }

    console.log(`\n   ✅ Got ${allItems.length} recently modified items`);
    return allItems;
}

// ── Fetch stock per warehouse ──
async function fetchLocations(token, apiDomain, itemId) {
    const url = `${apiDomain}/inventory/v1/items/${itemId}/locationdetails?organization_id=${ORG_ID}`;
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    if (!res.ok) {
        if (res.status === 429) {
            console.log(`\n   ⏳ Rate limited, waiting 30s...`);
            await sleep(30000);
            const retry = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
            if (!retry.ok) return [];
            const data = await retry.json();
            return data.item_location_details?.locations || [];
        }
        return [];
    }
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
    const arg = process.argv[2] || '50';
    const itemCount = arg === 'all' ? 999999 : parseInt(arg, 10);

    console.log('\n🔄 SMART SYNC - Recently Modified Items');
    console.log('═'.repeat(50));
    console.log(`   Mode: ${arg === 'all' ? 'ALL items' : `Last ${itemCount} items (sorted by modification date)`}`);

    // 1. Auth
    console.log('\n1️⃣  Getting Zoho token...');
    const { token, api } = await getToken();
    console.log('   ✅ Token OK');

    // 2. Load warehouses
    console.log('\n2️⃣  Loading warehouses...');
    const { data: warehouses } = await supabase.from('warehouses').select('id, code, name, active, zoho_warehouse_id');
    const whByZohoId = new Map();
    for (const w of warehouses || []) {
        if (w.zoho_warehouse_id) whByZohoId.set(String(w.zoho_warehouse_id), w);
    }
    console.log(`   ✅ ${warehouses?.length || 0} warehouses`);

    // 3. Fetch recent items from Zoho
    console.log('\n3️⃣  Fetching items from Zoho (sorted by recent modification)...');
    const zohoItems = await fetchRecentItems(token, api, itemCount);

    if (zohoItems.length === 0) {
        console.log('\n⚠️  No items returned from Zoho. Check credentials.');
        return;
    }

    // 4. Load ALL existing Supabase items for dedup (paginated to avoid 1000-row limit)
    console.log('\n4️⃣  Loading existing items from Supabase...');
    let existingItems = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
        const { data } = await supabase.from('items').select('id, zoho_item_id, sku').range(from, from + PAGE_SIZE - 1);
        existingItems = existingItems.concat(data || []);
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    const byZohoId = new Map();
    const bySku = new Map();
    for (const item of existingItems) {
        if (item.zoho_item_id) byZohoId.set(item.zoho_item_id, item);
        if (item.sku) bySku.set(item.sku, item);
    }
    console.log(`   ✅ ${existingItems.length} existing items in DB`);

    // 5. Process each item
    console.log('\n5️⃣  Syncing items...\n');

    let synced = 0, created = 0, skipped = 0, errors = 0;
    const errorLog = [];
    const startTime = Date.now();

    for (let i = 0; i < zohoItems.length; i++) {
        const zi = zohoItems[i];
        const zohoItemId = String(zi.item_id);
        const sku = String(zi.sku || '').trim() || `NO-SKU-${zohoItemId}`;
        const name = String(zi.name || '').trim() || sku;

        const pct = ((i / zohoItems.length) * 100).toFixed(1);
        process.stdout.write(
            `\r   [${pct}%] ${i + 1}/${zohoItems.length} | ✅${synced} 🆕${created} ⏭️${skipped} ❌${errors} | ${name.substring(0, 40).padEnd(40)} `
        );

        try {
            // Build metadata
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

            // ── Find or create item (NO DUPLICATES) ──
            let supabaseItemId = byZohoId.get(zohoItemId)?.id || bySku.get(sku)?.id;

            if (supabaseItemId) {
                // Update existing
                const { error } = await supabase.from('items').update(metadata).eq('id', supabaseItemId);
                if (error) { errorLog.push(`${sku}: update: ${error.message}`); errors++; continue; }
                synced++;
            } else {
                // Insert new
                const { data: newItem, error: insErr } = await supabase
                    .from('items')
                    .insert({ ...metadata, stock_total: 0 })
                    .select('id')
                    .single();

                if (insErr) {
                    // Handle SKU conflict
                    const { data: match } = await supabase.from('items').select('id').eq('sku', sku).limit(1);
                    if (match?.[0]) {
                        supabaseItemId = match[0].id;
                        await supabase.from('items').update(metadata).eq('id', supabaseItemId);
                        synced++;
                    } else {
                        errorLog.push(`${sku}: insert: ${insErr.message}`);
                        errors++;
                        continue;
                    }
                } else {
                    supabaseItemId = newItem.id;
                    byZohoId.set(zohoItemId, { id: supabaseItemId });
                    bySku.set(sku, { id: supabaseItemId });
                    created++;
                }
            }

            // ── Fetch stock per warehouse ──
            const locations = await fetchLocations(token, api, zohoItemId);

            let stockTotal = 0;
            const balanceRows = [];
            const nowIso = new Date().toISOString();

            for (const loc of locations) {
                const locId = String(loc.location_id || '');
                const qty = Number(loc.location_stock_on_hand ?? 0);
                const wh = whByZohoId.get(locId);
                if (!wh) continue;

                stockTotal += qty;
                balanceRows.push({
                    item_id: supabaseItemId,
                    warehouse_id: wh.id,
                    qty_on_hand: qty,
                    source: 'smart-sync',
                    source_ts: nowIso,
                    updated_at: nowIso,
                });
            }

            // Update stock_total
            await supabase.from('items').update({ stock_total: stockTotal }).eq('id', supabaseItemId);

            // Replace inventory_balance (delete + insert to avoid dups)
            await supabase.from('inventory_balance').delete().eq('item_id', supabaseItemId);
            if (balanceRows.length > 0) {
                await supabase.from('inventory_balance').insert(balanceRows);
            }

            // Replace snapshots
            await supabase.from('stock_snapshots').delete().eq('item_id', supabaseItemId);
            if (balanceRows.length > 0) {
                const snapshots = balanceRows.map(b => ({
                    warehouse_id: b.warehouse_id,
                    item_id: b.item_id,
                    qty: b.qty_on_hand,
                    source_ts: nowIso,
                    synced_at: nowIso,
                }));
                await supabase.from('stock_snapshots').insert(snapshots);
            }

            // Rate limit protection
            await sleep(400);

        } catch (err) {
            errorLog.push(`${sku}: ${err.message}`);
            errors++;
            await sleep(500);
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('\n\n' + '═'.repeat(50));
    console.log('🎉 SMART SYNC COMPLETE');
    console.log('═'.repeat(50));
    console.log(`   Items checked:     ${zohoItems.length}`);
    console.log(`   Updated:           ${synced}`);
    console.log(`   Created (new):     ${created}`);
    console.log(`   Errors:            ${errors}`);
    console.log(`   Duration:          ${totalTime} min`);

    if (errorLog.length > 0) {
        console.log(`\n❌ Errors (${errorLog.length}):`);
        for (const e of errorLog.slice(0, 20)) console.log(`   - ${e}`);
        if (errorLog.length > 20) console.log(`   ... and ${errorLog.length - 20} more`);
    }

    console.log('\n✅ Done! Stock is up to date.\n');
}

main().catch(err => { console.error('\n💥 Fatal:', err.message); process.exit(1); });
