require('dotenv').config({ path: '.env.local' });

async function auditOrgs() {
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;

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

    const orgsRes = await fetch(apiDomain + '/inventory/v1/organizations', {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });
    const orgsData = await orgsRes.json();

    console.log(`Found ${orgsData.organizations.length} organizations:`);

    for (const o of orgsData.organizations) {
        // Books item count (usually more comprehensive)
        const itemsRes = await fetch(apiDomain + `/books/v3/items?organization_id=${o.organization_id}&page=1&per_page=200`, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
        const itemsData = await itemsRes.json();

        let totalItems = 0;
        if (itemsData.page_context) {
            // Check higher pages to estimate total 
            const resLast = await fetch(apiDomain + `/books/v3/items?organization_id=${o.organization_id}&page=60&per_page=200`, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            });
            const dataLast = await resLast.json();
            const hasMany = (dataLast.items || []).length > 0;

            console.log(`[${o.organization_id}] ${o.name} - Page 1 has ${itemsData.items?.length || 0} items. Page 60 has items? ${hasMany}`);
        } else {
            console.log(`[${o.organization_id}] ${o.name} - Could not fetch item context.`);
        }
    }
}

auditOrgs().catch(console.error);
