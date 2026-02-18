
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function testToken() {
    console.log('Testing Zoho Token Generation...');
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const domain = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';

    console.log(`Domain: ${domain}`);
    console.log(`Client ID: ${clientId ? 'Set' : 'Missing'}`);
    console.log(`Refresh Token: ${refreshToken ? 'Set' : 'Missing'}`);

    const url = `${domain}/oauth/v2/token`;
    const params = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token'
    });

    try {
        const res = await fetch(url, { method: 'POST', body: params });
        const data = await res.json();
        console.log('Response Status:', res.status);
        console.log('Response Body:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

testToken();
