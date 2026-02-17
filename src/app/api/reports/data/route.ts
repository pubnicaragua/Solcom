import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category') || '';
        const marca = searchParams.get('marca') || '';
        const warehouse = searchParams.get('warehouse') || '';
        const state = searchParams.get('state') || '';
        const color = searchParams.get('color') || '';

        const supabase = createServerClient();

        // 1) Fetch items with filters (fast, no JOINs)
        let itemsQuery = supabase
            .from('items')
            .select('id, sku, name, category, marca, state, color, stock_total, price, updated_at')
            .is('zoho_removed_at', null);

        if (category) itemsQuery = itemsQuery.ilike('category', `%${category}%`);
        if (marca) itemsQuery = itemsQuery.eq('marca', marca);
        if (state) itemsQuery = itemsQuery.eq('state', state);
        if (color) itemsQuery = itemsQuery.ilike('color', `%${color}%`);

        // Paginate items
        let allItems: any[] = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await itemsQuery
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
                .order('name', { ascending: true });

            if (error) throw error;
            if (data && data.length > 0) {
                allItems = allItems.concat(data);
                if (data.length < PAGE_SIZE) hasMore = false;
                else page++;
            } else {
                hasMore = false;
            }
            if (page > 20) break;
        }

        // If filtering by warehouse, narrow items to those with stock in that warehouse
        if (warehouse) {
            const { data: whData } = await supabase
                .from('warehouses')
                .select('id')
                .eq('code', warehouse)
                .single();

            if (whData) {
                const itemIds = allItems.map(i => i.id);
                const BATCH = 200;
                const matchingItemIds = new Set<string>();

                for (let i = 0; i < itemIds.length; i += BATCH) {
                    const batch = itemIds.slice(i, i + BATCH);
                    const { data: snaps } = await supabase
                        .from('stock_snapshots')
                        .select('item_id')
                        .in('item_id', batch)
                        .eq('warehouse_id', whData.id)
                        .gt('qty', 0);

                    if (snaps) snaps.forEach(s => matchingItemIds.add(s.item_id));
                }

                allItems = allItems.filter(i => matchingItemIds.has(i.id));
            }
        }

        // 2) Fetch warehouses (fast)
        const { data: activeWh } = await supabase
            .from('warehouses').select('id, code, name').eq('active', true);
        const activeWarehouses = activeWh || [];

        // 3) Build filter options from ALL items (before warehouse filter)
        // Re-query without warehouse filter for filter options
        const categories = new Set<string>();
        const marcas = new Set<string>();
        const states = new Set<string>();
        const colors = new Set<string>();

        allItems.forEach((item: any) => {
            if (item.category) categories.add(item.category);
            if (item.marca) marcas.add(item.marca);
            if (item.state) states.add(item.state);
            if (item.color) colors.add(item.color);
        });

        const filterOptions = {
            categories: Array.from(categories).sort(),
            marcas: Array.from(marcas).sort(),
            warehouses: activeWarehouses.map(w => w.code).sort(),
            states: Array.from(states).sort(),
            colors: Array.from(colors).sort(),
        };

        // 4) KPI stats from items (instant, no Zoho call)
        let totalStock = 0;
        let totalValue = 0;
        let lowStockItems = 0;
        let outOfStockItems = 0;

        allItems.forEach((item: any) => {
            const stock = item.stock_total || 0;
            totalStock += stock;
            totalValue += stock * (item.price || 0);
            if (stock > 0 && stock < 10) lowStockItems++;
            if (stock === 0) outOfStockItems++;
        });

        // 5) Chart breakdowns from items (instant)
        const categoryBreakdown: Record<string, number> = {};
        const brandBreakdown: Record<string, { value: number; label: string }> = {};

        allItems.forEach((item: any) => {
            const cat = item.category || 'Sin categoría';
            const brandRaw = (item.marca || '').trim() || 'Sin marca';
            const brandKey = brandRaw.toUpperCase();
            const stock = item.stock_total || 0;

            categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + stock;
            if (!brandBreakdown[brandKey]) brandBreakdown[brandKey] = { value: 0, label: brandRaw };
            brandBreakdown[brandKey].value += stock;
        });

        // 6) Aging data (items with stock > 0 updated > 90 days ago)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const agingItems = allItems
            .filter((item: any) => {
                const stock = item.stock_total || 0;
                if (stock <= 0) return false;
                const lastUpdate = item.updated_at ? new Date(item.updated_at) : null;
                return lastUpdate && lastUpdate < ninetyDaysAgo;
            })
            .map((item: any) => {
                const lastUpdate = new Date(item.updated_at);
                const daysAgo = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
                return { id: item.id, sku: item.sku, name: item.name, category: item.category, stock_total: item.stock_total, price: item.price, updated_at: item.updated_at, daysAgo };
            })
            .sort((a: any, b: any) => b.daysAgo - a.daysAgo)
            .slice(0, 100);

        const agingTotalUnits = agingItems.reduce((sum: number, i: any) => sum + (i.stock_total || 0), 0);
        const agingTotalValue = agingItems.reduce((sum: number, i: any) => sum + ((i.stock_total || 0) * (i.price || 0)), 0);

        // Format chart data
        const categoryChartData = Object.entries(categoryBreakdown)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);

        const brandChartData = Object.values(brandBreakdown)
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        return NextResponse.json({
            stats: {
                totalProducts: allItems.length,
                totalStock,
                totalValue,
                lowStockItems,
                outOfStockItems,
                activeWarehouses: activeWarehouses.length,
            },
            charts: {
                categoryBreakdown: categoryChartData,
                brandBreakdown: brandChartData,
            },
            filterOptions,
            aging: {
                items: agingItems,
                totalUnits: agingTotalUnits,
                totalValue: agingTotalValue,
            },
            sinMarcaCount: allItems.filter((i: any) => !(i.marca || '').trim()).length,
        });
    } catch (error) {
        console.error('Reports data error:', error);
        return NextResponse.json(
            { error: 'Error al obtener datos de reportes', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
