import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const supabase = createServerClient();

        // ── 1. Metadata: warehouses & last sync ──
        const [warehousesResult, snapshotsResult, balanceSyncResult] = await Promise.all([
            supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('active', true),
            supabase.from('stock_snapshots').select('synced_at').order('synced_at', { ascending: false }).limit(1),
            (supabase.from as any)('inventory_balance')
                .select('updated_at')
                .order('updated_at', { ascending: false })
                .limit(1),
        ]);

        // ── 2. Get product count (deduplicated by SKU) ──
        const batchSize = 1000;
        let page = 0;
        let hasMore = true;
        let canFilterRemoved = true;
        const skuSet = new Set<string>();

        while (hasMore) {
            const from = page * batchSize;
            const to = from + batchSize - 1;
            let query = supabase
                .from('items')
                .select('sku')
                .order('id', { ascending: true })
                .range(from, to);

            if (canFilterRemoved) {
                query = query.is('zoho_removed_at', null);
            }

            let { data, error } = await query;

            if (error && canFilterRemoved && String(error.message || '').toLowerCase().includes('zoho_removed_at')) {
                canFilterRemoved = false;
                ({ data, error } = await supabase
                    .from('items')
                    .select('sku')
                    .order('id', { ascending: true })
                    .range(from, to));
            }

            if (error) { console.error('[KPIs] items page error:', error); break; }

            for (const item of data || []) {
                const sku = String(item.sku || '').trim();
                if (sku) skuSet.add(sku);
            }

            hasMore = (data || []).length >= batchSize;
            page++;
            if (page > 200) break;
        }

        const totalProducts = skuSet.size;

        // ── 3. Calculate totalStock from Pivot endpoint (SINGLE SOURCE OF TRUTH) ──
        //
        // By calling the Pivot endpoint (with showZeroStock=true to include ALL items),
        // we guarantee the KPI Total Stock ALWAYS matches the Pivot GRAN TOTAL.
        // This eliminates any possibility of divergence between the two values.

        let totalStock = 0;
        let totalValue = 0;
        let pivotModel = 'unknown';
        try {
            const origin = new URL(request.url).origin;
            const pivotUrl = `${origin}/api/inventory/pivot?showZeroStock=true`;
            const pivotRes = await fetch(pivotUrl, {
                headers: { 'Cache-Control': 'no-cache' },
                cache: 'no-store',
            });

            if (pivotRes.ok) {
                const pivotData = await pivotRes.json();
                pivotModel = pivotData.model || 'unknown';

                for (const item of pivotData.items || []) {
                    totalStock += (item.total ?? 0);
                    totalValue += (item.total ?? 0) * (item.price ?? 0);
                }
            } else {
                console.error('[KPIs] Pivot fetch error:', pivotRes.status, await pivotRes.text());
                // Fallback: compute from inventory_balance directly
                totalStock = await fallbackStockCalculation(supabase);
            }
        } catch (pivotError) {
            console.error('[KPIs] Pivot call failed:', pivotError);
            totalStock = await fallbackStockCalculation(supabase);
        }

        // ── 4. Last sync ──
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
                source: pivotModel,
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
        return NextResponse.json({ error: 'Error al obtener KPIs' }, { status: 500 });
    }
}

/**
 * Fallback: sum inventory_balance directly (if Pivot is unreachable).
 */
async function fallbackStockCalculation(supabase: any): Promise<number> {
    let total = 0;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        const from = page * 1000;
        const to = from + 999;
        const { data, error } = await (supabase.from as any)('inventory_balance')
            .select('qty_on_hand')
            .range(from, to);

        if (error) { console.error('[KPIs fallback] balance error:', error); break; }

        for (const row of data || []) {
            total += (row.qty_on_hand ?? 0);
        }

        hasMore = (data || []).length >= 1000;
        page++;
        if (page > 200) break;
    }

    return total;
}
