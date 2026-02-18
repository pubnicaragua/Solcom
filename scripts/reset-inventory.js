// scripts/reset-inventory.js
// Wipes ALL stock data and resets items to stock_total=0
// Preserves items (with their zoho_item_id) and warehouses
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function wipeTable(name) {
    const { error, count } = await supabase.from(name).delete().neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
    if (error) {
        // Try without count
        const { error: e2 } = await supabase.from(name).delete().gte('created_at', '1970-01-01');
        if (e2) console.log(`  ⚠️  ${name}: ${e2.message}`);
        else console.log(`  ✅ ${name}: cleared`);
    } else {
        console.log(`  ✅ ${name}: cleared`);
    }
}

async function main() {
    console.log('🗑️  INVENTORY RESET - Wiping all stock data...\n');

    // 1. Wipe stock-related tables (order matters for FK)
    const tablesToWipe = [
        'stock_snapshots',
        'inventory_balance',
        'inventory_events',
        'inventory_lots',
        'stock_movements',
    ];

    for (const table of tablesToWipe) {
        await wipeTable(table);
    }

    // 2. Reset all items stock_total to 0
    console.log('\n📦 Resetting items stock_total to 0...');
    const { error: resetError } = await supabase
        .from('items')
        .update({ stock_total: 0, updated_at: new Date().toISOString() })
        .not('id', 'is', null); // update all
    if (resetError) {
        console.log(`  ⚠️  items stock_total reset: ${resetError.message}`);
    } else {
        console.log('  ✅ All items stock_total set to 0');
    }

    // 3. Delete duplicate items (same zoho_item_id)
    console.log('\n🧹 Removing duplicate items...');
    const { data: items } = await supabase
        .from('items')
        .select('id, zoho_item_id, sku, updated_at, stock_total')
        .not('zoho_item_id', 'is', null);

    const groups = {};
    for (const item of items || []) {
        const key = item.zoho_item_id;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    }

    let dupsDeleted = 0;
    for (const [zohoId, group] of Object.entries(groups)) {
        if (group.length <= 1) continue;
        group.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        const toDelete = group.slice(1);
        for (const item of toDelete) {
            await supabase.from('items').delete().eq('id', item.id);
            dupsDeleted++;
        }
    }
    console.log(`  ✅ Deleted ${dupsDeleted} duplicate items`);

    // 4. Count remaining items
    const { data: remaining } = await supabase
        .from('items')
        .select('id')
        .not('zoho_item_id', 'is', null);

    const { data: warehouses } = await supabase
        .from('warehouses')
        .select('id');

    console.log(`\n✅ RESET COMPLETE`);
    console.log(`   Items with zoho_item_id: ${remaining?.length || 0}`);
    console.log(`   Warehouses: ${warehouses?.length || 0}`);
    console.log(`   All stock data: WIPED`);
    console.log(`\n🔄 Now run "Sincronizar Todo" to fetch fresh data from Zoho.`);
}

main().catch(console.error);
