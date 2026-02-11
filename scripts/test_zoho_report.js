require('dotenv').config({ path: '.env.local' });
const https = require('https');

async function getZohoToken() {
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;

    if (!refreshToken || !clientId || !clientSecret) return null;

    return new Promise((resolve) => {
        const postData = new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
        }).toString();

        const req = https.request('https://accounts.zoho.com/oauth/v2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: postData
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error('Token Error:', res.statusCode, data);
                    resolve(null);
                    return;
                }
                try {
                    resolve(JSON.parse(data).access_token);
                } catch (e) {
                    console.error('JSON Parse Error:', e);
                    resolve(null);
                }
            });
        });
        req.end();
    });
}

async function fetchReport(token) {
    const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    // Requesting inventoryvaluation
    const url = `https://www.zohoapis.com/books/v3/reports/inventoryvaluation?organization_id=${orgId}&page=1&per_page=200`;

    console.log('Consultando inventoryvaluation...');

    return new Promise((resolve) => {
        const req = https.request(url, {
            method: 'GET',
            headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const json = JSON.parse(data);
                if (json.inventory_valuation) {
                    console.log('Items found:', json.inventory_valuation.length);

                    // Flatten all items from groups
                    let allItems = [];
                    json.inventory_valuation.forEach(group => {
                        if (group.item_details) allItems.push(...group.item_details);
                    });

                    console.log('Total items in page 1:', allItems.length);

                    // Find item with category
                    const itemWithCat = allItems.find(i => i.category_id || i.category_name);
                    if (itemWithCat) {
                        console.log('Found item with category:', JSON.stringify(itemWithCat, null, 2));
                    } else {
                        console.log('No item with category info found in page 1.');
                        console.log('Sample item:', JSON.stringify(allItems[0], null, 2));
                    }

                    // Check keys generally
                    if (allItems.length > 0) {
                        console.log('All Keys on first item:', Object.keys(allItems[0]));
                    }
                } else {
                    console.log('No inventory_valuation field:', Object.keys(json));
                }
                resolve();
            });
        });
        req.end();
    });
}

(async () => {
    const token = await getZohoToken();
    if (token) await fetchReport(token);
})();
