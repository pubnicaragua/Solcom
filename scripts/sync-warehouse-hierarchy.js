// Script para sincronizar la jerarquía de bodegas desde Zoho
// Ejecutar: node scripts/sync-warehouse-hierarchy.js

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZOHO_CLIENT_ID = process.env.ZOHO_BOOKS_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_BOOKS_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
const ZOHO_ORG_ID = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
const ZOHO_AUTH_DOMAIN = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';

async function getZohoToken() {
    const res = await fetch(`${ZOHO_AUTH_DOMAIN}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: ZOHO_REFRESH_TOKEN,
            client_id: ZOHO_CLIENT_ID,
            client_secret: ZOHO_CLIENT_SECRET,
            grant_type: 'refresh_token',
        }),
    });
    const data = await res.json();
    return { accessToken: data.access_token, apiDomain: data.api_domain || 'https://www.zohoapis.com' };
}

async function main() {
    console.log('🔄 Sincronizando jerarquía de bodegas...\n');

    // 1. Obtener token de Zoho
    const { accessToken, apiDomain } = await getZohoToken();
    console.log('✅ Token de Zoho obtenido');

    // 2. Obtener locations con jerarquía
    const url = `${apiDomain}/books/v3/locations?is_hierarchical_response=true&organization_id=${ZOHO_ORG_ID}`;
    const res = await fetch(url, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    const result = await res.json();
    const locations = result.locations || [];
    console.log(`✅ ${locations.length} ubicaciones obtenidas de Zoho\n`);

    // 3. Obtener warehouses existentes de Supabase
    const whRes = await fetch(`${SUPABASE_URL}/rest/v1/warehouses?select=id,code,name,zoho_warehouse_id`, {
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
    });
    const warehouses = await whRes.json();
    console.log(`✅ ${warehouses.length} bodegas en Supabase\n`);

    // Mapear zoho_warehouse_id → supabase id
    const byZohoId = new Map();
    for (const wh of warehouses) {
        if (wh.zoho_warehouse_id) byZohoId.set(wh.zoho_warehouse_id, wh);
    }

    let updated = 0;
    let skipped = 0;

    // 4. Procesar jerarquía
    for (const loc of locations) {
        const parentWh = byZohoId.get(loc.location_id);
        const isEmpresarial = (loc.child_locations || []).length > 0;

        if (parentWh && isEmpresarial) {
            // Marcar como empresarial
            const patchRes = await fetch(
                `${SUPABASE_URL}/rest/v1/warehouses?id=eq.${parentWh.id}`,
                {
                    method: 'PATCH',
                    headers: {
                        apikey: SUPABASE_SERVICE_KEY,
                        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
                        'Content-Type': 'application/json',
                        Prefer: 'return=minimal',
                    },
                    body: JSON.stringify({
                        warehouse_type: 'empresarial',
                        parent_warehouse_id: null,
                    }),
                }
            );
            if (patchRes.ok) {
                console.log(`🏢 ${loc.location_name.padEnd(30)} → EMPRESARIAL`);
                updated++;
            }
        }

        // Procesar hijos
        for (const child of loc.child_locations || []) {
            const childWh = byZohoId.get(child.location_id);
            if (!childWh) {
                console.log(`   ⚠️  ${child.location_name.padEnd(26)} → No encontrada en Supabase (zoho_id: ${child.location_id})`);
                skipped++;
                continue;
            }

            const patchRes = await fetch(
                `${SUPABASE_URL}/rest/v1/warehouses?id=eq.${childWh.id}`,
                {
                    method: 'PATCH',
                    headers: {
                        apikey: SUPABASE_SERVICE_KEY,
                        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
                        'Content-Type': 'application/json',
                        Prefer: 'return=minimal',
                    },
                    body: JSON.stringify({
                        warehouse_type: 'almacen',
                        parent_warehouse_id: parentWh ? parentWh.id : null,
                    }),
                }
            );
            if (patchRes.ok) {
                console.log(`   📦 └─ ${child.location_name.padEnd(26)} → almacén de ${loc.location_name}`);
                updated++;
            }
        }

        // Si no tiene hijos y no tiene padre = independiente
        if (!isEmpresarial && !loc.parent_location_id) {
            const indWh = byZohoId.get(loc.location_id);
            if (indWh) {
                await fetch(
                    `${SUPABASE_URL}/rest/v1/warehouses?id=eq.${indWh.id}`,
                    {
                        method: 'PATCH',
                        headers: {
                            apikey: SUPABASE_SERVICE_KEY,
                            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
                            'Content-Type': 'application/json',
                            Prefer: 'return=minimal',
                        },
                        body: JSON.stringify({ warehouse_type: 'independiente' }),
                    }
                );
                console.log(`📍 ${loc.location_name.padEnd(30)} → independiente`);
                updated++;
            }
        }
    }

    console.log(`\n✅ Listo! ${updated} bodegas actualizadas, ${skipped} omitidas`);
}

main().catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
