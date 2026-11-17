import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { getAuthenticatedProfile } from '@/lib/auth/warehouse-permissions';
import {
  getEffectiveModuleAccess,
  hasModuleAccess,
  hasRolePermissionCode,
} from '@/lib/auth/module-permissions';

export const dynamic = 'force-dynamic';

const EXCEL_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const EXCEL_THEME = {
  brand: 'FFC91F2B',
  navy: 'FF14213D',
  navyLight: 'FFEAF0F8',
  text: 'FF172033',
  muted: 'FF5B687A',
  border: 'FFD8E0EA',
  surface: 'FFF7F9FC',
  white: 'FFFFFFFF',
  success: 'FF15803D',
  warning: 'FFB45309',
};

function excelColumnLetter(columnNumber: number): string {
  let result = '';
  let current = columnNumber;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function setExcelBorder(cell: ExcelJS.Cell, color = EXCEL_THEME.border) {
  cell.border = {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  };
}

function styleExcelHeader(row: ExcelJS.Row) {
  row.height = 25;
  row.eachCell((cell) => {
    cell.font = { name: 'Aptos Display', size: 10, bold: true, color: { argb: EXCEL_THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_THEME.navy } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    setExcelBorder(cell, EXCEL_THEME.navy);
  });
}

function styleExcelDataRow(row: ExcelJS.Row, rowNumber: number) {
  row.height = 20;
  row.eachCell((cell) => {
    cell.font = { name: 'Aptos', size: 10, color: { argb: EXCEL_THEME.text } };
    cell.alignment = { vertical: 'middle' };
    if (rowNumber % 2 === 0) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_THEME.surface } };
    }
    setExcelBorder(cell);
  });
}

function activeInventoryFilters(searchParams: URLSearchParams): Array<[string, string]> {
  const labels: Record<string, string> = {
    search: 'Búsqueda',
    warehouse: 'Bodega',
    category: 'Categoría',
    state: 'Estado',
    stockLevel: 'Nivel de stock',
    priceRange: 'Rango de precio',
    marca: 'Marca',
    color: 'Color',
  };

  return Object.entries(labels)
    .map(([key, label]) => {
      const value = searchParams.get(key)?.trim();
      return value ? ([label, value] as [string, string]) : null;
    })
    .filter((value): value is [string, string] => Boolean(value));
}

async function buildInventoryWorkbook({
  warehouses,
  items,
  pivot,
  searchParams,
}: {
  warehouses: Array<{ code: string; name: string }>;
  items: Array<any>;
  pivot: any;
  searchParams: URLSearchParams;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Solis Comercial ERP';
  workbook.lastModifiedBy = 'Solis Comercial ERP';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const detailSheet = workbook.addWorksheet('Inventario');
  const summarySheet = workbook.addWorksheet('Resumen');
  const generatedAt = new Date();
  const filters = activeInventoryFilters(searchParams);

  const detailHeaders = [
    'SKU',
    'ID de Zoho',
    'Producto',
    'Categoría',
    'Marca',
    'Color',
    'Estado',
    ...warehouses.map((warehouse) => `Bodega ${warehouse.code}`),
    'Total fuente',
    'Total bodegas visibles',
    'Diferencia',
    'Remanente (días)',
    'Fuente',
  ];
  const headerRowNumber = 6;
  const firstDataRow = headerRowNumber + 1;
  const lastDataRow = items.length > 0 ? firstDataRow + items.length - 1 : headerRowNumber;
  const firstWarehouseColumn = 8;
  const lastWarehouseColumn = firstWarehouseColumn + warehouses.length - 1;
  const totalSourceColumn = firstWarehouseColumn + warehouses.length;
  const totalVisibleColumn = totalSourceColumn + 1;
  const differenceColumn = totalSourceColumn + 2;
  const daysColumn = totalSourceColumn + 3;
  const sourceColumn = totalSourceColumn + 4;
  const lastColumn = sourceColumn;
  const lastColumnLetter = excelColumnLetter(lastColumn);

  detailSheet.mergeCells(`A1:${lastColumnLetter}1`);
  detailSheet.getCell('A1').value = 'SOLIS COMERCIAL | INVENTARIO';
  detailSheet.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: EXCEL_THEME.white } };
  detailSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_THEME.brand } };
  detailSheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  detailSheet.getRow(1).height = 34;

  detailSheet.mergeCells(`A2:${lastColumnLetter}2`);
  detailSheet.getCell('A2').value = 'Existencias por producto y bodega | Exportación auditable';
  detailSheet.getCell('A2').font = { name: 'Aptos', size: 11, color: { argb: EXCEL_THEME.muted }, italic: true };
  detailSheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' };

  detailSheet.mergeCells(`A4:${lastColumnLetter}4`);
  detailSheet.getCell('A4').value = `Generado: ${generatedAt.toLocaleString('es-NI')} · Última sincronización registrada: ${pivot?.lastSync ? new Date(pivot.lastSync).toLocaleString('es-NI') : 'No informada'}`;
  detailSheet.getCell('A4').font = { name: 'Aptos', size: 10, color: { argb: EXCEL_THEME.muted } };

  const headerRow = detailSheet.getRow(headerRowNumber);
  detailHeaders.forEach((header, index) => {
    headerRow.getCell(index + 1).value = header;
  });
  styleExcelHeader(headerRow);

  const warehouseStartLetter = warehouses.length > 0 ? excelColumnLetter(firstWarehouseColumn) : null;
  const warehouseEndLetter = warehouses.length > 0 ? excelColumnLetter(lastWarehouseColumn) : null;

  items.forEach((item, index) => {
    const rowNumber = firstDataRow + index;
    const visibleTotal = warehouses.reduce(
      (sum, warehouse) => sum + Number(item.warehouseQty?.[warehouse.code] || 0),
      0
    );
    const row = detailSheet.getRow(rowNumber);
    const values = [
      item.sku || '',
      item.zoho_item_id || '',
      item.name || '',
      item.category || '',
      item.brand || '',
      item.color || '',
      item.state || '',
      ...warehouses.map((warehouse) => Number(item.warehouseQty?.[warehouse.code] || 0)),
      Number(item.total || 0),
      null,
      null,
      item.daysInStock == null ? '' : Number(item.daysInStock),
      'Supabase · /api/inventory/pivot',
    ];
    values.forEach((value, columnIndex) => {
      row.getCell(columnIndex + 1).value = value;
    });

    const visibleTotalCell = row.getCell(totalVisibleColumn);
    visibleTotalCell.value = {
      formula: warehouseStartLetter && warehouseEndLetter
        ? `SUM(${warehouseStartLetter}${rowNumber}:${warehouseEndLetter}${rowNumber})`
        : '0',
      result: visibleTotal,
    };

    const differenceCell = row.getCell(differenceColumn);
    const sourceTotal = Number(item.total || 0);
    differenceCell.value = {
      formula: `${excelColumnLetter(totalSourceColumn)}${rowNumber}-${excelColumnLetter(totalVisibleColumn)}${rowNumber}`,
      result: sourceTotal - visibleTotal,
    };

    styleExcelDataRow(row, rowNumber);
    for (let column = firstWarehouseColumn; column <= differenceColumn; column += 1) {
      row.getCell(column).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(column).numFmt = '#,##0.00;(#,##0.00);-';
    }
    row.getCell(daysColumn).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(daysColumn).numFmt = '#,##0.00;(#,##0.00);-';
    row.getCell(totalSourceColumn).font = { name: 'Aptos', size: 10, bold: true, color: { argb: EXCEL_THEME.brand } };
    row.getCell(totalVisibleColumn).font = { name: 'Aptos', size: 10, bold: true, color: { argb: EXCEL_THEME.success } };
    if (sourceTotal - visibleTotal !== 0) {
      row.getCell(differenceColumn).font = { name: 'Aptos', size: 10, bold: true, color: { argb: EXCEL_THEME.warning } };
    }
    row.getCell(sourceColumn).font = { name: 'Aptos', size: 9, color: { argb: EXCEL_THEME.muted } };
  });

  const widths = [18, 22, 42, 22, 18, 16, 14];
  warehouses.forEach(() => widths.push(16));
  widths.push(16, 22, 14, 18, 32);
  detailHeaders.forEach((_, index) => {
    detailSheet.getColumn(index + 1).width = widths[index] || 16;
  });
  detailSheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
  if (items.length > 0) {
    detailSheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: lastDataRow, column: lastColumn },
    };
  }
  detailSheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  detailSheet.headerFooter.oddFooter = '&LGenerado por Solis Comercial&C&P de &N';

  summarySheet.mergeCells('A1:F1');
  summarySheet.getCell('A1').value = 'SOLIS COMERCIAL | RESUMEN DE EXPORTACIÓN';
  summarySheet.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: EXCEL_THEME.white } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_THEME.brand } };
  summarySheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  summarySheet.getRow(1).height = 34;
  summarySheet.mergeCells('A2:F2');
  summarySheet.getCell('A2').value = 'Este resumen muestra de dónde viene cada dato y qué valores se recalculan con fórmulas al abrir el archivo.';
  summarySheet.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: EXCEL_THEME.muted }, italic: true };

  const summaryHeader = summarySheet.addRow(['Indicador', 'Valor', 'Origen / fórmula']);
  styleExcelHeader(summaryHeader);
  const summaryRows: Array<[string, string | number | Date, string]> = [
    ['Fecha de generación', generatedAt.toLocaleString('es-NI'), 'Generado por el ERP al descargar'],
    ['Productos exportados', items.length, 'Resultado filtrado de /api/inventory/pivot'],
    ['Bodegas visibles', warehouses.length, 'Bodegas autorizadas y activas en la vista'],
    ['Última sincronización', pivot?.lastSync ? new Date(pivot.lastSync).toLocaleString('es-NI') : 'No informada', 'items.updated_at / pivote de inventario'],
    ['Fuente técnica', 'Supabase · /api/inventory/pivot', 'Datos sincronizados desde Zoho en el ERP'],
    ['Filtros aplicados', filters.length ? filters.map(([label, value]) => `${label}: ${value}`).join(' | ') : 'Sin filtros activos', 'Parámetros usados para esta descarga'],
  ];
  summaryRows.forEach((values) => {
    const row = summarySheet.addRow(values);
    styleExcelDataRow(row, row.number);
    row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
    row.getCell(3).font = { name: 'Aptos', size: 9, color: { argb: EXCEL_THEME.muted } };
  });

  summarySheet.addRow([]);
  const totalsTitle = summarySheet.addRow(['Validación de totales', '', '']);
  totalsTitle.getCell(1).font = { name: 'Aptos Display', size: 12, bold: true, color: { argb: EXCEL_THEME.navy } };
  const totalsHeader = summarySheet.addRow(['Indicador', 'Valor', 'Detalle']);
  styleExcelHeader(totalsHeader);

  const sourceTotalLetter = excelColumnLetter(totalSourceColumn);
  const visibleTotalLetter = excelColumnLetter(totalVisibleColumn);
  const formulaForColumn = (columnLetter: string) =>
    items.length > 0 ? `SUM(Inventario!${columnLetter}${firstDataRow}:${columnLetter}${lastDataRow})` : '0';
  const sourceTotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const visibleTotal = items.reduce(
    (sum, item) => sum + warehouses.reduce((warehouseSum, warehouse) => warehouseSum + Number(item.warehouseQty?.[warehouse.code] || 0), 0),
    0
  );

  const sourceTotalRow = summarySheet.addRow([
    'Stock total fuente',
    { formula: formulaForColumn(sourceTotalLetter), result: sourceTotal },
    'Suma de “Total fuente” en Inventario',
  ]);
  const visibleTotalRow = summarySheet.addRow([
    'Stock recalculado por bodegas visibles',
    { formula: formulaForColumn(visibleTotalLetter), result: visibleTotal },
    'Suma de las columnas Bodega del detalle',
  ]);
  const differenceRow = summarySheet.addRow([
    'Diferencia por bodegas no visibles',
    { formula: `B${sourceTotalRow.number}-B${visibleTotalRow.number}`, result: sourceTotal - visibleTotal },
    'Permite detectar existencias de bodegas fuera de las columnas visibles',
  ]);
  [sourceTotalRow, visibleTotalRow, differenceRow].forEach((row) => {
    styleExcelDataRow(row, row.number);
    row.getCell(2).numFmt = '#,##0.00;(#,##0.00);-';
    row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(3).font = { name: 'Aptos', size: 9, color: { argb: EXCEL_THEME.muted } };
  });
  sourceTotalRow.getCell(2).font = { name: 'Aptos', size: 10, bold: true, color: { argb: EXCEL_THEME.brand } };
  visibleTotalRow.getCell(2).font = { name: 'Aptos', size: 10, bold: true, color: { argb: EXCEL_THEME.success } };
  differenceRow.getCell(2).font = { name: 'Aptos', size: 10, bold: true, color: { argb: EXCEL_THEME.warning } };

  summarySheet.addRow([]);
  const warehouseTitle = summarySheet.addRow(['Totales por bodega', '', '']);
  warehouseTitle.getCell(1).font = { name: 'Aptos Display', size: 12, bold: true, color: { argb: EXCEL_THEME.navy } };
  const warehouseHeader = summarySheet.addRow(['Código', 'Bodega', 'Total calculado']);
  styleExcelHeader(warehouseHeader);
  warehouses.forEach((warehouse, index) => {
    const columnLetter = excelColumnLetter(firstWarehouseColumn + index);
    const row = summarySheet.addRow([
      warehouse.code,
      warehouse.name,
      { formula: formulaForColumn(columnLetter), result: items.reduce((sum, item) => sum + Number(item.warehouseQty?.[warehouse.code] || 0), 0) },
    ]);
    styleExcelDataRow(row, row.number);
    row.getCell(3).numFmt = '#,##0.00;(#,##0.00);-';
    row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  summarySheet.addRow([]);
  const traceabilityTitle = summarySheet.addRow(['Trazabilidad', '', '']);
  traceabilityTitle.getCell(1).font = { name: 'Aptos Display', size: 12, bold: true, color: { argb: EXCEL_THEME.navy } };
  const traceabilityRows = [
    ['ID de Zoho', 'Incluido por producto', 'Campo items.zoho_item_id'],
    ['Total fuente', 'Valor original del pivote', 'Campo item.total'],
    ['Total bodegas visibles', 'Fórmula editable', 'SUM de las columnas Bodega en Inventario'],
    ['Diferencia', 'Fórmula editable', 'Total fuente - Total bodegas visibles'],
  ];
  traceabilityRows.forEach((values, index) => {
    const row = summarySheet.addRow(values);
    styleExcelDataRow(row, row.number);
    if (index >= 2) row.getCell(2).font = { name: 'Aptos', size: 10, bold: true, color: { argb: EXCEL_THEME.success } };
  });

  summarySheet.getColumn(1).width = 34;
  summarySheet.getColumn(2).width = 42;
  summarySheet.getColumn(3).width = 64;
  summarySheet.getColumn(4).width = 16;
  summarySheet.getColumn(5).width = 16;
  summarySheet.getColumn(6).width = 16;
  summarySheet.views = [{ state: 'frozen', ySplit: 3 }];
  summarySheet.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  summarySheet.headerFooter.oddFooter = '&LGenerado por Solis Comercial&C&P de &N';

  return workbook.xlsx.writeBuffer();
}

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const auth = await getAuthenticatedProfile(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const moduleAccess = await getEffectiveModuleAccess(supabase, auth.userId, auth.role);
    if (!hasModuleAccess(moduleAccess, 'inventory')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    const { data: profileRow } = await (supabase as any)
      .from('user_profiles')
      .select('role')
      .eq('id', auth.userId)
      .maybeSingle();
    const roleForPermission = String(profileRow?.role || auth.role || '').trim().toLowerCase();

    const canExportInventory = await hasRolePermissionCode(supabase, roleForPermission, 'inventory.export');
    if (!canExportInventory) {
      return NextResponse.json(
        { error: 'No tienes permiso para exportar inventario' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'csv').toLowerCase();

    const pivotParams = new URLSearchParams();
    ['search', 'warehouse', 'category', 'state', 'stockLevel', 'priceRange', 'marca', 'color', 'sortBy'].forEach((key) => {
      const value = searchParams.get(key);
      if (value) pivotParams.set(key, value);
    });
    pivotParams.set('showZeroStock', 'true');

    const pivotUrl = `${new URL(request.url).origin}/api/inventory/pivot?${pivotParams.toString()}`;
    const forwardHeaders = new Headers();
    const cookieHeader = request.headers.get('cookie');
    const authorizationHeader = request.headers.get('authorization');

    if (cookieHeader) forwardHeaders.set('cookie', cookieHeader);
    if (authorizationHeader) forwardHeaders.set('authorization', authorizationHeader);

    const pivotRes = await fetch(pivotUrl, {
      cache: 'no-store',
      headers: forwardHeaders,
    });
    if (!pivotRes.ok) {
      const pivotErr = await pivotRes.text().catch(() => '');
      throw new Error(`Pivot export error ${pivotRes.status}${pivotErr ? `: ${pivotErr}` : ''}`);
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

    if (format === 'excel' || format === 'xlsx') {
      const workbookBuffer = await buildInventoryWorkbook({
        warehouses,
        items,
        pivot,
        searchParams,
      });
      const filenameBase = `inventario_solis_comercial_${new Date().toISOString().split('T')[0]}`;

      return new NextResponse(new Uint8Array(workbookBuffer), {
        headers: {
          'Content-Type': EXCEL_CONTENT_TYPE,
          'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
          'Cache-Control': 'no-store, max-age=0',
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

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
      },
    });
  } catch (error) {
    console.error('Inventory export error:', error);
    return NextResponse.json(
      {
        error: 'Error al exportar inventario',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
