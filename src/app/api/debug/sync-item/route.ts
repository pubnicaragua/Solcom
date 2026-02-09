import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getZohoAccessToken, fetchItemLocations } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const logs: string[] = [];
    function log(msg: string, data?: any) {
        console.log(msg, data || '');
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

        // 2. Get Warehouses
        const { data: warehouses } = await supabase
            .from('warehouses')
            .select('id, code, zoho_warehouse_id, active')
            .not('zoho_warehouse_id', 'is', null);

        const warehouseMap = new Map(
            (warehouses || []).map((w: any) => [String(w.zoho_warehouse_id ?? ''), w.id])
        );
        log(`Loaded ${warehouses?.length} warehouses`);

        // 3. Fetch from Zoho
        const auth = await getZohoAccessToken();
        if ('error' in auth) {
            log('Auth error', auth);
            return NextResponse.json({ logs, error: auth.error });
        }

        const start = Date.now();
        log('Fetching locations from Zoho...');
        const locations = await fetchItemLocations(
            auth.accessToken,
            auth.apiDomain,
            process.env.ZOHO_BOOKS_ORGANIZATION_ID!,
            item.zoho_item_id
        );
        log(`Fetch took ${Date.now() - start}ms`);
        log('Locations received:', locations);

        if (!locations || locations.length === 0) {
            log('No locations returned from Zoho API');
            return NextResponse.json({ logs, result: 'No locations' });
        }

        // 4. Map and Insert Snapshots
        const snapshots = [];
        let cleanStock = 0;

        // Delete existing snapshots
        await supabase.from('stock_snapshots').delete().eq('item_id', item.id);
        log('Deleted old snapshots');

        for (const loc of locations) {
            const locId = String(loc.location_id);
            const localWhId = warehouseMap.get(locId);
            const whName = warehouses?.find(w => w.id === localWhId)?.name || 'Unknown';
            const whActive = warehouses?.find(w => w.id === localWhId)?.active;

            log(`Processing location: ${loc.location_name} (${locId}) -> Local: ${whName} (Active: ${whActive})`);

            if (localWhId) {
                const qty = loc.location_stock_on_hand ?? 0;
                snapshots.push({
                    warehouse_id: localWhId,
                    item_id: item.id,
                    qty,
                    source_ts: new Date().toISOString(),
                    synced_at: new Date().toISOString()
                });

                if (whActive) {
                    cleanStock += qty;
                }
            } else {
                log('WARNING: Location not mapped to local warehouse', loc);
            }
        }

        log(`Created ${snapshots.length} snapshot objects`);

        if (snapshots.length > 0) {
            const { error: insertError } = await supabase.from('stock_snapshots').insert(snapshots);
            if (insertError) {
                log('Error inserting snapshots', insertError);
            } else {
                log('Snapshots inserted successfully');
            }
        }

        // 5. Update Item Stock Total
        log(`Calculated Clean Stock: ${cleanStock}. Updating item...`);
        const { error: updateError } = await supabase
            .from('items')
            .update({ stock_total: cleanStock })
            .eq('id', item.id);

        if (updateError) log('Error updating item stock', updateError);
        else log('Item stock updated successfully');

        return NextResponse.json({
            success: true,
            item: item.sku,
            cleanStock,
            snapshotsCount: snapshots.length,
            logs
        });

    } catch (error) {
        log('CRITICAL ERROR', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
            logs
        }, { status: 500 });
    }
}
