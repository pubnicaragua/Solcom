const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function dryRunWarehouses() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    console.log('🔄 Autenticando con Zoho...');
    const authRes = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: process.env.ZOHO_BOOKS_REFRESH_TOKEN,
            client_id: process.env.ZOHO_BOOKS_CLIENT_ID,
            client_secret: process.env.ZOHO_BOOKS_CLIENT_SECRET,
            grant_type: 'refresh_token',
        }),
    });
    const auth = await authRes.json();
    const accessToken = auth.access_token;
    const apiDomain = auth.api_domain || 'https://www.zohoapis.com';
    const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    const headers = { Authorization: `Zoho-oauthtoken ${accessToken}` };

    console.log('📥 Obteniendo datos actuales de Supabase...');
    const { data: localWarehouses } = await supabase.from('warehouses').select('*');
    const localMap = new Map(localWarehouses.map(w => [String(w.zoho_warehouse_id), w]));

    // Use locationdetails as the REAL source of truth
    console.log('📥 Obteniendo ubicaciones reales desde Zoho (locationdetails)...');
    const itemRes = await fetch(`${apiDomain}/inventory/v1/items?organization_id=${orgId}&page=1&per_page=1`, { headers });
    const itemData = await itemRes.json();
    const sampleItemId = itemData.items?.[0]?.item_id;

    if (!sampleItemId) {
        console.error('No se encontraron items para consultar ubicaciones.');
        return;
    }

    const locRes = await fetch(`${apiDomain}/inventory/v1/items/${sampleItemId}/locationdetails?organization_id=${orgId}`, { headers });
    const locData = await locRes.json();
    const locations = locData.item_location_details?.locations || [];

    console.log(`✅ ${locations.length} ubicaciones obtenidas.\n`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SIMULACIÓN (DRY RUN) — NO se harán cambios en Supabase');
    console.log('═══════════════════════════════════════════════════════════════\n');

    let totalChanges = 0;

    for (const loc of locations) {
        const id = String(loc.location_id);
        const newName = String(loc.location_name || '');
        const newIsActive = loc.status === 'active';

        const local = localMap.get(id);

        if (!local) {
            console.log(`✨ NUEVA: [${id}] "${newName}" (${newIsActive ? 'Activa' : 'Inactiva'})`);
            totalChanges++;
            continue;
        }

        let changes = [];

        if (local.name !== newName) {
            changes.push(`  📝 Nombre: "${local.name}" → "${newName}"`);
        }

        if (local.active !== newIsActive) {
            changes.push(`  ⚡ Status: ${local.active ? '🟢 Activa' : '🔴 Inactiva'} → ${newIsActive ? '🟢 Activa' : '🔴 Inactiva'}`);
        }

        if (changes.length > 0) {
            console.log(`📦 [${id}]`);
            changes.forEach(c => console.log(c));
            console.log('');
            totalChanges++;
        }
    }

    if (totalChanges === 0) {
        console.log('✅ Todo sincronizado. No hay cambios pendientes.');
    } else {
        console.log(`\n⚠️  ${totalChanges} cambios pendientes.`);
        console.log('   Ejecuta: node scripts/sync-warehouses-full.js  para aplicarlos.');
    }
}

dryRunWarehouses().catch(console.error);
