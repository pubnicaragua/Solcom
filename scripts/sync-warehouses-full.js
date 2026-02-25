const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function syncWarehouses() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    console.log('🔄 Obteniendo token de Zoho...');
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

    // 1. Get any item to query its locationdetails (the REAL source of truth)
    console.log('📦 Obteniendo lista de ubicaciones desde locationdetails...');
    const itemRes = await fetch(`${apiDomain}/inventory/v1/items?organization_id=${orgId}&page=1&per_page=1`, { headers });
    const itemData = await itemRes.json();
    const sampleItemId = itemData.items?.[0]?.item_id;

    if (!sampleItemId) {
        console.error('❌ No se encontraron items en Zoho para obtener ubicaciones.');
        return;
    }

    const locRes = await fetch(`${apiDomain}/inventory/v1/items/${sampleItemId}/locationdetails?organization_id=${orgId}`, { headers });
    const locData = await locRes.json();
    const locations = locData.item_location_details?.locations || [];

    console.log(`✅ ${locations.length} ubicaciones encontradas.\n`);
    console.log('🔄 Sincronizando con Supabase...\n');

    for (const loc of locations) {
        const zohoId = String(loc.location_id);
        const locName = String(loc.location_name || '');
        const isActive = loc.status === 'active';

        const warehouseData = {
            zoho_warehouse_id: zohoId,
            name: locName,
            code: locName.substring(0, 40),
            active: isActive,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('warehouses')
            .upsert(warehouseData, { onConflict: 'zoho_warehouse_id' });

        const badge = isActive ? '🟢 activa' : '🔴 inactiva';
        if (error) {
            console.error(`❌ Error con ${locName}: ${error.message}`);
        } else {
            console.log(`✅ ${locName.padEnd(35)} [${badge}]`);
        }
    }

    console.log('\n🏁 Sincronización de bodegas completada.');
}

syncWarehouses().catch(console.error);
