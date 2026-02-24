require('dotenv').config({ path: '.env.local' });

async function discoverAllLocations() {
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

    console.log('--- Discovery: Finding All Stock Points ---');

    // 1. Try Branches endpoint
    console.log('Checking /inventory/v1/branches...');
    const branchRes = await fetch(`${apiDomain}/inventory/v1/branches?organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });
    const branchData = await branchRes.json();
    const branches = branchData.branches || [];
    console.log(`Found ${branches.length} branches.`);
    branches.forEach(b => console.log(`  [B] ${b.branch_id}: ${b.branch_name} (${b.status})`));

    // 2. Try Warehouses endpoint
    console.log('\nChecking /inventory/v1/warehouses...');
    const whRes = await fetch(`${apiDomain}/inventory/v1/warehouses?organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });
    const whData = await whRes.json();
    const warehouses = whData.warehouses || [];
    console.log(`Found ${warehouses.length} warehouses.`);

    // 3. Aggregate from a sample item that we know has many locations
    const sku = '6936520885121';
    console.log(`\nAggregating from SKU ${sku} locationdetails...`);
    const itemRes = await fetch(`${apiDomain}/inventory/v1/items?sku=${sku}&organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });
    const itemData = await itemRes.json();
    const item = itemData.items[0];

    if (item) {
        const locRes = await fetch(`${apiDomain}/inventory/v1/items/${item.item_id}/locationdetails?organization_id=${orgId}`, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
        const locData = await locRes.json();
        const locations = locData.item_location_details?.locations || [];
        console.log(`Found ${locations.length} locations in item details.`);

        const uniqueLocs = new Map();
        locations.forEach(l => {
            uniqueLocs.set(String(l.location_id), l.location_name);
        });

        console.log('\n--- UNIQUE LOCATIONS FOUND IN SKU ---');
        uniqueLocs.forEach((name, id) => {
            const isWh = warehouses.some(w => String(w.warehouse_id) === id);
            const isBr = branches.some(b => String(b.branch_id) === id);
            console.log(`- [${id}] ${name} | In Warehouses: ${isWh} | In Branches: ${isBr}`);
        });
    }
}

discoverAllLocations().catch(console.error);
