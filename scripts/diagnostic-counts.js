require('dotenv').config({ path: '.env.local' });

async function compareCounts() {
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

    console.log('--- Diagnosis: Comparing Zoho Books vs Zoho Inventory ---');
    console.log('Org ID:', organizationId);

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

    async function getCount(url) {
        const res = await fetch(url + `?organization_id=${organizationId}&page=1&per_page=1`, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
        const data = await res.json();
        // Some endpoints return total in page_context, but not all. 
        // We'll try to fetch page 60 (200 * 60 = 12,000) to see if it exists.

        console.log(`Checking ${url} ...`);
        if (data.page_context) {
            console.log(`  Page Context for Page 1:`, data.page_context);
        }

        // Check if page 60 has items
        const res60 = await fetch(url + `?organization_id=${organizationId}&page=60&per_page=200`, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
        const data60 = await res60.json();
        const count60 = (data60.items || []).length;
        console.log(`  Items on Page 60 (at 200/page): ${count60}`);
        return count60 > 0;
    }

    await getCount(`${apiDomain}/inventory/v1/items`);
    await getCount(`${apiDomain}/books/v3/items`);
}

compareCounts().catch(console.error);
