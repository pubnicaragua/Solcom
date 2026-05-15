const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: analytics, error } = await supabase.rpc('get_restock_analytics', { p_weeks: 4 });
    if (error) {
        console.error(error);
        return;
    }
    const item = analytics.find(a => a.sku === '8806097074397');
    console.log("Analytics data for SKU 8806097074397:");
    console.log(item);
}
check();
