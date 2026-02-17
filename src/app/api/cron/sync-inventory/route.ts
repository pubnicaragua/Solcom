import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncItemStock } from '@/lib/zoho/sync-logic';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const debugLog: string[] = [];
    const startTime = Date.now();

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Query items from Supabase (same strategy as sync-recent)
        const { data: items, error: itemsError } = await supabase
            .from('items')
            .select('id, zoho_item_id, name, sku')
            .not('zoho_item_id', 'is', null)
            .order('updated_at', { ascending: true, nullsFirst: true })
            .limit(50);

        if (itemsError) {
            return NextResponse.json({
                error: 'Failed to query items',
                details: itemsError.message,
                durationMs: Date.now() - startTime,
                log: debugLog
            }, { status: 500 });
        }

        if (!items || items.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No items to sync',
                itemsSynced: 0,
                durationMs: Date.now() - startTime,
                log: debugLog
            });
        }

        debugLog.push(`[cron] Found ${items.length} items to sync`);

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

        let syncedCount = 0;
        const errors: string[] = [];

        for (const item of items) {
            try {
                const itemLog: string[] = [];
                await syncItemStock(item.zoho_item_id, supabase, warehouseMap, itemLog);
                syncedCount++;
                for (const line of itemLog) {
                    if (line.includes('ERROR') || line.includes('WARN')) {
                        debugLog.push(line);
                    }
                }
            } catch (err) {
                const msg = `[cron] Failed to sync ${item.sku || item.zoho_item_id}: ${err instanceof Error ? err.message : 'Unknown'}`;
                errors.push(msg);
                debugLog.push(msg);
                // Stop on auth errors
                if (err instanceof Error && err.message.includes('401')) {
                    debugLog.push('[cron] Auth error, stopping');
                    break;
                }
            }
        }

        const durationMs = Date.now() - startTime;
        debugLog.push(`[cron] Completed in ${durationMs}ms: ${syncedCount}/${items.length} synced`);

        return NextResponse.json({
            success: true,
            itemsSynced: syncedCount,
            totalFound: items.length,
            errors: errors.length,
            durationMs,
            log: debugLog,
        });
    } catch (error) {
        const durationMs = Date.now() - startTime;
        console.error('[cron] sync-inventory error:', error);
        return NextResponse.json({
            error: 'Cron sync failed',
            details: error instanceof Error ? error.message : 'Unknown',
            durationMs,
            log: debugLog,
        }, { status: 500 });
    }
}
