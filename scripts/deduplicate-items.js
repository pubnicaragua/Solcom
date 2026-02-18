// scripts/deduplicate-items.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('🔍 Fetching all items with zoho_item_id...');

    // 1. Fetch all items
    const { data: items, error } = await supabase
        .from('items')
        .select('id, zoho_item_id, sku, name, updated_at, created_at, stock_total')
        .not('zoho_item_id', 'is', null);

    if (error) {
        console.error('Error fetching items:', error);
        return;
    }

    console.log(`Found ${items.length} items total.`);

    // 2. Group by zoho_item_id
    const groups = {};
    for (const item of items) {
        const key = item.zoho_item_id;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    }

    // 3. Identify duplicates
    const duplicates = Object.values(groups).filter(g => g.length > 1);
    console.log(`Found ${duplicates.length} groups with duplicates.`);

    if (duplicates.length === 0) {
        console.log('✅ No duplicates found.');
        return;
    }

    let deletedCount = 0;

    for (const group of duplicates) {
        const zohoId = group[0].zoho_item_id;

        // Sort by updated_at desc (keep the most recently touched)
        // Secondary sort by stock_total desc (prefer one with stock info known)
        group.sort((a, b) => {
            const timeA = new Date(a.updated_at).getTime();
            const timeB = new Date(b.updated_at).getTime();
            if (timeA !== timeB) return timeB - timeA;
            return (b.stock_total || 0) - (a.stock_total || 0);
        });

        const keeper = group[0];
        const toDelete = group.slice(1);

        console.log(`\nGroup ${zohoId}: Keeping ${keeper.id} (${keeper.sku}), Deleting ${toDelete.length} items.`);

        for (const item of toDelete) {
            // Delete related rows first just in case cascading isn't set up
            await supabase.from('stock_snapshots').delete().eq('item_id', item.id);
            await supabase.from('inventory_balance').delete().eq('item_id', item.id);

            // Delete the item
            const { error: delError } = await supabase.from('items').delete().eq('id', item.id);
            if (delError) {
                console.error(`  ❌ Failed to delete ${item.id}: ${delError.message}`);
                // If failed due to FK, we might need to find other tables
            } else {
                console.log(`  ✅ Deleted ${item.id}`);
                deletedCount++;
            }
        }
    }

    console.log(`\n🎉 Cleanup complete. Deleted ${deletedCount} duplicate items.`);
}

main().catch(console.error);
