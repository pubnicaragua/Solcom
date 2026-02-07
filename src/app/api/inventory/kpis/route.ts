import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerClient();

    const [warehousesResult, snapshotsResult] = await Promise.all([
      supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('stock_snapshots').select('qty, synced_at').order('synced_at', { ascending: false }).limit(1),
    ]);

    // Contar ítems y sumar stock en el mismo bucle paginado (evita count inexacto en Vercel/edge)
    const pageSize = 1000;
    let from = 0;
    let totalStock = 0;
    let totalProducts = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('items')
        .select('stock_total')
        .range(from, from + pageSize - 1);

      if (error) {
        throw error;
      }

      const batch = data || [];
      totalProducts += batch.length;
      totalStock += batch.reduce((sum: number, row: any) => sum + (row.stock_total || 0), 0);

      if (batch.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
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
        activeWarehouses: warehousesResult.count || 0,
        lastSync,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Error al obtener KPIs' },
      { status: 500 }
    );
  }
}
