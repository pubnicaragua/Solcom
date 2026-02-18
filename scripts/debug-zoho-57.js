const { getZohoAccessToken } = require('./src/lib/zoho/inventory-utils.ts'); // This won't work directly with TS imports in JS node script without compilation or specialized runner. 
// Instead I'll just write a standalone JS script with the logic.

require('dotenv').config({ path: '.env.local' });

async function getAuth() {
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;

    const response = await fetch(`https://accounts.zoho.com/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
        }),
    });
    const data = await response.json();
    console.log('Token data:', data.access_token ? 'OK' : data);
    return {
        accessToken: data.access_token,
        apiDomain: data.api_domain || 'https://www.zohoapis.com'
    };
}

async function test(orgId) {
    console.log(`\nTesting with Organization ID: '${orgId}'`);
    const { accessToken, apiDomain } = await getAuth();

    // Exact URL that is failing in cron
    const zohoUrl = `${apiDomain}/inventory/v1/items?organization_id=${orgId}&sort_column=last_modified_time&sort_order=D&per_page=15&page=1`;

    console.log('Fetching:', zohoUrl);

    const response = await fetch(zohoUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Body:', text);
}

(async () => {
    // 1. Test with undefined/empty Org ID (Simulate missing env var)
    await test(undefined);

    // 2. Test with Correct Org ID (from .env.local)
    if (process.env.ZOHO_BOOKS_ORGANIZATION_ID) {
        await test(process.env.ZOHO_BOOKS_ORGANIZATION_ID);
    } else {
        console.log('Skipping valid test (no org id in local env)');
    }
})();
