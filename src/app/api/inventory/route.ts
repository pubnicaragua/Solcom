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
    const category = searchParams.get('category') || '';
    const stockLevel = searchParams.get('stockLevel') || '';
    const sortBy = searchParams.get('sortBy') || 'name';

    const supabase = createServerClient();
    const offset = (page - 1) * limit;

    let query = supabase
      .from('stock_snapshots')
      .select(`
        id,
        qty,
        synced_at,
        warehouses!inner(code, name),
        items!inner(sku, name, color, state, category)
      `, { count: 'exact' });



    // Search filter (name or SKU)
    // For joined tables with !inner, we can filter directly using the table.column syntax
    if (search) {
      // Note: OR on foreign tables is tricky. We'll filter on items table columns.
      // Using textSearch pattern
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`, { referencedTable: 'items' });
    }

    // Warehouse filter
    if (warehouse) {
      query = query.eq('warehouses.code', warehouse);
    }

    // State filter (nuevo, usado) - filter on items table
    if (state) {
      query = query.eq('items.state', state);
    }

    // Category filter - use ilike for partial/case-insensitive matching
    if (category) {
      query = query.ilike('items.category', `%${category}%`);
    }

    // Stock level filter
    if (stockLevel) {
      switch (stockLevel) {
        case 'out':
          query = query.eq('qty', 0);
          break;
        case 'critical':
          query = query.gte('qty', 1).lte('qty', 5);
          break;
        case 'low':
          query = query.gte('qty', 6).lte('qty', 20);
          break;
        case 'medium':
          query = query.gte('qty', 21).lte('qty', 50);
          break;
        case 'high':
          query = query.gt('qty', 50);
          break;
      }
    }

    // Sorting


    let orderConfig: { column: string, options?: { ascending: boolean, foreignTable?: string } } = {
      column: 'synced_at',
      options: { ascending: false }
    };

    switch (sortBy) {
      case 'name':
        orderConfig = { column: 'synced_at', options: { ascending: true } };
        break;
      case 'name_desc':
        orderConfig = { column: 'synced_at', options: { ascending: false } };
        break;
      case 'stock_asc':
        orderConfig = { column: 'qty', options: { ascending: true } };
        break;
      case 'stock_desc':
        orderConfig = { column: 'qty', options: { ascending: false } };
        break;
      case 'updated':
        orderConfig = { column: 'synced_at', options: { ascending: false } };
        break;
      default:
        orderConfig = { column: 'synced_at', options: { ascending: false } };
    }

    const { data, error, count } = await query
      .order(orderConfig.column, orderConfig.options)
      .range(offset, offset + limit - 1);


    if (error) throw error;

    const formattedData = (data || []).map((row: any) => ({
      id: row.id,
      item_name: row.items.name,
      color: row.items.color,
      state: row.items.state,
      sku: row.items.sku,
      category: row.items.category || null,
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
      { error: 'Error al obtener inventario', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
