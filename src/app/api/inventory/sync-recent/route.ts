import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { syncItemStock } from '@/lib/zoho/sync-logic';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24');
    const debugLog: string[] = [];

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const zohoClient = createZohoBooksClient();
        if (!zohoClient) {
            return NextResponse.json({ error: 'Zoho not configured' }, { status: 500 });
        }

        // Calculate timestamp for last_modified_time
        const now = new Date();
        const past = new Date(now.getTime() - (hours * 60 * 60 * 1000));
        // Zoho format fallback: YYYY-MM-DD (safest)
        const timestamp = past.toISOString().split('T')[0];

        // STRATEGY CHANGE: Zoho API rejects last_modified_time filter often.
        // Instead, fetch most recently modified items (sort_column=last_modified_time&sort_order=desc)
        // and filter them manually in the loop.
        debugLog.push(`Fetching items sorted by last_modified_time desc`);

        // Fetch first page (200 items) sorted by modification time
        const items = await zohoClient.fetchItems('sort_column=last_modified_time&sort_order=desc');
        debugLog.push(`fetched ${items.length} items from Zoho`);

        const cutoffTime = past.getTime();
        const itemsToSync = items.filter(item => {
            const itemTime = new Date(item.last_modified_time).getTime();
            return itemTime >= cutoffTime;
        });

        debugLog.push(`Found ${itemsToSync.length} items modified after ${past.toISOString()}`);

        if (itemsToSync.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No items modified recently',
                itemsProcessed: 0,
                log: debugLog
            });
        }

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

        // Sync each item
        let processedCount = 0;
        for (const item of itemsToSync) {
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

    } catch (error) {
        console.error('Sync Recent Error:', error);
        return NextResponse.json({
            error: 'Sync failed',
            details: error instanceof Error ? error.message : 'Unknown',
            log: debugLog
        }, { status: 500 });
    }
}
