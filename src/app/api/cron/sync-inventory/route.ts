import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncItemStock } from '@/lib/zoho/sync-logic';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';

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

        // 1. Authenticate ONCE
        const auth = await getZohoAccessToken();
        if (!auth || 'error' in auth) {
            const errorMsg = (auth as any)?.error || 'Unknown auth error';
            console.error('[cron] Zoho Auth Failed:', errorMsg);
            return NextResponse.json({
                error: 'Zoho Authentication Failed',
                details: errorMsg,
                log: debugLog
            }, { status: 500 });
        }

        const authData = { accessToken: auth.accessToken, apiDomain: auth.apiDomain };

        // 2. Scan items
        const { data: items, error: itemsError } = await supabase
            .from('items')
            .select('id, zoho_item_id, name, sku')
            .not('zoho_item_id', 'is', null)
            .order('updated_at', { ascending: true, nullsFirst: true })
            .limit(50); // Cron limits to 50 to run frequently without timeout

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

        let syncedCount = 0;
        const errors: string[] = [];

        for (const item of items) {
            try {
                // Check time
                if (Date.now() - startTime > 55000) {
                    debugLog.push('[cron] Time limit approaching, stopping');
                    break;
                }

                const itemLog: string[] = [];
                // Use existing auth!
                await syncItemStock(item.zoho_item_id, supabase, warehouseMap, itemLog, authData);
                syncedCount++;
                for (const line of itemLog) {
                    if (line.includes('ERROR') || line.includes('WARN')) {
                        debugLog.push(line);
                    }
                }
            } catch (err) {
                const msg = `[cron] Falied to sync ${item.sku}: ${err instanceof Error ? err.message : 'Unknown'}`;
                errors.push(msg);
                debugLog.push(msg);
            }
        }

        const durationMs = Date.now() - startTime;
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
