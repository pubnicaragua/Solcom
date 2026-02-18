require('dotenv').config({ path: '.env.local' });

async function getAuth() {
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;

    // Fallback domains
    const domains = [
        'https://accounts.zoho.com',
        'https://accounts.zoho.eu',
        'https://accounts.zoho.in'
    ];

    for (const domain of domains) {
        try {
            const response = await fetch(`${domain}/oauth/v2/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    refresh_token: refreshToken,
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'refresh_token',
                }),
            });

            if (!response.ok) continue;

            const data = await response.json();
            if (data.access_token) {
                return {
                    accessToken: data.access_token,
                    apiDomain: data.api_domain || 'https://www.zohoapis.com'
                };
            }
        } catch (e) { console.error(e); }
    }
    throw new Error("Auth failed locally");
}

async function test(orgId) {
    try {
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
        console.log('Body:', text.substring(0, 500));

        if (response.status === 401 && text.includes('"code":57')) {
            console.log(">>> CONFIRMED: This specific Org ID triggers Code 57 <<<\n");
        }
    } catch (err) {
        console.error("Test failed:", err.message);
    }
}

(async () => {
    // 1. Test with undefined string literal "undefined" (common env error)
    await test("undefined");

    // 2. Test with empty string
    await test("");

    // 3. Test with Correct Org ID (from .env.local)
    if (process.env.ZOHO_BOOKS_ORGANIZATION_ID) {
        await test(process.env.ZOHO_BOOKS_ORGANIZATION_ID);
    } else {
        console.log('Skipping valid test (no org id in local env)');
    }
})();
