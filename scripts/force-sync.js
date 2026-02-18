
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

// Load env vars
dotenv.config({ path: '.env.local' });

// We need to import the sync logic. But since it's TS, we'll inline a simplified version
// or use ts-node? simpler to just fetch the API manually using the token.
// Actually, let's just make a script that calls the Zoho API and updates Supabase directly using the same logic as the cron/route.
// Wait, I can use the same logic as stress-test-zoho to get a token, then fetch item details, then update supabase.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getZohoAccessToken() {
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const authDomain = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';

    const response = await fetch(`${authDomain}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
        }),
    });

    if (!response.ok) throw new Error(`Token fetch failed: ${await response.text()}`);
    const data = await response.json();
    return { accessToken: data.access_token, apiDomain: data.api_domain };
}

async function forceSyncItem(sku) {
    console.log(`Force syncing SKU: ${sku}`);

    // 1. Get Item ID from Supabase
    const { data: items } = await supabase.from('items').select('zoho_item_id, id').eq('sku', sku).single();
    if (!items) { console.error('Item not found in Supabase'); return; }

    const zohoItemId = items.zoho_item_id;
    console.log(`Zoho ID: ${zohoItemId}`);

    // 2. Get Auth
    const auth = await getZohoAccessToken();
    const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

    // 3. Fetch Item Details (for stock_on_hand)
    const itemUrl = `${auth.apiDomain}/inventory/v1/items/${zohoItemId}?organization_id=${orgId}`;
    const itemRes = await fetch(itemUrl, { headers: { Authorization: `Zoho-oauthtoken ${auth.accessToken}` } });
    const itemData = await itemRes.json();

    // 4. Fetch Locations
    // This is the CRITICAL part.
    // Sync logic uses: /inventory/v1/items/{id}/locationdetails?organization_id={orgId}
    // NOT just item details.

    // Wait, let's verify if locationdetails endpoint works.
    // If not, that's why we have no balance.

    // However, I want to use the existing `sync-logic.ts`? No, I can't run TS directly easily properly without ts-node setup which might be flaky.
    // I will rewrite the essential sync logic here in JS.

    console.log('Fetching locations...');
    // We need to implement the fetchItemLocations logic.
    // Actually, let's try to just use the cron logic but targeting one item?
    // No, cron logic is complex.

    // Let's implement minimal sync:
    // 1. Get locations from Zoho.
    // 2. Map warehouses.
    // 3. Insert into inventory_balance.

    // Warehouse Map
    const { data: warehouses } = await supabase.from('warehouses').select('id, zoho_warehouse_id');
    const whMap = new Map();
    warehouses.forEach(w => {
        if (w.zoho_warehouse_id) whMap.set(String(w.zoho_warehouse_id), w.id);
    });

    // Fetch Locations (using utility function logic)
    const locUrl = `${auth.apiDomain}/inventory/v1/items/${zohoItemId}/locationdetails?organization_id=${orgId}`;
    const locRes = await fetch(locUrl, { headers: { Authorization: `Zoho-oauthtoken ${auth.accessToken}` } });

    if (!locRes.ok) {
        console.error('Location fetch failed:', await locRes.text());
        return;
    }

    const locData = await locRes.json();
    const locations = (locData.item_location_details && locData.item_location_details.locations) || [];

    console.log(`Found ${locations.length} locations.`);

    let stockTotal = 0;
    for (const loc of locations) {
        const qty = loc.location_stock_on_hand ?? loc.location_available_stock;
        stockTotal += qty;

        const whId = whMap.get(String(loc.location_id));
        if (whId) {
            console.log(`  -> Syncing ${qty} to warehouse ${whId}`);
            const { error } = await supabase.from('inventory_balance').upsert({
                item_id: items.id,
                warehouse_id: whId,
                qty_on_hand: qty,
                updated_at: new Date().toISOString()
            }, { onConflict: 'item_id, warehouse_id' });

            if (error) console.error('  Upsert error:', error);
        } else {
            console.warn(`  Warning: Unknown warehouse ID ${loc.location_id}`);
        }
    }

    console.log(`Total calculated stock: ${stockTotal}`);

    // Update item stock_total
    await supabase.from('items').update({ stock_total: stockTotal }).eq('id', items.id);
    console.log('Item stock_total updated.');
}

const sku = process.argv[2];
if (!sku) console.error('Please provide SKU');
else forceSyncItem(sku).catch(console.error);
