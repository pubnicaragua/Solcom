const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function diagnose() {
    console.log('--- DIAGNOSTICANDO STOCK ACTUAL ---');

    const { data: items } = await supabase.from('items').select('id, name, sku, stock_total').not('stock_total', 'is', null);
    const { data: balances } = await supabase.from('inventory_balance').select('item_id, qty_on_hand, warehouses!inner(active, name)');

    let wrongItems = [];

    for (const item of items) {
        const itemBalances = balances.filter(b => b.item_id === item.id);
        
        // Sum only active warehouses
        let activeSum = 0;
        let totalSum = 0;
        let breakdown = [];

        itemBalances.forEach(b => {
            totalSum += b.qty_on_hand;
            breakdown.push(`${b.warehouses.name} (${b.warehouses.active ? 'Activa' : 'Inactiva'}): ${b.qty_on_hand}`);
            if (b.warehouses.active) {
                activeSum += b.qty_on_hand;
            }
        });

        if (item.stock_total !== activeSum) {
            wrongItems.push({
                sku: item.sku,
                name: item.name,
                stockEnItems: item.stock_total,
                stockActivoReal: activeSum,
                stockTotalReal: totalSum,
                breakdown
            });
        }
    }

    console.log(`\nEncontrados ${wrongItems.length} ítems con discrepancia entre lo que dice la tabla y las bodegas activas.\n`);
    
    // Mostramos los primeros 5 ejemplos
    wrongItems.slice(0, 5).forEach(i => {
        console.log(`Producto: ${i.name} (SKU: ${i.sku})`);
        console.log(`  - El panel dice: ${i.stockEnItems}`);
        console.log(`  - Debería decir (Bodegas Activas): ${i.stockActivoReal}`);
        console.log(`  - Desglose:`);
        i.breakdown.forEach(b => console.log(`      * ${b}`));
        console.log('---');
    });
}
diagnose();
