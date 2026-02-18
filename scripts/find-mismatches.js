
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findMismatches() {
    console.log('Finding mismatches...');

    const { data: items } = await supabase.from('items').select('id, sku, stock_total').is('zoho_removed_at', null);
    const { data: balances } = await supabase.from('inventory_balance').select('item_id, qty_on_hand');

    const calcStock = new Map();
    for (const b of balances) {
        calcStock.set(b.item_id, (calcStock.get(b.item_id) || 0) + b.qty_on_hand);
    }

    const mismatchedSkus = [];
    for (const item of items) {
        const stored = item.stock_total || 0;
        const calculated = calcStock.get(item.id) || 0;
        if (stored !== calculated) {
            mismatchedSkus.push(item.sku);
        }
    }

    console.log(`Found ${mismatchedSkus.length} mismatches.`);
    fs.writeFileSync('mismatches.json', JSON.stringify(mismatchedSkus));
}

findMismatches().catch(console.error);
