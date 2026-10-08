/**
 * reparar-costos-zoho.js
 * 
 * Lee mismatches_costos.json y actualiza el campo 'price'
 * en la tabla 'items' de Supabase con el costo real de Zoho.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('========================================================');
    console.log('   REPARACIÓN DE COSTOS DE INVENTARIO EN SUPABASE');
    console.log('========================================================\n');

    const jsonPath = path.join(__dirname, '..', 'mismatches_costos.json');
    if (!fs.existsSync(jsonPath)) {
        console.error('❌ No se encontró mismatches_costos.json. Ejecuta primero auditar-costos-zoho.js');
        process.exit(1);
    }

    const itemsToFix = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`Cargados ${itemsToFix.length} artículos a corregir.\n`);

    const BATCH_SIZE = 25;
    let totalUpdated = 0;
    let errors = 0;

    for (let i = 0; i < itemsToFix.length; i += BATCH_SIZE) {
        const batch = itemsToFix.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(itemsToFix.length / BATCH_SIZE);

        process.stdout.write(`\rProcesando lote ${batchNum}/${totalBatches} (${batch.length} items)...`);

        const promises = batch.map(async (item) => {
            const { error } = await supabase
                .from('items')
                .update({
                    price: item.real_unit_cost,
                    updated_at: new Date().toISOString()
                })
                .eq('id', item.id);

            if (error) {
                console.error(`\n❌ Error actualizando SKU ${item.sku}:`, error.message);
                errors++;
            } else {
                totalUpdated++;
            }
        });

        await Promise.all(promises);
        await sleep(100);
    }

    console.log(`\n\n✅ Proceso completado.`);
    console.log(`- Artículos actualizados exitosamente: ${totalUpdated}`);
    console.log(`- Errores encontrados:               ${errors}`);

    // Verificación final del total en Supabase
    console.log('\n--- VERIFICACIÓN FINAL EN BASE DE DATOS ---');
    let allItems = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('items')
            .select('id, stock_total, price')
            .range(from, from + 999);
        if (error) break;
        allItems.push(...(data || []));
        if (!data || data.length < 1000) break;
        from += 1000;
    }

    let newTotalValue = 0;
    let totalStock = 0;
    for (const it of allItems) {
        const s = Number(it.stock_total || 0);
        const p = Number(it.price || 0);
        totalStock += s;
        newTotalValue += s * p;
    }

    console.log(`Total Stock en ERP:       ${totalStock.toLocaleString()} unidades`);
    console.log(`NUEVO VALOR TOTAL EN ERP: $${newTotalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`);
    console.log('Valor oficial Zoho:       $1,782,942.74 USD');
    const diffFinal = Math.abs(newTotalValue - 1782942.74);
    console.log(`Diferencia final:         $${diffFinal.toFixed(2)} USD`);
    console.log('========================================================\n');
}

main().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
