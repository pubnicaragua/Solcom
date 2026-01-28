import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export async function GET() {
  try {
    const supabase = createServerClient();

    const [itemsResult, warehousesResult, snapshotsResult] = await Promise.all([
      supabase.from('items').select('id', { count: 'exact', head: true }),
      supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('stock_snapshots').select('qty, synced_at').order('synced_at', { ascending: false }).limit(1),
    ]);

    const totalUnitsResult = await supabase
      .from('stock_snapshots')
      .select('qty');

    const totalUnits = (totalUnitsResult.data || []).reduce((sum: number, row: any) => sum + (row.qty || 0), 0);

    const lastSync = (snapshotsResult.data as any)?.[0]?.synced_at
      ? format(new Date((snapshotsResult.data as any)[0].synced_at), "dd MMM yyyy, HH:mm", { locale: es })
      : 'Nunca';

    return NextResponse.json({
      totalSKUs: itemsResult.count || 0,
      totalUnits,
      activeWarehouses: warehousesResult.count || 0,
      lastSync,
    });
  } catch (error) {
    console.error('KPIs error:', error);
    return NextResponse.json(
      { error: 'Error al obtener KPIs' },
      { status: 500 }
    );
  }
}
