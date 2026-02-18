
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDiscrepancies() {
    console.log('--- Checking Stock Discrepancies ---');

    // 1. Fetch all items
    const { data: items, error: itemsError } = await supabase
        .from('items')
        .select('id, sku, name, stock_total, zoho_item_id')
        .is('zoho_removed_at', null);

    if (itemsError) throw itemsError;

    // 2. Fetch all inventory balances
    const { data: balances, error: balanceError } = await supabase
        .from('inventory_balance')
        .select('item_id, qty_on_hand');

    if (balanceError) throw balanceError;

    // 3. Aggregate balances by item
    const calcStock = new Map();
    for (const b of balances) {
        const current = calcStock.get(b.item_id) || 0;
        calcStock.set(b.item_id, current + b.qty_on_hand);
    }

    // 4. Compare
    let diffCount = 0;
    let totalStockItems = 0;
    let totalStockCalc = 0;

    console.log(`Checking ${items.length} items...`);

    for (const item of items) {
        const stored = item.stock_total || 0;
        const calculated = calcStock.get(item.id) || 0;

        totalStockItems += stored;
        totalStockCalc += calculated;

        if (stored !== calculated) {
            diffCount++;
            console.log(`FAIL: [${item.sku}] ${item.name}`);
            console.log(`  Items.stock_total: ${stored}`);
            console.log(`  Sum(inventory_balance): ${calculated}`);
            console.log(`  Diff: ${stored - calculated}`);
            console.log('---');
        }
    }

    console.log('\n--- Summary ---');
    console.log(`Items with discrepancies: ${diffCount}`);
    console.log(`Total Stock (Items Table): ${totalStockItems}`);
    console.log(`Total Stock (Calculated): ${totalStockCalc}`);
    console.log(`Difference: ${totalStockItems - totalStockCalc}`);
}

checkDiscrepancies().catch(console.error);
