import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = createServerClient();

        // Fetch synchronized data from Supabase
        // We fetch count first to know how many pages
        const [warehousesResult, snapshotsResult, countResult] = await Promise.all([
            supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('active', true),
            supabase.from('stock_snapshots').select('synced_at').order('synced_at', { ascending: false }).limit(1),
            supabase.from('items').select('*', { count: 'exact', head: true }),
        ]);

        let totalStock = 0;
        let totalValue = 0;
        let totalProducts = countResult.count || 0;

        // Fetch all items in batches of 1000 (Supabase default limit)
        const batchSize = 1000;
        const batches = Math.ceil(totalProducts / batchSize);
        const itemPromises = [];

        for (let i = 0; i < batches; i++) {
            const from = i * batchSize;
            const to = from + batchSize - 1;
            itemPromises.push(
                supabase.from('items').select('stock_total, price').range(from, to)
            );
        }

        const itemBatches = await Promise.all(itemPromises);

        for (const batch of itemBatches) {
            if (batch.data) {
                for (const item of batch.data) {
                    const stock = item.stock_total || 0;
                    const price = item.price || 0;
                    totalStock += stock;
                    totalValue += (stock * price);
                }
            }
        }

        const lastSync = (snapshotsResult.data as any)?.[0]?.synced_at
            ? format(new Date((snapshotsResult.data as any)[0].synced_at), "dd MMM yyyy, HH:mm", { locale: es })
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
