const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// node-fetch dynamic import
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkZoho() {
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const rootUrl = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';
    const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

    // Refresh Token
    const params = new URLSearchParams();
    params.append('refresh_token', refreshToken);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'refresh_token');

    let tokenRes = await fetch(`${rootUrl}/oauth/v2/token`, { method: 'POST', body: params });
    if (!tokenRes.ok) tokenRes = await fetch(`https://accounts.zoho.com/oauth/v2/token`, { method: 'POST', body: params });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    
    // Pick 5 SKUs from mismatches.json
    const skusToCheck = ["6932554464196", "195950667295", "COVER - SAMSUNG S26 ULTRA", "4894947020469", "CAJ-MAMA"];

    console.log("-----------------------------------------------------------------");
    console.log("SKU | ZOHO STOCK | ERP STOCK (items) | ERP CALCULATED (inventory_balance)");
    console.log("-----------------------------------------------------------------");

    for (const sku of skusToCheck) {
        // Zoho
        const searchUrl = `https://www.zohoapis.com/inventory/v1/items?organization_id=${orgId}&sku=${encodeURIComponent(sku)}`;
        const searchRes = await fetch(searchUrl, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
        const searchData = await searchRes.json();
        const items = searchData.items || [];
        
        let zohoStock = 'NOT FOUND';
        if (items.length > 0) {
            zohoStock = items[0].stock_on_hand;
        }

        // Supabase
        const { data: erpItems } = await supabase.from('items').select('id, stock_total').eq('sku', sku);
        let erpStock = 'NOT FOUND';
        let erpCalcStock = 0;
        
        if (erpItems && erpItems.length > 0) {
            erpStock = erpItems[0].stock_total;
            const { data: balances } = await supabase.from('inventory_balance').select('qty_on_hand').eq('item_id', erpItems[0].id);
            for(const b of (balances||[])) erpCalcStock += b.qty_on_hand;
        }
        
        console.log(`${sku} | Zoho: ${zohoStock} | ERP Total: ${erpStock} | ERP Calc: ${erpCalcStock}`);
    }
}
checkZoho().catch(console.error);
