require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function deduplicateSnapshots(snapshots) {
    const map = new Map();
    snapshots.forEach(s => {
        const key = `${s.item_id || ''}_${s.warehouse_id || ''}`;
        const existing = map.get(key);
        if (!existing || new Date(s.synced_at) > new Date(existing.synced_at)) {
            map.set(key, s);
        }
    });
    return Array.from(map.values());
}

async function verify() {
    console.log('=== Verificación con DEDUPLICACIÓN ===\n');

    // Fetch all snapshots
    const allSnapshots = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('stock_snapshots')
            .select('qty, synced_at, item_id, warehouse_id, items(id, category, marca, name, sku, stock_total), warehouses(id, code)')
            .range(from, from + pageSize - 1);

        if (error) { console.error('Error:', error.message); return; }
        allSnapshots.push(...(data || []));
        hasMore = (data || []).length === pageSize;
        from += pageSize;
    }

    console.log(`Total snapshots (raw): ${allSnapshots.length}`);

    const deduped = deduplicateSnapshots(allSnapshots);
    console.log(`Total snapshots (deduplicated): ${deduped.length}\n`);

    // Category breakdown (deduplicated)
    const categoryBreakdown = {};
    deduped.forEach(s => {
        if (s.items) {
            const cat = s.items.category || 'Sin categoría';
            categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + s.qty;
        }
    });

    const sortedCats = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]);
    console.log('--- INVENTARIO POR CATEGORÍAS (Unids) - DEDUPLICADO ---');
    sortedCats.forEach(([cat, qty]) => {
        console.log(`  ${cat}: ${qty}`);
    });
    console.log(`  TOTAL: ${sortedCats.reduce((s, [, q]) => s + q, 0)}`);

    console.log('');

    // Brand breakdown (deduplicated)
    const brandBreakdown = {};
    deduped.forEach(s => {
        if (s.items) {
            const marca = s.items.marca || 'Sin marca';
            brandBreakdown[marca] = (brandBreakdown[marca] || 0) + s.qty;
        }
    });

    const sortedBrands = Object.entries(brandBreakdown).sort((a, b) => b[1] - a[1]);
    console.log('--- TOP INVENTARIO POR MARCA (Unids) - DEDUPLICADO ---');
    sortedBrands.slice(0, 10).forEach(([brand, qty]) => {
        console.log(`  ${brand}: ${qty}`);
    });
    console.log(`  TOTAL (todas): ${sortedBrands.reduce((s, [, q]) => s + q, 0)}`);

    // Also compare with items.stock_total
    console.log('\n--- COMPARACIÓN CON items.stock_total ---');
    const { data: itemsData } = await supabase.from('items').select('category, marca, stock_total');

    const catFromItems = {};
    const brandFromItems = {};
    (itemsData || []).forEach(item => {
        const cat = item.category || 'Sin categoría';
        catFromItems[cat] = (catFromItems[cat] || 0) + (Number(item.stock_total) || 0);
        const marca = item.marca || 'Sin marca';
        brandFromItems[marca] = (brandFromItems[marca] || 0) + (Number(item.stock_total) || 0);
    });

    console.log('\nCategorías (desde items.stock_total):');
    Object.entries(catFromItems).sort((a, b) => b[1] - a[1]).forEach(([cat, qty]) => {
        console.log(`  ${cat}: ${qty}`);
    });

    console.log('\nMarcas (desde items.stock_total, top 10):');
    Object.entries(brandFromItems).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([brand, qty]) => {
        console.log(`  ${brand}: ${qty}`);
    });
}

verify().catch(console.error);
