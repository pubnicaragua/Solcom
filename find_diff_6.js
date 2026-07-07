require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const querystring = require('querystring');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = '872034702';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode >= 400) {
                        reject(new Error(`Status ${res.statusCode}: ${data}`));
                    } else {
                        resolve(JSON.parse(data));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        if (options.body) req.write(options.body);
        req.on('error', reject);
        req.end();
    });
}

async function getZohoToken() {
    const postData = querystring.stringify({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN || process.env.ZOHO_BOOKS_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID || process.env.ZOHO_BOOKS_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET || process.env.ZOHO_BOOKS_CLIENT_SECRET,
        grant_type: 'refresh_token'
    });

    const res = await fetchJson('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        },
        body: postData
    });
    return res.access_token;
}

async function getAllZohoItems(token) {
    let allItems = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const res = await fetchJson(`https://www.zohoapis.com/inventory/v1/items?organization_id=${ORG_ID}&page=${page}`, {
            headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
        });
        if (res.items) allItems.push(...res.items);
        hasMore = res.page_context?.has_more_page;
        page++;
    }
    return allItems;
}

async function getAllSupabaseItems() {
    let allItems = [];
    let page = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('items')
            .select('sku, name')
            .range(page * limit, (page + 1) * limit - 1);
        if (error) throw error;
        if (data.length === 0) break;
        allItems.push(...data);
        page++;
    }
    return allItems;
}

async function run() {
    try {
        const token = await getZohoToken();
        const zohoItems = await getAllZohoItems(token);
        const erpItems = await getAllSupabaseItems();
        
        console.log(`Total Zoho Items fetched: ${zohoItems.length}`);
        console.log(`Total ERP Items fetched: ${erpItems.length}`);

        // 1. Items in Zoho with no SKU
        const zohoNoSku = zohoItems.filter(x => !x.sku);
        console.log(`\nItems in Zoho with no SKU (${zohoNoSku.length}):`);
        zohoNoSku.forEach(x => console.log(`- ID: ${x.item_id} | Name: ${x.name}`));

        // 2. Items in ERP but not in Zoho
        const zohoSkuSet = new Set(zohoItems.filter(x => x.sku).map(x => x.sku.trim().toUpperCase()));
        const erpNotInZoho = erpItems.filter(x => !x.sku || !zohoSkuSet.has(x.sku.trim().toUpperCase()));
        console.log(`\nItems in ERP but not matched in Zoho (${erpNotInZoho.length}):`);
        erpNotInZoho.forEach(x => console.log(`- SKU: ${x.sku} | Name: ${x.name}`));

        // 3. Items in Zoho but not in ERP
        const erpSkuSet = new Set(erpItems.filter(x => x.sku).map(x => x.sku.trim().toUpperCase()));
        const zohoNotInErp = zohoItems.filter(x => x.sku && !erpSkuSet.has(x.sku.trim().toUpperCase()));
        console.log(`\nItems in Zoho but not matched in ERP (${zohoNotInErp.length}):`);
        zohoNotInErp.forEach(x => console.log(`- SKU: ${x.sku} | Name: ${x.name}`));

    } catch(e) {
        console.error(e);
    }
}

run();
