import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'csv').toLowerCase();

    const pivotParams = new URLSearchParams();
    ['search', 'warehouse', 'category', 'state', 'stockLevel', 'priceRange', 'marca', 'color', 'sortBy'].forEach((key) => {
      const value = searchParams.get(key);
      if (value) pivotParams.set(key, value);
    });
    pivotParams.set('showZeroStock', 'true');

    const pivotUrl = `${new URL(request.url).origin}/api/inventory/pivot?${pivotParams.toString()}`;
    const pivotRes = await fetch(pivotUrl, { cache: 'no-store' });
    if (!pivotRes.ok) {
      throw new Error(`Pivot export error ${pivotRes.status}`);
    }

    const pivot = await pivotRes.json();
    const warehouses: Array<{ code: string; name: string }> = pivot?.warehouses || [];
    const items: Array<any> = pivot?.items || [];

    const columns = [
      'SKU',
      'Producto',
      'Categoría',
      'Marca',
      'Color',
      'Estado',
      ...warehouses.map((w) => `Bodega ${w.code}`),
      'Total',
      'Remanente (días)',
    ];

    const rows = items.map((item: any) => {
      const row: Record<string, string | number> = {
        SKU: item.sku || '',
        Producto: item.name || '',
        Categoría: item.category || '',
        Marca: item.brand || '',
        Color: item.color || '',
        Estado: item.state || '',
      };

      warehouses.forEach((w) => {
        row[`Bodega ${w.code}`] = Number(item.warehouseQty?.[w.code] || 0);
      });

      row.Total = Number(item.total || 0);
      row['Remanente (días)'] = item.daysInStock == null ? '' : Number(item.daysInStock);
      return row;
    });

    if (format === 'json') {
      return NextResponse.json({ columns, rows });
    }

    const csvRows = [columns.join(',')];
    rows.forEach((row) => {
      csvRows.push(
        columns
          .map((col) => {
            const value = row[col] ?? '';
            const raw = String(value);
            return `"${raw.replace(/"/g, '""')}"`;
          })
          .join(',')
      );
    });

    const csv = `\uFEFF${csvRows.join('\n')}`;
    const filenameBase = `inventario_completo_${new Date().toISOString().split('T')[0]}`;
    const ext = format === 'excel' ? 'csv' : format;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.${ext}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error al exportar inventario' },
      { status: 500 }
    );
  }
}
