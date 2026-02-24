require('dotenv').config({ path: '.env.local' });

async function listAllWarehouses() {
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

    const whRes = await fetch(`${apiDomain}/inventory/v1/warehouses?organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });
    const whData = await whRes.json();
    const warehouses = whData.warehouses || [];

    console.log(`--- All Zoho Warehouses (${warehouses.length}) ---`);
    warehouses.forEach(w => {
        console.log(`ID: ${w.warehouse_id} | Name: ${w.warehouse_name} | Status: ${w.status} | Primary: ${w.is_primary}`);
    });

    const search = warehouses.find(w => w.warehouse_name.toLowerCase().includes('solis'));
    if (search) {
        console.log('\n✅ FOUND matches for "solis":');
        warehouses.filter(w => w.warehouse_name.toLowerCase().includes('solis')).forEach(w => {
            console.log(`   - [${w.warehouse_id}] ${w.warehouse_name}`);
        });
    } else {
        console.log('\n❌ No warehouse with "solis" in name found in list.');
    }
}

listAllWarehouses().catch(console.error);
