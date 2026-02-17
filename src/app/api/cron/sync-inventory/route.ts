import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { syncItemStock } from '@/lib/zoho/sync-logic';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for this cron

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
    // Verify the request comes from Vercel Cron
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

        const zohoClient = createZohoBooksClient();
        if (!zohoClient) {
            return NextResponse.json({ error: 'Zoho not configured' }, { status: 500 });
        }

        // Sync items modified today (safest format for Zoho API)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000); // Keep variable name but logic is now daily
        // STRATEGY CHANGE: Zoho API rejects last_modified_time filter often.
        // Instead, fetch most recently modified items and filter locally.
        const cutoffTime = tenMinutesAgo.getTime();

        // Fetch first page (200 items) sorted by modification time
        const allRecentItems = await zohoClient.fetchItems('sort_column=last_modified_time&sort_order=D');

        const items = allRecentItems.filter(item => {
            // Zoho returns local time string usually, new Date() handles it well in Vercel
            const itemTime = new Date(item.last_modified_time).getTime();
            return itemTime >= cutoffTime;
        });

        debugLog.push(`[cron] Found ${items.length} recently modified items (out of ${allRecentItems.length} fetched)`);

        if (items.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No recent changes',
                itemsSynced: 0,
                durationMs: Date.now() - startTime,
                log: debugLog
            });
        }

        // Pre-fetch warehouse map
        const { data: warehouses } = await supabase
            .from('warehouses')
            .select('id, code, active');

        const warehouseMap = new Map<string, { id: string; active: boolean }>();
        for (const w of warehouses || []) {
            warehouseMap.set(w.code, { id: w.id, active: w.active });
            warehouseMap.set(w.id, { id: w.id, active: w.active });
        }

        // Also map by zoho_warehouse_id (used by Zoho location API)
        const { data: warehousesWithZoho } = await supabase
            .from('warehouses')
            .select('id, code, active, zoho_warehouse_id')
            .not('zoho_warehouse_id', 'is', null);

        for (const w of warehousesWithZoho || []) {
            if (w.zoho_warehouse_id) {
                warehouseMap.set(String(w.zoho_warehouse_id), { id: w.id, active: w.active });
            }
        }

        debugLog.push(`[cron] Warehouse map size: ${warehouseMap.size}`);

        let syncedCount = 0;
        const errors: string[] = [];

        for (const item of items) {
            const zohoId = item.item_id;
            if (!zohoId) continue;

            try {
                const itemLog: string[] = [];
                await syncItemStock(zohoId, supabase, warehouseMap, itemLog);
                syncedCount++;
                // Only log errors/warnings, not successes (to keep log small)
                for (const line of itemLog) {
                    if (line.includes('ERROR') || line.includes('WARN')) {
                        debugLog.push(line);
                    }
                }
            } catch (err) {
                const msg = `[cron] Failed to sync item ${zohoId}: ${err instanceof Error ? err.message : 'Unknown'}`;
                errors.push(msg);
                debugLog.push(msg);
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
