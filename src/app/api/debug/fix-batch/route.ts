
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken, fetchItemLocations } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
    const { skus } = await request.json();
    const debugLog: string[] = [];

    if (!skus || !Array.isArray(skus)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const isServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
        debugLog.push(`Supabase Config: URL=${supabaseUrl ? 'Set' : 'Missing'}, ServiceKey=${isServiceKey ? 'Yes' : 'NO'}`);
        const supabase = createClient(supabaseUrl, supabaseKey);

        const auth = await getZohoAccessToken();
        if (!auth || 'error' in auth) {
            const detail = (auth as any)?.error || 'Unknown auth error';
            throw new Error(`Auth failed: ${JSON.stringify(detail)}`);
        }

        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID!;

        // Get Warehouses
        const { data: warehouses } = await supabase.from('warehouses').select('id, code, active, zoho_warehouse_id');
        const warehouseMap = new Map<string, string>();
        for (const w of warehouses || []) {
            if (w.zoho_warehouse_id) warehouseMap.set(String(w.zoho_warehouse_id), w.id);
        }
        debugLog.push(`Loaded ${warehouseMap.size} mapped warehouses.`);

        // Get Items
        const { data: items } = await supabase.from('items').select('id, zoho_item_id, sku, name').in('sku', skus);
        debugLog.push(`Found ${items?.length} items in DB.`);

        let processed = 0;
        for (const item of items || []) {
            if (!item.zoho_item_id) {
                debugLog.push(`SKIP ${item.sku}: No ZOHO ID`);
                continue;
            }

            debugLog.push(`SYNC ${item.sku} (${item.zoho_item_id})`);

            try {
                // Fetch Locations
                const locations = await fetchItemLocations(auth.accessToken, auth.apiDomain, organizationId, item.zoho_item_id);
                debugLog.push(`  -> Got ${locations.length} locations from Zoho.`);

                let stockTotal = 0;
                let mappedCount = 0;

                for (const loc of locations) {
                    const qty = (loc.location_stock_on_hand ?? loc.location_available_stock) || 0;
                    const whId = warehouseMap.get(String(loc.location_id));

                    debugLog.push(`    Loc ${loc.location_id}: Qty ${qty}. Mapped? ${whId ? 'YES (' + whId + ')' : 'NO'}`);

                    if (!whId) continue;

                    stockTotal += qty;
                    mappedCount++;

                    // Upsert Balance
                    const { error: upsertErr } = await supabase.from('inventory_balance').upsert({
                        item_id: item.id,
                        warehouse_id: whId,
                        qty_on_hand: qty,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'item_id, warehouse_id' });

                    if (upsertErr) {
                        debugLog.push(`    ERROR Upserting Balance: ${upsertErr.message}`);
                    } else {
                        // Verify it exists
                        // const { count } = await supabase.from('inventory_balance').select('*', { count: 'exact', head: true }).eq('item_id', item.id).eq('warehouse_id', whId);
                        // debugLog.push(`    Verified Balance Row? ${count}`);
                    }
                }

                debugLog.push(`  -> Final Stock Total: ${stockTotal}. Mapped Locs: ${mappedCount}`);

                // Update Item
                const { error: updateErr } = await supabase.from('items').update({
                    stock_total: stockTotal,
                    updated_at: new Date().toISOString()
                }).eq('id', item.id);

                if (updateErr) debugLog.push(`  ERROR Update Item: ${updateErr.message}`);
                else debugLog.push(`  Updated Item Stock to ${stockTotal}`);

                processed++;

            } catch (e: any) {
                debugLog.push(`  ERROR Syncing Item: ${e.message}`);
            }
        }

        return NextResponse.json({ success: true, processed, log: debugLog });

    } catch (error: any) {
        return NextResponse.json({ error: 'Failed', details: error.message, log: debugLog }, { status: 500 });
    }
}
