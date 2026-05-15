const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const sku = '4894947068317';
    const { data: items } = await supabase.from('items').select('*').eq('sku', sku);
    console.log(`Items with SKU ${sku}:`, items.length);
    items.forEach(item => {
        console.log(`- ID: ${item.id}, Name: ${item.name}, Zoho ID: ${item.zoho_item_id}, Stock: ${item.stock_total}`);
    });
}
check();
