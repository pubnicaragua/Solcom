require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateSkus() {
  const updates = [
    // 1TB variants from user screenshot
    {
      zoho_item_id: '5776851000040152962',
      old_sku: '8806097896548',
      new_sku: '8806097896548-(12M)',
      name: 'SAMSUNG GALAXY S26 ULTRA 5G (1TB_16GB RAM) DS',
      color: 'WHITE'
    },
    {
      zoho_item_id: '5776851000040154032',
      old_sku: '8806097896739',
      new_sku: '8806097896739-(12M)',
      name: 'SAMSUNG GALAXY S26 ULTRA 5G (1TB_16GB RAM) DS',
      color: 'VIOLETA'
    },
    {
      zoho_item_id: '5776851000040154102',
      old_sku: '8806097896920',
      new_sku: '8806097896920-(24M)',
      name: 'SAMSUNG GALAXY S26 ULTRA 5G (1TB_16GB RAM) DS',
      color: 'BLACK'
    },
    // Also update other S26 Ultra variants that have warranty suffixes in Zoho
    {
      zoho_item_id: '5776851000040152542',
      old_sku: '8806097896654',
      new_sku: '8806097896654-(24M)',
      name: 'SAMSUNG GALAXY S26 ULTRA 5G (512GB/12GB RAM) DS',
      color: 'BLACK'
    },
    {
      zoho_item_id: '5776851000040152402',
      old_sku: '8806097896821',
      new_sku: '8806097896821-(24M)',
      name: 'SAMSUNG GALAXY S26 ULTRA 5G (512GB/12GB RAM) DS',
      color: 'VIOLETA'
    },
    {
      zoho_item_id: '5776851000040152332',
      old_sku: '8806097896449',
      new_sku: '8806097896449-(24M)',
      name: 'SAMSUNG GALAXY S26 ULTRA 5G (512GB/12GB RAM) DS',
      color: 'WHITE'
    },
    {
      zoho_item_id: '5776851000040152472',
      old_sku: '8806097897026',
      new_sku: '8806097897026-(24M)',
      name: 'SAMSUNG GALAXY S26 ULTRA 5G (512GB/12GB RAM) DS',
      color: 'LIGHT BLUE'
    },
    {
      zoho_item_id: '5776851000040152682',
      old_sku: '8806097896869',
      new_sku: '8806097896869-(24M)',
      name: 'SAMSUNG GALAXY S26 ULTRA 5G (256GB/12GB RAM) DS',
      color: 'WHITE'
    },
    {
      zoho_item_id: '5776851000040152612',
      old_sku: '8806097897040',
      new_sku: '8806097897040-(24M)',
      name: 'SAMSUNG GALAXY S26 ULTRA 5G (256GB/12GB RAM) DS',
      color: 'LIGHT BLUE'
    },
    {
      zoho_item_id: '5776851000040152752',
      old_sku: '8806097896487',
      new_sku: '8806097896487-(24M)',
      name: 'SAMSUNG GALAXY S26 ULTRA 5G (256GB/12GB RAM) DS',
      color: 'VIOLETA'
    },
    {
      zoho_item_id: '5776851000040152822',
      old_sku: '8806097896678',
      new_sku: '8806097896678-(24M)',
      name: 'SAMSUNG GALAXY S26 ULTRA 5G (256GB/12GB RAM) DS',
      color: 'BLACK'
    }
  ];

  console.log(`Actualizando ${updates.length} SKUs en la tabla items...`);

  for (const u of updates) {
    const { data, error } = await supabase
      .from('items')
      .update({ sku: u.new_sku, updated_at: new Date().toISOString() })
      .eq('zoho_item_id', u.zoho_item_id)
      .select('id, name, sku, zoho_item_id');

    if (error) {
      console.error(`❌ Error actualizando ${u.old_sku} -> ${u.new_sku}:`, error.message);
    } else if (!data || data.length === 0) {
      console.warn(`⚠️ No se encontró item con zoho_item_id ${u.zoho_item_id}`);
    } else {
      console.log(`✅ ${u.name} [${u.color}]: ${u.old_sku} -> ${data[0].sku}`);
    }
  }

  console.log('Finalizado.');
}

updateSkus().catch(console.error);
