const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

dotenv.config({ path: '.env.local' });


async function debugSync() {
    console.log("Starting debug sync for 195950086461...");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get Access Token
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const rootUrl = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';

    console.log("Refreshing token...");
    const params = new URLSearchParams();
    params.append('refresh_token', refreshToken);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('redirect_uri', 'http://localhost:3000');
    params.append('grant_type', 'refresh_token');

    const tokenRes = await fetch(`${rootUrl}/oauth/v2/token`, {
        method: 'POST',
        body: params
    });

    if (!tokenRes.ok) {
        console.error("Token refresh failed:", await tokenRes.text());
        return;
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    console.log("Token refreshed.");

    const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

    // 2. Search for the Item by SKU to get ID
    console.log("Searching item by SKU in Zoho...");
    const searchUrl = `https://www.zohoapis.com/inventory/v1/items?organization_id=${orgId}&sku=195950086461`;
    const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });

    if (!searchRes.ok) {
        console.error("Search failed:", await searchRes.text());
        return;
    }

    const searchData = await searchRes.json();
    const items = searchData.items || [];

    if (items.length === 0) {
        console.error("Item NOT FOUND in Zoho with that SKU.");
        return;
    }

    const item = items[0];
    console.log(`Found item: ${item.name} (ID: ${item.item_id})`);

    // 3. Get Details (to verify full data)
    const detailUrl = `https://www.zohoapis.com/inventory/v1/items/${item.item_id}?organization_id=${orgId}`;
    const detailRes = await fetch(detailUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });

    if (!detailRes.ok) {
        console.error("Detail fetch failed:", await detailRes.text());
        return;
    }

    const detailData = await detailRes.json();
    console.log("Item details fetched successfully.");
    console.log("Stock on hand:", detailData.item.stock_on_hand);

    console.log("Done.");
}

debugSync().catch(console.error);
