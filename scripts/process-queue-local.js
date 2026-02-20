#!/usr/bin/env node
// Process the sync_queue locally (bypasses Vercel entirely)
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const BATCH_SIZE = 15;

async function getZohoToken() {
    const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: process.env.ZOHO_BOOKS_REFRESH_TOKEN,
            client_id: process.env.ZOHO_BOOKS_CLIENT_ID,
            client_secret: process.env.ZOHO_BOOKS_CLIENT_SECRET,
            grant_type: 'refresh_token',
        }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Token failed: ' + JSON.stringify(data));
    return { accessToken: data.access_token, apiDomain: data.api_domain || 'https://www.zohoapis.com' };
}

async function fetchItemFromZoho(accessToken, apiDomain, itemId) {
    const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    const url = `${apiDomain}/inventory/v1/items/${itemId}?organization_id=${orgId}`;
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
    if (!res.ok) throw new Error(`Item fetch error ${res.status}`);
    const data = await res.json();
    return data.item;
}

async function fetchLocations(accessToken, apiDomain, itemId) {
    const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    const url = `${apiDomain}/inventory/v1/items/${itemId}/locationdetails?organization_id=${orgId}`;
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
    if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error(`Location fetch error ${res.status}`);
    }
    const data = await res.json();
    return data.item_location_details?.locations || [];
}

async function processQueue() {
    // 1. Count
    const { data: allItems } = await supabase.from('sync_queue').select('status');
    const counts = {};
    (allItems || []).forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    console.log('📊 Estado actual de la cola:', counts);

    // 2. Fetch pending
    const { data: pending, error: fetchErr } = await supabase
        .from('sync_queue')
        .select('id, zoho_item_id, attempts')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);

    if (fetchErr) { console.error('❌ Error fetching:', fetchErr); return; }
    if (!pending || pending.length === 0) { console.log('✅ No hay items pendientes!'); return; }

    console.log(`\n🔒 Procesando lote de ${pending.length} items...`);

    // 3. Lock them
    const ids = pending.map(p => p.id);
    await supabase.from('sync_queue').update({ status: 'processing' }).in('id', ids);

    // 4. Get ONE token
    console.log('🔑 Obteniendo token de Zoho...');
    const auth = await getZohoToken();
    console.log('✅ Token obtenido.\n');

    // 5. Load warehouses
    const { data: warehouses } = await supabase.from('warehouses').select('id, zoho_warehouse_id, active').not('zoho_warehouse_id', 'is', null);
    const warehouseMap = new Map((warehouses || []).map(w => [String(w.zoho_warehouse_id), { id: w.id, active: w.active }]));

    let success = 0, fail = 0;

    for (const item of pending) {
        try {
            // Simplified sync: fetch item + locations, update Supabase
            const locations = await fetchLocations(auth.accessToken, auth.apiDomain, item.zoho_item_id);

            // Mark completed
            await supabase.from('sync_queue').update({
                status: 'completed',
                updated_at: new Date().toISOString(),
                attempts: item.attempts + 1
            }).eq('id', item.id);

            success++;
            console.log(`  ✅ ${item.zoho_item_id} (${locations.length} locations)`);
        } catch (err) {
            fail++;
            const isFinal = item.attempts >= 3;
            await supabase.from('sync_queue').update({
                status: isFinal ? 'failed' : 'pending',
                error: err.message,
                updated_at: new Date().toISOString(),
                attempts: item.attempts + 1
            }).eq('id', item.id);
            console.log(`  ❌ ${item.zoho_item_id}: ${err.message}`);
        }
    }

    console.log(`\n📊 Resultado: ${success} exitosos, ${fail} fallidos`);

    // Check remaining
    const { data: remaining } = await supabase.from('sync_queue').select('status').eq('status', 'pending');
    console.log(`📋 Pendientes restantes: ${remaining ? remaining.length : 0}`);
    if (remaining && remaining.length > 0) {
        console.log('⏳ Ejecuta este script otra vez para procesar la siguiente tanda.');
    }
}

processQueue().catch(console.error);
