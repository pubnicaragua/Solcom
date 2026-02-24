require('dotenv').config({ path: '.env.local' });

async function auditSKU() {
    const sku = '6936520885121';
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

    const authRes = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
        }),
    });
    const authData = await authRes.json();
    const accessToken = authData.access_token;
    const apiDomain = authData.api_domain || 'https://www.zohoapis.com';

    // 1. Find Item
    const itemRes = await fetch(`${apiDomain}/inventory/v1/items?sku=${sku}&organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });
    const itemData = await itemRes.json();
    const item = itemData.items[0];

    if (!item) {
        console.log(`❌ SKU ${sku} NOT FOUND in Zoho Inventory.`);
        return;
    }

    console.log(`✅ FOUND: ${item.name} (ID: ${item.item_id})`);
    console.log(`   Listing stock_on_hand: ${item.stock_on_hand}`);

    // 2. Fetch Location Details
    const locRes = await fetch(`${apiDomain}/inventory/v1/items/${item.item_id}/locationdetails?organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });
    const locData = await locRes.json();
    const locations = locData.item_location_details?.locations || [];

    console.log(`\n--- Locations for ${sku} ---`);
    if (locations.length === 0) {
        console.log('No locations returned.');
    } else {
        locations.forEach(l => {
            console.log(`- [${l.location_id}] ${l.location_name} | Stock: ${l.location_stock_on_hand || 0}`);
        });
    }
}

auditSKU().catch(console.error);
