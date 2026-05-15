const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const zohoId = '5776851000018526568';
    const { data: items } = await supabase.from('items').select('*').eq('zoho_item_id', zohoId);
    console.log(`Items with Zoho ID ${zohoId}:`, items.length);
    items.forEach(item => {
        console.log(`- ID: ${item.id}, Name: ${item.name}, SKU: ${item.sku}, Stock: ${item.stock_total}`);
    });
}
check();
