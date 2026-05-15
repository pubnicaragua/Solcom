const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: warehouses } = await supabase.from('warehouses').select('*');
    console.table(warehouses.map(w => ({ id: w.id, name: w.name, active: w.active, zoho: w.zoho_warehouse_id })));
}
check();
