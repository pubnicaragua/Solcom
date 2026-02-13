import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function isMissingRelationError(error: any): boolean {
  return String(error?.code || '') === '42P01';
}

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

    const qtyByWarehouse = new Map<string, number>();

    // Prefer v2 balance model
    try {
      const { data: balances, error: balanceError } = await (supabase.from as any)('inventory_balance')
        .select('warehouse_id, qty_on_hand')
        .eq('item_id', itemId);

      if (balanceError) {
        if (!isMissingRelationError(balanceError)) {
          return NextResponse.json({ error: balanceError.message }, { status: 500 });
        }
      } else {
        for (const row of balances || []) {
          qtyByWarehouse.set(row.warehouse_id, Number(row.qty_on_hand ?? 0));
        }
      }
    } catch (error: any) {
      if (!isMissingRelationError(error)) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Legacy fallback if balance is not available
    if (qtyByWarehouse.size === 0) {
      const { data: snapshots, error: snapError } = await supabase
        .from('stock_snapshots')
        .select('warehouse_id, qty, synced_at')
        .eq('item_id', itemId)
        .order('synced_at', { ascending: false });

      if (snapError) {
        return NextResponse.json({ error: snapError.message }, { status: 500 });
      }

      for (const row of snapshots || []) {
        if (!qtyByWarehouse.has(row.warehouse_id)) {
          qtyByWarehouse.set(row.warehouse_id, Number(row.qty ?? 0));
        }
      }
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
