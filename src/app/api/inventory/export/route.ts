import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const search = searchParams.get('search') || '';
    const warehouse = searchParams.get('warehouse') || '';
    const state = searchParams.get('state') || '';

    const supabase = createServerClient();

    let query = supabase
      .from('stock_snapshots')
      .select(`
        qty,
        synced_at,
        warehouses!inner(code, name),
        items!inner(sku, name, color, state, category)
      `);

    if (search) {
      query = query.or(`items.name.ilike.%${search}%,items.sku.ilike.%${search}%`);
    }

    if (warehouse) {
      query = query.eq('warehouses.code', warehouse);
    }

    if (state) {
      query = query.eq('items.state', state);
    }

    const { data, error } = await query.order('synced_at', { ascending: false });

    if (error) throw error;

    const csvRows = [
      ['SKU', 'Producto', 'Categoría', 'Color', 'Estado', 'Bodega', 'Stock', 'Actualizado'].join(','),
    ];

    (data || []).forEach((row: any) => {
      csvRows.push([
        row.items.sku,
        `"${row.items.name}"`,
        `"${row.items.category || 'Sin categoría'}"`,
        `"${row.items.color || ''}"`,
        `"${row.items.state || ''}"`,
        `"${row.warehouses.code} - ${row.warehouses.name}"`,
        row.qty,
        new Date(row.synced_at).toLocaleString('es-NI'),
      ].join(','));
    });

    const csv = csvRows.join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="inventario_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error al exportar inventario' },
      { status: 500 }
    );
  }
}
