import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerClient();

    const [itemsResult, warehousesResult, snapshotsResult] = await Promise.all([
      supabase.from('items').select('id', { count: 'exact', head: true }),
      supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('stock_snapshots').select('qty, synced_at').order('synced_at', { ascending: false }).limit(1),
    ]);

    // Supabase returns max 1000 rows by default. Fetch all items to sum stock_total.
    // Ideally we would use an RPC function or the new Aggregate functions if available.
    const { data: allItems } = await supabase
      .from('items')
      .select('stock_total')
      .range(0, 99999);

    const totalStock = (allItems || []).reduce((sum: number, row: any) => sum + (row.stock_total || 0), 0);

    const totalProducts = itemsResult.count || 0;

    const lastSync = (snapshotsResult.data as any)?.[0]?.synced_at
      ? format(new Date((snapshotsResult.data as any)[0].synced_at), "dd MMM yyyy, HH:mm", { locale: es })
      : 'Nunca';

    return NextResponse.json({
      totalSKUs: itemsResult.count || 0,
      totalProducts,
      totalStock,
      activeWarehouses: warehousesResult.count || 0,
      lastSync,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error al obtener KPIs' },
      { status: 500 }
    );
  }
}
