import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('stock_movements')
      .select(`
        id,
        quantity,
        reason,
        status,
        movement_type,
        created_at,
        items!inner(sku, name),
        from_warehouse:warehouses!stock_movements_from_warehouse_id_fkey(code, name),
        to_warehouse:warehouses!stock_movements_to_warehouse_id_fkey(code, name)
      `)
      .eq('movement_type', 'transfer')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    const formatted = (data || []).map((row: any) => ({
      id: row.id,
      quantity: row.quantity,
      reason: row.reason,
      status: row.status,
      created_at: row.created_at,
      item_name: row.items?.name,
      sku: row.items?.sku,
      from_code: row.from_warehouse?.code,
      from_name: row.from_warehouse?.name,
      to_code: row.to_warehouse?.code,
      to_name: row.to_warehouse?.name,
    }));

    return NextResponse.json({
      data: formatted,
    });
  } catch (error) {
    console.error('Transfers error:', error);
    return NextResponse.json(
      { error: 'Error al obtener transferencias', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
