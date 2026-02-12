import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getZohoAccessToken, fetchItemLocations, AuthExpiredError } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const logs: string[] = [];
    function log(msg: string, data?: any) {
        console.log(`[DEBUG-SYNC-ITEM] ${msg}`, data ? JSON.stringify(data) : '');
        logs.push(`${msg} ${data ? JSON.stringify(data) : ''}`);
    }

    try {
        const searchParams = request.nextUrl.searchParams;
        const sku = searchParams.get('sku');

        if (!sku) {
            return NextResponse.json({ error: 'sku param required' }, { status: 400 });
        }

        log(`Starting debug sync for SKU: ${sku}`);

        const supabase = createServerClient();

        // 1. Get Local Item
        const { data: item, error: itemError } = await supabase
            .from('items')
            .select('*')
            .eq('sku', sku)
            .single();

        if (itemError || !item) {
            log('Item not found in Supabase', itemError);
            return NextResponse.json({ logs, error: 'Item not found' });
        }
        log(`Found local item: ${item.name} (${item.zoho_item_id})`);

        // 2. Get Warehouses (All of them to see mapping)
        const { data: warehouses } = await supabase
            .from('warehouses')
            .select('*');

        const warehouseMap = new Map(
            (warehouses || []).filter(w => w.zoho_warehouse_id).map((w: any) => [String(w.zoho_warehouse_id), w.id])
        );
        log(`Loaded ${warehouses?.length} warehouses. Map size: ${warehouseMap.size}`);

        // 3. Fetch from Zoho
        log('Authenticating with Zoho...');
        const auth = await getZohoAccessToken();
        if ('error' in auth) {
            log('Auth error', auth.error);
            return NextResponse.json({ logs, error: auth.error });
        }

        const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        log(`Using Org ID: ${orgId}`);

        const start = Date.now();
        log(`Fetching locations for item ID ${item.zoho_item_id} from Zoho...`);
        if (!item.zoho_item_id) {
            log('Item has no zoho_item_id, aborting fetch');
            return NextResponse.json({ logs, error: 'Item has no zoho_item_id' });
        }
        let locations = [];
        try {
            locations = await fetchItemLocations(
                auth.accessToken,
                auth.apiDomain,
                orgId!,
                item.zoho_item_id
            );
        } catch (err: any) {
            if (err instanceof AuthExpiredError) {
                log('Token expired on first attempt, refreshing and retrying...');
                const retryAuth = await getZohoAccessToken();
                if ('error' in retryAuth) {
                    log(`CRITICAL FETCH ERROR after refresh auth: ${retryAuth.error}`);
                    return NextResponse.json({ logs, error: retryAuth.error });
                }
                try {
                    locations = await fetchItemLocations(
                        retryAuth.accessToken,
                        retryAuth.apiDomain,
                        orgId!,
                        item.zoho_item_id
                    );
                } catch (retryErr: any) {
                    log(`CRITICAL FETCH ERROR after retry: ${retryErr.message}`);
                    return NextResponse.json({ logs, error: retryErr.message });
                }
            } else {
                log(`CRITICAL FETCH ERROR: ${err.message}`);
                return NextResponse.json({ logs, error: err.message });
            }
        }
        log(`Fetch took ${Date.now() - start}ms. Received ${locations.length} locations.`);

        // 4. Map and Insert Snapshots
        const snapshots = [];
        let cleanStock = 0;
        let mappedCount = 0;
        let ignoredCount = 0;

        for (const loc of locations) {
            const locId = String(loc.location_id);
            const localWhId = warehouseMap.get(locId);
            const localWh = warehouses?.find(w => w.id === localWhId);

            const qty = loc.location_stock_on_hand ?? 0;

            if (localWhId) {
                mappedCount++;
                log(`MATCH: Zoho '${loc.location_name}' (${locId}) -> Local '${localWh?.code}' (${localWhId}). Qty: ${qty}`);

                snapshots.push({
                    warehouse_id: localWhId,
                    item_id: item.id,
                    qty,
                    source_ts: new Date().toISOString(),
                    synced_at: new Date().toISOString()
                });

                if (localWh?.active) {
                    cleanStock += qty;
                } else {
                    log(`NOTE: Warehouse ${localWh?.code} is INACTIVE. Qty ${qty} not added to cleanStock.`);
                }
            } else {
                ignoredCount++;
                log(`MISSING MAPPING: Zoho '${loc.location_name}' (${locId}) not found in Supabase! Qty: ${qty}`);
            }
        }

        // 5. Database Update
        log(`Final Stats: Mapped ${mappedCount}, Ignored ${ignoredCount}, Clean Stock Sum: ${cleanStock}`);

        if (snapshots.length > 0) {
            log('Deleting old snapshots...');
            await supabase.from('stock_snapshots').delete().eq('item_id', item.id);

            log(`Inserting ${snapshots.length} new snapshots...`);
            const { error: insertError } = await supabase.from('stock_snapshots').insert(snapshots);
            if (insertError) log('Insert error', insertError);
        }

        log(`Updating item stock_total to ${cleanStock}...`);
        const { error: updateError } = await supabase
            .from('items')
            .update({ stock_total: cleanStock })
            .eq('id', item.id);

        if (updateError) log('Update error', updateError);

        return NextResponse.json({
            success: true,
            sku: item.sku,
            cleanStock,
            snapshotsCreated: snapshots.length,
            mappedCount,
            ignoredCount,
            zohoLocations: locations,
            logs
        });

    } catch (error: any) {
        log('GLOBAL ERROR', error.message);
        return NextResponse.json({
            error: error.message,
            logs
        }, { status: 500 });
    }
}
