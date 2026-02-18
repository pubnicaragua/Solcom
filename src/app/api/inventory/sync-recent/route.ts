import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncItemStock } from '@/lib/zoho/sync-logic';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
    const debugLog: string[] = [];
    const startTime = Date.now();

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Authenticate with Zoho ONCE
        const auth = await getZohoAccessToken();
        if (!auth || 'error' in auth) {
            const errorMsg = (auth as any)?.error || 'Unknown auth error';
            console.error('Zoho Auth Failed:', errorMsg);
            return NextResponse.json({
                error: 'Zoho Authentication Failed',
                details: errorMsg,
                log: debugLog
            }, { status: 500 });
        }

        // Robust check for required properties
        if (!auth.accessToken || !auth.apiDomain) {
            console.error('Zoho Auth Invalid Response:', auth);
            return NextResponse.json({
                error: 'Zoho Authentication Invalid',
                log: debugLog
            }, { status: 500 });
        }

        debugLog.push(`Zoho Auth OK via ${auth.authDomainUsed}`);

        // 2. Scan items
        const { data: items, error: itemsError } = await supabase
            .from('items')
            .select('id, zoho_item_id, name, sku')
            .not('zoho_item_id', 'is', null);

        if (itemsError) {
            return NextResponse.json({
                error: 'Failed to query items',
                details: itemsError.message,
                log: debugLog
            }, { status: 500 });
        }

        if (!items || items.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No items with zoho_item_id found',
                itemsProcessed: 0,
                log: debugLog
            });
        }

        debugLog.push(`Found ${items.length} items to sync`);

        // 3. Warehouse Map
        const { data: warehouses } = await supabase
            .from('warehouses')
            .select('id, code, active, zoho_warehouse_id');

        const warehouseMap = new Map<string, { id: string; active: boolean }>();
        for (const w of warehouses || []) {
            warehouseMap.set(w.code, { id: w.id, active: w.active });
            warehouseMap.set(w.id, { id: w.id, active: w.active });
            if (w.zoho_warehouse_id) {
                warehouseMap.set(String(w.zoho_warehouse_id), { id: w.id, active: w.active });
            }
        }

        // 4. Batch Processing with Token Reuse
        const BATCH_SIZE = 5;
        let processedCount = 0;
        let errorCount = 0;
        let authError = false;

        // Simplify auth object to match expected type
        const authData = { accessToken: auth.accessToken, apiDomain: auth.apiDomain };

        for (let i = 0; i < items.length && !authError; i += BATCH_SIZE) {
            if (Date.now() - startTime > 55000) {
                debugLog.push(`Time limit approaching, synced ${processedCount}/${items.length} items`);
                break;
            }

            const batch = items.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(async (item) => {
                    const itemLog: string[] = [];
                    // Pass existing auth to avoid re-fetching
                    await syncItemStock(item.zoho_item_id, supabase, warehouseMap, itemLog, authData);
                    return itemLog;
                })
            );

            for (let j = 0; j < results.length; j++) {
                const result = results[j];
                if (result.status === 'fulfilled') {
                    processedCount++;
                    for (const line of result.value) {
                        // Only log errors/warnings to keep log size manageable
                        if (line.includes('ERROR') || line.includes('WARN')) {
                            debugLog.push(line);
                        }
                    }
                } else {
                    errorCount++;
                    const item = batch[j];
                    const errMsg = result.reason instanceof Error ? result.reason.message : 'Unknown';
                    debugLog.push(`ERROR syncing ${item.sku || item.zoho_item_id}: ${errMsg}`);
                    if (errMsg.includes('expired') || errMsg.includes('unauthorized')) {
                        authError = true;
                    }
                }
            }
        }

        const durationMs = Date.now() - startTime;
        return NextResponse.json({
            success: true,
            itemsProcessed: processedCount,
            totalItems: items.length,
            errors: errorCount,
            durationMs,
            message: `✅ Sincronizados ${processedCount} de ${items.length} items`,
            log: debugLog
        });

    } catch (error) {
        console.error('Sync Error:', error);
        return NextResponse.json({
            error: 'Sync failed',
            details: error instanceof Error ? error.message : 'Unknown',
            log: debugLog
        }, { status: 500 });
    }
}
