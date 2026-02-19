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

    if (format === 'pdf') {
      const escapeHtml = (value: unknown) =>
        String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

      const filterLabels: Record<string, string> = {
        search: 'Búsqueda',
        warehouse: 'Bodega',
        category: 'Categoría',
        state: 'Estado',
        stockLevel: 'Nivel de stock',
        priceRange: 'Rango de precio',
        marca: 'Marca',
        color: 'Color',
      };

      const activeFilters = Object.entries(filterLabels)
        .map(([key, label]) => {
          const value = searchParams.get(key);
          if (!value) return null;
          return `<span class="chip"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`;
        })
        .filter(Boolean)
        .join('');

      const warehouseTotals = warehouses.map((warehouse) => {
        const total = items.reduce((sum: number, item: any) => sum + Number(item.warehouseQty?.[warehouse.code] || 0), 0);
        return { code: warehouse.code, total };
      });

      const grandTotal = rows.reduce((sum, row) => sum + Number(row.Total || 0), 0);

      const bodyRows = items
        .map((item: any, index: number) => {
          const locationBreakdown = warehouses
            .map((warehouse) => ({
              code: warehouse.code,
              qty: Number(item.warehouseQty?.[warehouse.code] || 0),
            }))
            .filter((location) => location.qty !== 0)
            .map((location) => `<span class="chip">${escapeHtml(location.code)}: <strong>${location.qty}</strong></span>`)
            .join(' ');

          return `
            <tr>
              <td class="num">${index + 1}</td>
              <td>${escapeHtml(item.sku || '-')}</td>
              <td class="product">${escapeHtml(item.name || '-')}</td>
              <td>${escapeHtml(item.brand || '-')}</td>
              <td>${escapeHtml(item.color || '-')}</td>
              <td>${escapeHtml(item.state || '-')}</td>
              <td class="num total">${Number(item.total || 0)}</td>
              <td class="num">${item.daysInStock == null ? '-' : Number(item.daysInStock)}</td>
              <td>${locationBreakdown || '<span class="muted">Sin stock por bodega</span>'}</td>
            </tr>
          `;
        })
        .join('');

      const warehouseSummary = warehouseTotals
        .map(
          (warehouse) => `
            <tr>
              <td>${escapeHtml(warehouse.code)}</td>
              <td class="num">${warehouse.total}</td>
            </tr>
          `
        )
        .join('');

      const generatedAt = new Date().toLocaleString('es-NI', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inventario - Exportación PDF</title>
    <style>
      :root {
        --text: #0f172a;
        --muted: #475569;
        --border: #cbd5e1;
        --panel: #f8fafc;
        --accent: #1d4ed8;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        color: var(--text);
        font: 12px/1.35 "Segoe UI", "Inter", "Helvetica Neue", Arial, sans-serif;
        background: #ffffff;
      }

      .page {
        padding: 14mm;
      }

      .header {
        margin-bottom: 14px;
        border-bottom: 2px solid #0f172a;
        padding-bottom: 10px;
      }

      .header-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .header-main {
        min-width: 0;
      }

      .brand-logo-wrap {
        flex-shrink: 0;
        padding: 6px 8px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: #ffffff;
      }

      .brand-logo {
        width: 120px;
        height: auto;
        display: block;
      }

      .title {
        margin: 0 0 4px;
        font-size: 20px;
        font-weight: 800;
      }

      .subtitle {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
      }

      .meta {
        margin-top: 8px;
        display: flex;
        gap: 14px;
        flex-wrap: wrap;
        color: var(--muted);
      }

      .chip-group {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border: 1px solid var(--border);
        background: #ffffff;
        border-radius: 999px;
        font-size: 11px;
      }

      .section-title {
        margin: 18px 0 8px;
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th, td {
        border: 1px solid var(--border);
        padding: 6px 8px;
        vertical-align: top;
      }

      th {
        background: #e2e8f0;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        text-align: left;
      }

      tr:nth-child(even) td {
        background: #f8fafc;
      }

      .num {
        text-align: right;
        white-space: nowrap;
      }

      .total {
        font-weight: 700;
        color: #0b3b8a;
      }

      .product {
        min-width: 220px;
      }

      .muted {
        color: var(--muted);
      }

      .summary-grid {
        display: grid;
        grid-template-columns: minmax(180px, 220px) 1fr;
        align-items: start;
        gap: 14px;
      }

      .summary-box {
        border: 1px solid var(--border);
        background: var(--panel);
        border-radius: 8px;
        padding: 10px;
      }

      .summary-box.kpi-box {
        padding: 8px 10px;
      }

      .kpi {
        margin: 0;
        display: grid;
        gap: 2px;
      }

      .kpi b {
        font-size: 16px;
        color: var(--accent);
        line-height: 1.1;
      }

      .footer {
        margin-top: 16px;
        color: var(--muted);
        font-size: 11px;
      }

      @page {
        size: A4 landscape;
        margin: 10mm;
      }

      @media print {
        .page { padding: 0; }
      }

      @media (max-width: 900px) {
        .summary-grid {
          grid-template-columns: 1fr;
        }

        .header-top {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="header">
        <div class="header-top">
          <div class="header-main">
            <h1 class="title">Inventario Completo</h1>
            <p class="subtitle">Reporte de existencias por producto y bodega (vista legible para PDF)</p>
            <div class="meta">
              <span><strong>Generado:</strong> ${escapeHtml(generatedAt)}</span>
              <span><strong>Productos:</strong> ${items.length}</span>
              <span><strong>Bodegas:</strong> ${warehouses.length}</span>
              <span><strong>Stock total:</strong> ${grandTotal}</span>
            </div>
          </div>
          <div class="brand-logo-wrap">
            <img
              class="brand-logo"
              src="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png"
              alt="Solis Comercial"
            />
          </div>
        </div>
        ${
          activeFilters
            ? `<div class="chip-group">${activeFilters}</div>`
            : '<div class="chip-group"><span class="chip">Sin filtros activos</span></div>'
        }
      </header>

      <section class="summary-grid">
        <div class="summary-box kpi-box">
          <p class="kpi"><span>Stock total consolidado</span><b>${grandTotal}</b></p>
        </div>
        <div class="summary-box">
          <table>
            <thead>
              <tr>
                <th>Bodega</th>
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>
              ${warehouseSummary}
            </tbody>
          </table>
        </div>
      </section>

      <h2 class="section-title">Detalle por producto</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>SKU</th>
            <th>Producto</th>
            <th>Marca</th>
            <th>Color</th>
            <th>Estado</th>
            <th class="num">Total</th>
            <th class="num">Remanente (d)</th>
            <th>Bodegas con stock</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows || '<tr><td colspan="9" class="muted">No hay datos para exportar.</td></tr>'}
        </tbody>
      </table>

      <p class="footer">Tip: en el cuadro de impresión selecciona “Guardar como PDF”.</p>
    </div>

    <script>
      window.addEventListener('load', function () {
        setTimeout(function () { window.print(); }, 250);
      });
    </script>
  </body>
</html>`;

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

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
