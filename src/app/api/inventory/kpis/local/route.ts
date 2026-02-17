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

        // Keep KPI count aligned with pivot:
        // - exclude soft-removed items (zoho_removed_at is null)
        // - deduplicate by SKU, preferring records linked to Zoho.
        const batchSize = 1000;
        let page = 0;
        let hasMore = true;
        let canFilterRemoved = true;
        const skuMap = new Map<string, { stock_total: number; price: number; zoho_item_id?: string | null }>();

        while (hasMore) {
            const from = page * batchSize;
            const to = from + batchSize - 1;
            let query = supabase
                .from('items')
                .select('sku, stock_total, price, zoho_item_id')
                .order('id', { ascending: true })
                .range(from, to);

            if (canFilterRemoved) {
                query = query.is('zoho_removed_at', null);
            }

            let { data, error } = await query;

            if (error && canFilterRemoved && String(error.message || '').toLowerCase().includes('zoho_removed_at')) {
                // Backward compatibility for environments without this column.
                canFilterRemoved = false;
                ({ data, error } = await supabase
                    .from('items')
                    .select('sku, stock_total, price, zoho_item_id')
                    .order('id', { ascending: true })
                    .range(from, to));
            }

            if (error) {
                console.error('[KPIs local] items page error:', error);
                break;
            }

            const rows = data || [];
            for (const item of rows) {
                const sku = String(item.sku || '').trim();
                if (!sku) continue;
                const existing = skuMap.get(sku);
                if (!existing) {
                    skuMap.set(sku, {
                        stock_total: Number(item.stock_total || 0),
                        price: Number(item.price || 0),
                        zoho_item_id: item.zoho_item_id || null,
                    });
                    continue;
                }

                // Keep the row linked to Zoho when duplicates exist.
                if (!existing.zoho_item_id && item.zoho_item_id) {
                    skuMap.set(sku, {
                        stock_total: Number(item.stock_total || 0),
                        price: Number(item.price || 0),
                        zoho_item_id: item.zoho_item_id || null,
                    });
                }
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

        for (const item of skuMap.values()) {
            totalProducts += 1;
            totalStock += Number(item.stock_total || 0);
            totalValue += Number(item.stock_total || 0) * Number(item.price || 0);
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
                    deduplicatedBySku: true,
                    canFilterRemoved,
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
