
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SKU = 'INF-EL-TT';

async function inspectItem() {
    console.log(`--- Inspecting Item: ${SKU} ---`);

    // 1. Get Item
    const { data: items } = await supabase
        .from('items')
        .select('*')
        .eq('sku', SKU);

    if (!items || items.length === 0) {
        console.log('Item not found!');
        return;
    }

    const item = items[0];
    console.log(`[Item] ID: ${item.id}`);
    console.log(`[Item] Name: ${item.name}`);
    console.log(`[Item] Stock Total: ${item.stock_total}`);
    console.log(`[Item] Zoho Item ID: ${item.zoho_item_id}`);
    console.log(`[Item] Updated At: ${item.updated_at}`);

    // 2. Get Inventory Balance
    const { data: balances } = await supabase
        .from('inventory_balance')
        .select(`
            *,
            warehouses ( name, code )
        `)
        .eq('item_id', item.id);

    console.log(`\n[Inventory Balance] Count: ${balances.length}`);
    let balSum = 0;
    balances.forEach(b => {
        console.log(`  - Warehouse: ${b.warehouses?.name} (${b.warehouse_id}) | Qty: ${b.qty_on_hand}`);
        balSum += b.qty_on_hand;
    });
    console.log(`  > Balance Sum: ${balSum}`);

    // 3. Get Snapshots (Legacy/Backup)
    const { data: snapshots } = await supabase
        .from('stock_snapshots')
        .select('*')
        .eq('item_id', item.id)
        .order('synced_at', { ascending: false })
        .limit(5);

    console.log(`\n[Recent Snapshots] Count: ${snapshots.length}`);
    snapshots.forEach(s => {
        console.log(`  - Warehouse: ${s.warehouse_id} | Qty: ${s.qty} | Synced: ${s.synced_at}`);
    });
}

inspectItem().catch(console.error);
