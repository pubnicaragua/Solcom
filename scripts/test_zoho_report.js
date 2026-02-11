require('dotenv').config({ path: '.env.local' });
const https = require('https');

async function getZohoToken() {
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;

    if (!refreshToken || !clientId || !clientSecret) {
        console.error('Faltan credenciales en .env.local');
        return null;
    }

    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
        }).toString();

        const req = https.request('https://accounts.zoho.com/oauth/v2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const json = JSON.parse(data);
                if (json.access_token) resolve(json.access_token);
                else {
                    console.error('Error obteniendo token:', json);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => resolve(null));
        req.write(postData);
        req.end();
    });
}

async function fetchReport(token, reportType) {
    const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    const url = `https://www.zohoapis.com/books/v3/reports/${reportType}?organization_id=${orgId}`;

    console.log(`Consultando reporte: ${reportType}...`);

    return new Promise((resolve) => {
        const req = https.request(url, {
            method: 'GET',
            headers: {
                'Authorization': `Zoho-oauthtoken ${token}`
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`--- Respuesta para ${reportType} ---`);
                    console.log('Root Keys:', Object.keys(json));
                    if (json.page_context) console.log('Page Context:', json.page_context);

                    if (json.inventory_valuation) {
                        console.log('Entries:', json.inventory_valuation.length);
                        if (json.inventory_valuation.length > 0) {
                            console.log('First Entry Keys:', Object.keys(json.inventory_valuation[0]));
                        }
                    }
                    resolve(json);
                } catch (e) {
                    console.error('Error parseando JSON:', e);
                    console.log('Raw:', data);
                    resolve(null);
                }
            });
        });
        req.end();
    });
}

(async () => {
    const token = await getZohoToken();
    if (token) {
        // Try Inventory Valuation
        // Try Inventory Summary
        await fetchReport(token, 'inventorysummary');
        // Try Inventory Summary logic ? Zoho Books doesn't have "inventorysummary" typically, 
        // but let's try 'inventoryvaluation' first as it matches the screenshot title.
    }
})();
