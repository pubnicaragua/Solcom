import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params;
    if (!itemId) {
      return NextResponse.json({ error: 'itemId requerido' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Obtener todas las bodegas (activas e inactivas) para no ocultar stock
    const { data: allWarehouses, error: whError } = await supabase
      .from('warehouses')
      .select('id, code, name, active')
      .order('code');

    if (whError) {
      return NextResponse.json({ error: whError.message }, { status: 500 });
    }

    // Stock de este ítem por bodega (puede que solo existan filas para algunas bodegas)
    const { data: snapshots, error: snapError } = await supabase
      .from('stock_snapshots')
      .select('warehouse_id, qty')
      .eq('item_id', itemId);

    if (snapError) {
      return NextResponse.json({ error: snapError.message }, { status: 500 });
    }

    const qtyByWarehouse = new Map<string, number>();
    for (const row of snapshots || []) {
      const current = qtyByWarehouse.get(row.warehouse_id) ?? 0;
      qtyByWarehouse.set(row.warehouse_id, current + (row.qty ?? 0));
    }

    // Una entrada por bodega; 0 si no hay snapshot
    const warehouses = (allWarehouses || []).map((w: any) => ({
      id: w.id,
      code: w.code ?? '',
      name: w.name ?? w.code ?? '',
      active: w.active,
      qty: qtyByWarehouse.get(w.id) ?? 0,
    }))
      // Filtrar: mostrar si está activa O si tiene stock (aunque esté inactiva)
      .filter((w) => w.active || w.qty !== 0)
      // Ordenar: primero activas, luego por cantidad descendente
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return b.qty - a.qty;
      });

    return NextResponse.json({ warehouses });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 }
    );
  }
}
