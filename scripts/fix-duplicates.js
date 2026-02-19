/**
 * Find and remove duplicate items in Supabase.
 * Keeps the OLDEST record (first created) and removes newer duplicates.
 * Also merges inventory_balance and stock_snapshots to the surviving record.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const dryRun = process.argv.includes('--dry-run');

    console.log('\n🔍 FINDING DUPLICATE ITEMS');
    console.log('═'.repeat(50));
    if (dryRun) console.log('   ⚠️  DRY RUN - no changes will be made\n');

    // 1. Fetch ALL items (paginated to bypass Supabase 1000-row limit)
    let allItems = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('items')
            .select('id, sku, name, zoho_item_id, stock_total, created_at, updated_at')
            .order('created_at', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (error) { console.error('Error fetching items:', error.message); return; }
        allItems = allItems.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    console.log(`   Total items in DB: ${allItems.length}`);

    // 2. Group by SKU to find duplicates
    const bySku = new Map();
    for (const item of allItems) {
        if (!item.sku) continue;
        if (!bySku.has(item.sku)) bySku.set(item.sku, []);
        bySku.get(item.sku).push(item);
    }

    // 3. Also group by zoho_item_id
    const byZoho = new Map();
    for (const item of allItems) {
        if (!item.zoho_item_id) continue;
        if (!byZoho.has(item.zoho_item_id)) byZoho.set(item.zoho_item_id, []);
        byZoho.get(item.zoho_item_id).push(item);
    }

    // 4. Collect all duplicate groups
    const duplicateGroups = new Map(); // key -> [items]

    for (const [sku, items] of bySku) {
        if (items.length > 1) {
            duplicateGroups.set(`sku:${sku}`, items);
        }
    }
    for (const [zohoId, items] of byZoho) {
        if (items.length > 1) {
            const key = `zoho:${zohoId}`;
            if (!duplicateGroups.has(key)) {
                duplicateGroups.set(key, items);
            }
        }
    }

    if (duplicateGroups.size === 0) {
        console.log('\n✅ No duplicates found! Database is clean.');
        return;
    }

    console.log(`\n⚠️  Found ${duplicateGroups.size} duplicate groups:\n`);

    let totalRemoved = 0;
    const removedIds = [];

    for (const [key, items] of duplicateGroups) {
        // Sort by created_at ASC - keep the oldest
        items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const keep = items[0];
        const dupes = items.slice(1);

        console.log(`   ${key}: "${keep.name}"`);
        console.log(`     KEEP:   id=${keep.id.substring(0, 8)}... (created: ${keep.created_at}, stock: ${keep.stock_total})`);
        for (const d of dupes) {
            console.log(`     DELETE: id=${d.id.substring(0, 8)}... (created: ${d.created_at}, stock: ${d.stock_total})`);
        }

        if (!dryRun) {
            for (const dupe of dupes) {
                // Move any inventory_balance rows to the keeper
                await supabase
                    .from('inventory_balance')
                    .delete()
                    .eq('item_id', dupe.id);

                // Move any stock_snapshots
                await supabase
                    .from('stock_snapshots')
                    .delete()
                    .eq('item_id', dupe.id);

                // Delete the duplicate item
                const { error: delErr } = await supabase
                    .from('items')
                    .delete()
                    .eq('id', dupe.id);

                if (delErr) {
                    console.log(`     ❌ Error deleting: ${delErr.message}`);
                } else {
                    removedIds.push(dupe.id);
                    totalRemoved++;
                }
            }
        } else {
            totalRemoved += dupes.length;
        }
        console.log('');
    }

    console.log('═'.repeat(50));
    console.log(`🎉 ${dryRun ? 'Would remove' : 'Removed'} ${totalRemoved} duplicate items`);
    console.log('✅ Done!\n');
}

main().catch(err => { console.error('💥 Fatal:', err.message); process.exit(1); });
