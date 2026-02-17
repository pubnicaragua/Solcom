import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
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

        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        if (!organizationId) {
            return NextResponse.json({ error: 'Missing ZOHO_BOOKS_ORGANIZATION_ID' }, { status: 500 });
        }

        // Use the SAME auth as the webhook (multi-domain fallback)
        const auth = await getZohoAccessToken();
        if (!auth || 'error' in auth) {
            return NextResponse.json({
                error: 'Zoho auth failed',
                details: (auth as any)?.error || 'Unknown',
                log: debugLog
            }, { status: 500 });
        }

        debugLog.push(`[cron] Auth OK via ${auth.authDomainUsed}`);

        // Fetch items from Inventory API (same as webhook)
        const url = `${auth.apiDomain}/inventory/v1/items?organization_id=${organizationId}&page=1&per_page=200&sort_column=last_modified_time&sort_order=D`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Zoho-oauthtoken ${auth.accessToken}` },
            cache: 'no-store',
        });

        let allItems: any[] = [];

        if (!response.ok) {
            // Fallback: try without sort params
            debugLog.push(`[cron] Sort failed (${response.status}), retrying without sort...`);
            const fallbackUrl = `${auth.apiDomain}/inventory/v1/items?organization_id=${organizationId}&page=1&per_page=200`;
            const fallbackResponse = await fetch(fallbackUrl, {
                headers: { 'Authorization': `Zoho-oauthtoken ${auth.accessToken}` },
                cache: 'no-store',
            });

            if (!fallbackResponse.ok) {
                const errorText = await fallbackResponse.text();
                return NextResponse.json({
                    error: 'Zoho Inventory API error',
                    details: errorText.substring(0, 300),
                    durationMs: Date.now() - startTime,
                    log: debugLog
                }, { status: 500 });
            }

            const fallbackResult = await fallbackResponse.json();
            allItems = fallbackResult.items || [];
        } else {
            const result = await response.json();
            allItems = result.items || [];
        }

        // Filter to items modified in the last 10 minutes
        const cutoffTime = Date.now() - 10 * 60 * 1000;
        const items = allItems.filter((item: any) => {
            if (!item.last_modified_time) return false;
            const itemTime = new Date(item.last_modified_time).getTime();
            return itemTime >= cutoffTime;
        });

        debugLog.push(`[cron] Found ${items.length} recently modified items (out of ${allItems.length} fetched)`);

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
            const zohoId = item.item_id;
            if (!zohoId) continue;

            try {
                const itemLog: string[] = [];
                await syncItemStock(zohoId, supabase, warehouseMap, itemLog);
                syncedCount++;
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
