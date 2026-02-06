import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerClient();

    const [itemsResult, stockResult, warehousesResult] = await Promise.all([
      supabase.from('items').select('id, category', { count: 'exact' }),
      supabase.from('stock_snapshots').select('qty, item_id, warehouse_id'),
      supabase.from('warehouses').select('id, code, name').eq('active', true),
    ]);

    const totalProducts = itemsResult.count || 0;
    const totalStock = (stockResult.data || []).reduce((sum, row) => sum + (row.qty || 0), 0);

    const categoryBreakdown = (itemsResult.data || []).reduce((acc: any, item) => {
      const cat = item.category || 'Sin categoría';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const warehouseStock = (stockResult.data || []).reduce((acc: any, snapshot) => {
      const warehouseId = snapshot.warehouse_id;
      if (!acc[warehouseId]) {
        acc[warehouseId] = { total: 0, items: 0 };
      }
      acc[warehouseId].total += snapshot.qty || 0;
      acc[warehouseId].items += 1;
      return acc;
    }, {});

    const warehouseData = (warehousesResult.data || []).map(warehouse => ({
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      totalStock: warehouseStock[warehouse.id]?.total || 0,
      totalItems: warehouseStock[warehouse.id]?.items || 0,
    }));

    const lowStockItems = (stockResult.data || [])
      .filter(s => s.qty < 10)
      .length;

    const outOfStockItems = (stockResult.data || [])
      .filter(s => s.qty === 0)
      .length;

    return NextResponse.json({
      totalProducts,
      totalStock,
      lowStockItems,
      outOfStockItems,
      categoryBreakdown,
      warehouseData,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error fetching report data' },
      { status: 500 }
    );
  }
}
