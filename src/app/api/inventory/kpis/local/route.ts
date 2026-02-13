import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = createServerClient();

        // Keep queries cheap and resilient under load.
        const [warehousesResult, snapshotsResult, balanceSyncResult] = await Promise.all([
            supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('active', true),
            supabase.from('stock_snapshots').select('synced_at').order('synced_at', { ascending: false }).limit(1),
            // v2 model compatibility: if inventory_balance exists, this gives a fresher sync marker.
            (supabase.from as any)('inventory_balance')
                .select('updated_at')
                .order('updated_at', { ascending: false })
                .limit(1),
        ]);

        let totalStock = 0;
        let totalValue = 0;
        let totalProducts = 0;

        // Avoid expensive exact count. Iterate pages until exhausted.
        const batchSize = 1000;
        let page = 0;
        let hasMore = true;

        while (hasMore) {
            const from = page * batchSize;
            const to = from + batchSize - 1;
            const { data, error } = await supabase
                .from('items')
                .select('stock_total, price')
                .order('id', { ascending: true })
                .range(from, to);

            if (error) {
                console.error('[KPIs local] items page error:', error);
                break;
            }

            const rows = data || [];
            for (const item of rows) {
                totalProducts += 1;
                const stock = Number(item.stock_total || 0);
                const price = Number(item.price || 0);
                totalStock += stock;
                totalValue += (stock * price);
            }

            if (rows.length < batchSize) {
                hasMore = false;
            } else {
                page += 1;
            }
            if (page > 200) {
                // Safety cap (200k rows).
                hasMore = false;
            }
        }

        const balanceUpdatedAt = (balanceSyncResult as any)?.data?.[0]?.updated_at || null;
        const snapshotSyncedAt = (snapshotsResult.data as any)?.[0]?.synced_at || null;
        const lastSyncTs = balanceUpdatedAt || snapshotSyncedAt;

        const lastSync = lastSyncTs
            ? format(new Date(lastSyncTs), "dd MMM yyyy, HH:mm", { locale: es })
            : 'Nunca';

        return NextResponse.json(
            {
                totalSKUs: totalProducts,
                totalProducts,
                totalStock,
                totalValue,
                activeWarehouses: warehousesResult.count || 0,
                lastSync,
                source: 'supabase', // Changed source to indicate local DB
                debug: {
                    message: 'KPIs calculated from local Supabase DB for performance',
                    itemsCount: totalProducts,
                    pagesRead: page + 1,
                    balanceSyncAvailable: !!balanceUpdatedAt,
                    calculationTime: new Date().toISOString()
                }
            },
            {
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                    Pragma: 'no-cache',
                },
            }
        );
    } catch (error) {
        console.error('[KPIs] Error:', error);
        return NextResponse.json(
            { error: 'Error al obtener KPIs' },
            { status: 500 }
        );
    }
}
