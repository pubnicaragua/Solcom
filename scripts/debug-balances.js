const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const itemId = 'af33b80c-d80b-4dc7-969d-b6d12d170e18';
    const { data: balances } = await supabase
        .from('inventory_balance')
        .select(`*, warehouses ( name, active )`)
        .eq('item_id', itemId);

    console.log(`Balances for Item ID ${itemId}:`);
    balances.forEach(b => {
        console.log(`- Warehouse: ${b.warehouses?.name} (${b.warehouses?.active ? 'Active' : 'Inactive'}), Qty: ${b.qty_on_hand}`);
    });
}
check();
