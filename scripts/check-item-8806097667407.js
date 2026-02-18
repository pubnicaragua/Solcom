require('dotenv').config({ path: '.env.local' });

async function checkItem(itemId) {
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

    // Get Auth
    const domains = ['https://accounts.zoho.com', 'https://accounts.zoho.eu', 'https://accounts.zoho.inf'];
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

    if (!auth) { console.log('Auth failed'); return; }

    // Fetch Item Details (for Rate/Price/Stock)
    const itemUrl = `${auth.apiDomain}/inventory/v1/items/${itemId}?organization_id=${orgId}`;
    console.log(`Fetching item details from: ${itemUrl}`);
    const itemRes = await fetch(itemUrl, { headers: { Authorization: `Zoho-oauthtoken ${auth.accessToken}` } });

    if (!itemRes.ok) {
        console.log(`Item fetch failed: ${itemRes.status} ${await itemRes.text()}`);
        return;
    }

    const itemData = await itemRes.json();
    const item = itemData.item;

    console.log('--- Zoho Item Details ---');
    console.log(`Name: ${item.name}`);
    console.log(`SKU: ${item.sku}`);
    console.log(`State (status): ${item.status}`);
    console.log(`Available Stock: ${item.available_stock}`);
    console.log(`Actual Stock (stock_on_hand): ${item.stock_on_hand}`);

    // Fetch Locations (Warehouses)
    const locUrl = `${auth.apiDomain}/inventory/v1/items/${itemId}/locationdetails?organization_id=${orgId}`;
    const locRes = await fetch(locUrl, { headers: { Authorization: `Zoho-oauthtoken ${auth.accessToken}` } });
    if (!locRes.ok) { console.log('Loc error', locRes.status); return; }

    const locData = await locRes.json();
    const locations = locData.item_location_details?.locations || [];

    console.log('\n--- Locations ---');
    let totalCalc = 0;
    locations.forEach(l => {
        const qty = l.location_stock_on_hand;
        totalCalc += qty;
        console.log(`${l.location_name}: ${qty} (ID: ${l.location_id})`);
    });
    console.log(`\nCalculated Total from Locations: ${totalCalc}`);
}

checkItem('5776851000032084733');
