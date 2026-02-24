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

    console.log('📦 Buscando sucursales/bodegas en Zoho...');
    const whRes = await fetch(`${apiDomain}/inventory/v1/branches?organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });
    const data = await whRes.json();
    const branches = data.branches || [];

    console.log(`✨ Encontradas ${branches.length} sucursales/bodegas en Zoho.`);

    for (const b of branches) {
        const warehouseData = {
            zoho_warehouse_id: String(b.branch_id),
            name: b.branch_name,
            code: b.branch_name.substring(0, 40),
            active: b.status === 'active' || b.status === undefined, // status sometimes undefined for branches
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('warehouses')
            .upsert(warehouseData, { onConflict: 'zoho_warehouse_id' });

        if (error) {
            console.error(`❌ Error con ${b.branch_name}:`, error.message);
        } else {
            console.log(`✅ Bodega sincronizada: ${b.branch_name} [${b.status}]`);
        }
    }
    console.log('\n🏁 Sincronización de bodegas completada.');
}

syncWarehouses().catch(console.error);
