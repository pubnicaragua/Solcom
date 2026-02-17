import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken, fetchItemLocations } from '@/lib/zoho/inventory-utils';
import { syncItemStock } from '@/lib/zoho/sync-logic';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '2');
    const debugLog: string[] = [];

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        if (!organizationId) {
            return NextResponse.json({ error: 'Missing ZOHO_BOOKS_ORGANIZATION_ID' }, { status: 500 });
        }

        // Use the SAME auth mechanism as the webhook (multi-domain fallback)
        const auth = await getZohoAccessToken();
        if (!auth || 'error' in auth) {
            return NextResponse.json({
                error: 'Zoho auth failed',
                details: (auth as any)?.error || 'Unknown',
                log: debugLog
            }, { status: 500 });
        }

        debugLog.push(`Auth OK via ${auth.authDomainUsed}, API domain: ${auth.apiDomain}`);

        // Fetch items using INVENTORY API (not Books API) - same API the webhook uses
        const url = `${auth.apiDomain}/inventory/v1/items?organization_id=${organizationId}&page=1&per_page=200&sort_column=last_modified_time&sort_order=D`;

        debugLog.push(`Fetching items from Inventory API...`);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${auth.accessToken}`,
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorText = await response.text();
            debugLog.push(`Inventory API error: ${response.status} - ${errorText.substring(0, 200)}`);

            // Fallback: if sort params fail, try without them
            if (response.status === 400) {
                debugLog.push('Retrying without sort params...');
                const fallbackUrl = `${auth.apiDomain}/inventory/v1/items?organization_id=${organizationId}&page=1&per_page=200`;
                const fallbackResponse = await fetch(fallbackUrl, {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${auth.accessToken}`,
                    },
                    cache: 'no-store',
                });

                if (!fallbackResponse.ok) {
                    const fallbackError = await fallbackResponse.text();
                    return NextResponse.json({
                        error: 'Zoho Inventory API error',
                        details: fallbackError.substring(0, 300),
                        log: debugLog
                    }, { status: 500 });
                }

                const fallbackResult = await fallbackResponse.json();
                const fallbackItems = fallbackResult.items || [];
                debugLog.push(`Fallback fetched ${fallbackItems.length} items (no sort)`);

                // Since we can't sort, just sync ALL items from the response
                return await syncItems(fallbackItems, supabase, auth, organizationId, debugLog);
            }

            return NextResponse.json({
                error: 'Zoho Inventory API error',
                details: errorText.substring(0, 300),
                log: debugLog
            }, { status: 500 });
        }

        const result = await response.json();
        const allItems = result.items || [];
        debugLog.push(`Fetched ${allItems.length} items from Inventory API`);

        // Filter by modification time (client-side)
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        const recentItems = allItems.filter((item: any) => {
            if (!item.last_modified_time) return false;
            const itemTime = new Date(item.last_modified_time).getTime();
            return itemTime >= cutoffTime;
        });

        debugLog.push(`${recentItems.length} items modified in last ${hours} hours`);

        if (recentItems.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No items modified recently',
                itemsProcessed: 0,
                log: debugLog
            });
        }

        return await syncItems(recentItems, supabase, auth, organizationId, debugLog);

    } catch (error) {
        console.error('Sync Recent Error:', error);
        return NextResponse.json({
            error: 'Sync failed',
            details: error instanceof Error ? error.message : 'Unknown',
            log: debugLog
        }, { status: 500 });
    }
}

async function syncItems(
    items: any[],
    supabase: any,
    auth: { accessToken: string; apiDomain: string },
    organizationId: string,
    debugLog: string[]
) {
    // Pre-fetch warehouse map (by code, id, AND zoho_warehouse_id)
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

    // Sync each item using the SAME syncItemStock function as the webhook
    let processedCount = 0;
    for (const item of items) {
        const zohoId = item.item_id;
        if (!zohoId) continue;
        await syncItemStock(zohoId, supabase, warehouseMap, debugLog);
        processedCount++;
    }

    return NextResponse.json({
        success: true,
        itemsProcessed: processedCount,
        message: `Synced ${processedCount} items`,
        log: debugLog
    });
}
