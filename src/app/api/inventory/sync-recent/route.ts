import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncItemStock } from '@/lib/zoho/sync-logic';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
    const debugLog: string[] = [];
    const startTime = Date.now();

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get ALL items with zoho_item_id from our database
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

        // Pre-fetch warehouse map
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

        debugLog.push(`Warehouse map entries: ${warehouseMap.size}`);

        // Process items in parallel batches of 5 for speed
        const BATCH_SIZE = 5;
        let processedCount = 0;
        let errorCount = 0;
        let authError = false;

        for (let i = 0; i < items.length && !authError; i += BATCH_SIZE) {
            // Check if we're running out of time (leave 5s buffer)
            if (Date.now() - startTime > 55000) {
                debugLog.push(`Time limit approaching, synced ${processedCount}/${items.length} items`);
                break;
            }

            const batch = items.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(async (item) => {
                    const itemLog: string[] = [];
                    await syncItemStock(item.zoho_item_id, supabase, warehouseMap, itemLog);
                    return itemLog;
                })
            );

            for (let j = 0; j < results.length; j++) {
                const result = results[j];
                if (result.status === 'fulfilled') {
                    processedCount++;
                    // Only include errors/warnings
                    for (const line of result.value) {
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
                        debugLog.push('Auth error detected, stopping');
                    }
                }
            }
        }

        const durationMs = Date.now() - startTime;
        debugLog.push(`Completed in ${(durationMs / 1000).toFixed(1)}s: ${processedCount}/${items.length} synced, ${errorCount} errors`);

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
