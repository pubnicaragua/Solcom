import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');

    const supabase = createServerClient();
    const startDate = subDays(new Date(), days).toISOString();

    const { data: snapshots } = await supabase
      .from('stock_snapshots')
      .select(`
        qty,
        synced_at,
        item_id,
        items (name, sku, category)
      `)
      .gte('synced_at', startDate)
      .order('synced_at', { ascending: true });

    const movements = (snapshots || []).map((snapshot: any) => ({
      date: format(new Date(snapshot.synced_at), 'dd MMM yyyy', { locale: es }),
      product: snapshot.items?.name || 'Desconocido',
      sku: snapshot.items?.sku || '',
      category: snapshot.items?.category || 'Sin categoría',
      quantity: snapshot.qty,
      timestamp: snapshot.synced_at,
    }));

    const dailyTotals = movements.reduce((acc: any, mov) => {
      if (!acc[mov.date]) {
        acc[mov.date] = 0;
      }
      acc[mov.date] += mov.quantity;
      return acc;
    }, {});

    return NextResponse.json({
      movements,
      dailyTotals,
      period: `${days} días`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error fetching stock movements' },
      { status: 500 }
    );
  }
}
