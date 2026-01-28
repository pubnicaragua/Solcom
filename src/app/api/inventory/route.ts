import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const warehouse = searchParams.get('warehouse') || '';
    const state = searchParams.get('state') || '';

    const supabase = createServerClient();
    const offset = (page - 1) * limit;

    let query = supabase
      .from('stock_snapshots')
      .select(`
        id,
        qty,
        synced_at,
        warehouses!inner(code, name),
        items!inner(sku, name, color, state)
      `, { count: 'exact' });

    if (search) {
      query = query.or(`items.name.ilike.%${search}%,items.sku.ilike.%${search}%`);
    }

    if (warehouse) {
      query = query.eq('warehouses.code', warehouse);
    }

    if (state) {
      query = query.eq('items.state', state);
    }

    const { data, error, count } = await query
      .order('synced_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const formattedData = (data || []).map((row: any) => ({
      id: row.id,
      item_name: row.items.name,
      color: row.items.color,
      state: row.items.state,
      sku: row.items.sku,
      warehouse_code: row.warehouses.code,
      warehouse_name: row.warehouses.name,
      qty: row.qty,
      synced_at: row.synced_at,
    }));

    return NextResponse.json({
      data: formattedData,
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error('Inventory error:', error);
    return NextResponse.json(
      { error: 'Error al obtener inventario' },
      { status: 500 }
    );
  }
}
