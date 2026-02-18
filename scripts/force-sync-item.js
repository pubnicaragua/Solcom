const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function forceSyncItem(itemId) {
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) { console.error('Missing Supabase config'); return; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- 1. Get Auth ---
    const domains = ['https://accounts.zoho.com', 'https://accounts.zoho.eu', 'https://accounts.zoho.in'];
    let auth = null;
    for (const d of domains) {
        try {
            const res = await fetch(`${d}/oauth/v2/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.access_token) {
                    auth = { accessToken: data.access_token, apiDomain: data.api_domain || 'https://www.zohoapis.com' };
                    break;
                }
            }
        } catch (e) { }
    }

    if (!auth) { console.error('Auth failed'); return; }
    console.log('Zoho Auth OK');

    // --- 2. Fetch Zoho Data ---
    // Item Details
    const itemUrl = `${auth.apiDomain}/inventory/v1/items/${itemId}?organization_id=${orgId}`;
    const itemRes = await fetch(itemUrl, { headers: { Authorization: `Zoho-oauthtoken ${auth.accessToken}` } });
    if (!itemRes.ok) { console.error('Item fetch failed', itemRes.status); return; }
    const itemData = await itemRes.json();
    const zohoItem = itemData.item;

    // Locations
    const locUrl = `${auth.apiDomain}/inventory/v1/items/${itemId}/locationdetails?organization_id=${orgId}`;
    const locRes = await fetch(locUrl, { headers: { Authorization: `Zoho-oauthtoken ${auth.accessToken}` } });
    if (!locRes.ok) { console.error('Loc fetch failed', locRes.status); return; }
    const locData = await locRes.json();
    const locations = locData.item_location_details?.locations || [];

    console.log(`Fetched ${zohoItem.name} (${zohoItem.sku}). Stock: ${zohoItem.stock_on_hand}`);

    // --- 3. Update Supabase ---

    // Find Item in DB
    let { data: items } = await supabase.from('items').select('id').eq('zoho_item_id', itemId);
    let supabaseItemId = items?.[0]?.id;

    if (!supabaseItemId) {
        console.error('Item not found in Supabase by zoho_item_id');
        return;
    }

    // Map Warehouses
    const { data: warehouses } = await supabase.from('warehouses').select('id, zoho_warehouse_id');
    const warehouseMap = new Map();
    warehouses.forEach(w => {
        if (w.zoho_warehouse_id) warehouseMap.set(String(w.zoho_warehouse_id), w.id);
    });

    // Calculate Stock & Snapshots
    let stockTotal = 0;
    const snapshots = [];

    for (const loc of locations) {
        const whId = warehouseMap.get(String(loc.location_id));
        const qty = Number(loc.location_stock_on_hand);

        if (whId) {
            stockTotal += qty;
            snapshots.push({
                warehouse_id: whId,
                item_id: supabaseItemId,
                qty: qty,
                synced_at: new Date().toISOString()
            });
        }
    }

    // Fallback if no locations mapped but stock exists?
    if (snapshots.length === 0 && Number(zohoItem.stock_on_hand) > 0) {
        console.log('Warning: No mapped locations found for stock!');
    }

    console.log(`Calculated Stock Total: ${stockTotal}`);

    // Update Item
    await supabase.from('items').update({
        stock_total: stockTotal,
        updated_at: new Date().toISOString()
    }).eq('id', supabaseItemId);
    console.log('Updated items table');

    // Replace Snapshots
    await supabase.from('stock_snapshots').delete().eq('item_id', supabaseItemId);
    if (snapshots.length > 0) {
        await supabase.from('stock_snapshots').insert(snapshots);
    }
    console.log(`Inserted ${snapshots.length} snapshots`);

    // Replace Inventory Balance (optional but good for consistency)
    const balanceRows = snapshots.map(s => ({
        item_id: s.item_id,
        warehouse_id: s.warehouse_id,
        qty_on_hand: s.qty,
        source: 'manual_fix',
        updated_at: new Date().toISOString()
    }));

    // Delete old balance
    // This is tricky because inventory_balance uses composite key (item_id, warehouse_id) usually?
    // Let's just delete by item_id
    await supabase.from('inventory_balance').delete().eq('item_id', supabaseItemId);
    if (balanceRows.length > 0) {
        await supabase.from('inventory_balance').insert(balanceRows);
    }
    console.log(`Inserted ${balanceRows.length} balance rows`);

    console.log('--- DONE ---');
}

forceSyncItem('5776851000032084733');
