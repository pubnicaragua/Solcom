import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncItemStock } from '@/lib/zoho/sync-logic';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Smart Cron: fetches recently-modified items from Zoho Inventory
 * and syncs only those that changed since last sync.
 *
 * Strategy: query Zoho for items sorted by last_modified_time DESC,
 * then sync each one. This catches changes from Books sales,
 * manual adjustments, and anything not covered by webhooks.
 *
 * Can be triggered by:
 * - Vercel cron (1x/day on Hobby)
 * - External cron service (every 2 min) like cron-job.org
 */
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
        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

        if (!organizationId) {
            debugLog.push('[cron] ERROR: ZOHO_BOOKS_ORGANIZATION_ID is missing in environment variables');
            return NextResponse.json({
                error: 'Configuration Error',
                details: 'ZOHO_BOOKS_ORGANIZATION_ID is missing',
                log: debugLog
            }, { status: 500 });
        }

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
        debugLog.push(`[cron] Auth OK via ${auth.authDomainUsed}`);
        debugLog.push(`[cron] Using Org ID: '${organizationId}'`);
        debugLog.push(`[cron] API Domain: '${auth.apiDomain}'`);

        // 2. Warehouse Map
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

        // 3. Fetch recently-modified items from Zoho
        // Sort by last_modified_time DESC → most recently changed first
        const zohoUrl = `${auth.apiDomain}/inventory/v1/items?organization_id=${organizationId}&sort_column=last_modified_time&sort_order=D&per_page=15&page=1`;
        debugLog.push(`[cron] Fetching URL: ${zohoUrl}`);

        const zohoRes = await fetch(zohoUrl, {
            headers: { Authorization: `Zoho-oauthtoken ${auth.accessToken}` },
            cache: 'no-store',
        });

        if (!zohoRes.ok) {
            const errText = await zohoRes.text();
            debugLog.push(`[cron] Zoho items list failed: ${zohoRes.status} ${errText.substring(0, 200)}`);
            return NextResponse.json({
                error: 'Zoho API error',
                details: errText.substring(0, 300),
                log: debugLog
            }, { status: 502 });
        }

        const zohoData = await zohoRes.json();
        const zohoItems = zohoData.items || [];
        debugLog.push(`[cron] Fetched ${zohoItems.length} recently-modified items from Zoho`);

        if (zohoItems.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No items from Zoho',
                itemsSynced: 0,
                durationMs: Date.now() - startTime,
                log: debugLog
            });
        }

        // 4. For each Zoho item, check if it needs syncing
        // Compare Zoho's last_modified_time with our updated_at
        const zohoItemIds = zohoItems.map((i: any) => String(i.item_id));

        // Fetch our items' updated_at for comparison
        const { data: localItems } = await supabase
            .from('items')
            .select('id, zoho_item_id, updated_at')
            .in('zoho_item_id', zohoItemIds);

        const localMap = new Map<string, { id: string; updated_at: string | null }>();
        for (const item of localItems || []) {
            if (item.zoho_item_id) {
                localMap.set(item.zoho_item_id, { id: item.id, updated_at: item.updated_at });
            }
        }

        // 5. Sync items that changed
        let syncedCount = 0;
        let skippedCount = 0;
        const errors: string[] = [];

        for (const zohoItem of zohoItems) {
            // Time guard: stop before Vercel timeout
            if (Date.now() - startTime > 25000) {
                debugLog.push(`[cron] Time limit (25s), synced ${syncedCount} items`);
                break;
            }

            const zohoItemId = String(zohoItem.item_id);
            const zohoModified = zohoItem.last_modified_time;
            const local = localMap.get(zohoItemId);

            // Skip if Zoho hasn't changed since our last sync
            if (local?.updated_at && zohoModified) {
                const zohoTime = new Date(zohoModified).getTime();
                const localTime = new Date(local.updated_at).getTime();

                // Only skip if our record is newer (within 60s tolerance)
                if (localTime > zohoTime - 60000) {
                    skippedCount++;
                    continue;
                }
            }

            try {
                const itemLog: string[] = [];
                await syncItemStock(zohoItemId, supabase, warehouseMap, itemLog, authData);
                syncedCount++;
                for (const line of itemLog) {
                    if (line.includes('ERROR') || line.includes('WARN')) {
                        debugLog.push(line);
                    }
                }
            } catch (err) {
                const msg = `[cron] Failed: ${zohoItem.sku || zohoItemId}: ${err instanceof Error ? err.message : 'Unknown'}`;
                errors.push(msg);
                debugLog.push(msg);
            }
        }

        const durationMs = Date.now() - startTime;
        debugLog.push(`[cron] Done: synced=${syncedCount} skipped=${skippedCount} errors=${errors.length} in ${durationMs}ms`);

        return NextResponse.json({
            success: true,
            itemsSynced: syncedCount,
            itemsSkipped: skippedCount,
            totalChecked: zohoItems.length,
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
