'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import ChartCard from '@/components/reports/ChartCard';
import BarChart from '@/components/reports/BarChart';
import HorizontalBarChart from '@/components/charts/HorizontalBarChart';
import PieChart from '@/components/charts/PieChart';
import ReportPlaceholder from '@/components/reports/ReportPlaceholder';
import { Download, Package, TrendingUp, TrendingDown, Calendar, Warehouse, AlertTriangle, DollarSign, FileText, Filter, Loader } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const dynamic = 'force-dynamic';

export default function ReportsPage() {
  const [period, setPeriod] = useState('30');
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [zohoKpis, setZohoKpis] = useState<any>(null);
  const [zohoKpisLoaded, setZohoKpisLoaded] = useState(false);
  const [warehouseData, setWarehouseData] = useState<any[] | null>(null);
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [globalFilters, setGlobalFilters] = useState({
    category: '',
    marca: '',
    warehouse: '',
    state: '',
    color: ''
  });
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  useEffect(() => {
    setIsMobile(window.innerWidth < 640);
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Phase 1: Load report data (instant, items table only)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setZohoKpis(null);
      setZohoKpisLoaded(false);
      setWarehouseData(null);
      try {
        const params = new URLSearchParams();
        if (globalFilters.category) params.set('category', globalFilters.category);
        if (globalFilters.marca) params.set('marca', globalFilters.marca);
        if (globalFilters.warehouse) params.set('warehouse', globalFilters.warehouse);
        if (globalFilters.state) params.set('state', globalFilters.state);
        if (globalFilters.color) params.set('color', globalFilters.color);

        const res = await fetch(`/api/reports/data?${params.toString()}`);
        if (cancelled) return;
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setReportData(data);
        setLoading(false);

        // Phase 2: Fire and forget - load Zoho KPIs + warehouse in background
        const hasFilters = Object.values(globalFilters).some(v => v !== '');

        if (!hasFilters) {
          fetch('/api/inventory/kpis')
            .then(r => r.ok ? r.json() : null)
            .then(kpis => { if (!cancelled && kpis?.totalValue) setZohoKpis(kpis); })
            .catch(() => { })
            .finally(() => { if (!cancelled) setZohoKpisLoaded(true); });
        } else {
          setZohoKpisLoaded(true);
        }

        setWarehouseLoading(true);
        const whParams = new URLSearchParams();
        if (globalFilters.category) whParams.set('category', globalFilters.category);
        if (globalFilters.marca) whParams.set('marca', globalFilters.marca);
        if (globalFilters.state) whParams.set('state', globalFilters.state);
        if (globalFilters.color) whParams.set('color', globalFilters.color);

        fetch(`/api/reports/warehouses?${whParams.toString()}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (!cancelled && data) setWarehouseData(data.warehouseBreakdown || []); })
          .catch(() => { })
          .finally(() => { if (!cancelled) setWarehouseLoading(false); });

      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Error al cargar datos');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [globalFilters]);

  // Merge display stats: prefer Zoho KPIs when available, fallback to local
  const localStats = reportData?.stats;
  const stats = localStats ? {
    ...localStats,
    ...(zohoKpis ? {
      totalValue: zohoKpis.totalValue ?? localStats.totalValue,
    } : {})
  } : null;
  const charts = reportData?.charts;
  const filterOptions = reportData?.filterOptions;
  const agingData = reportData?.aging;
  const sinMarcaCount = reportData?.sinMarcaCount || 0;

  async function loadExportData() {
    const params = new URLSearchParams();
    if (globalFilters.category) params.set('category', globalFilters.category);
    if (globalFilters.marca) params.set('marca', globalFilters.marca);
    if (globalFilters.warehouse) params.set('warehouse', globalFilters.warehouse);
    if (globalFilters.state) params.set('state', globalFilters.state);
    if (globalFilters.color) params.set('color', globalFilters.color);

    const res = await fetch(`/api/reports/data?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo obtener data de exportación');
    return res.json();
  }

  async function exportToPDF() {
    setExporting('pdf');
    try {
      const whParams = new URLSearchParams();
      if (globalFilters.category) whParams.set('category', globalFilters.category);
      if (globalFilters.marca) whParams.set('marca', globalFilters.marca);
      if (globalFilters.state) whParams.set('state', globalFilters.state);
      if (globalFilters.color) whParams.set('color', globalFilters.color);

      const [freshData, whRes] = await Promise.all([
        loadExportData(),
        fetch(`/api/reports/warehouses?${whParams.toString()}`, { cache: 'no-store' })
      ]);
      const whDataJson = whRes.ok ? await whRes.json() : { warehouseBreakdown: [] };

      const exportStats = freshData?.stats || stats;
      const exportWarehouses = whDataJson.warehouseBreakdown || [];
      const exportLowStock = freshData?.lowStockList || [];
      const exportMoneyCats = freshData?.moneyMakerCategories || [];
      const exportMoneyBrands = freshData?.moneyMakerBrands || [];

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFillColor(220, 38, 38);
      doc.rect(0, 0, 297, 24, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text('SOLCOM · Reporte Ejecutivo de Inventario', 14, 14);
      doc.setFontSize(9);
      doc.text(`Generado: ${new Date().toLocaleString('es-NI')}`, 14, 20);

      doc.setTextColor(31, 41, 55);
      doc.setFontSize(11);
      doc.text(`Período: Últimos ${period} días`, 14, 34);

      // 1. Resumen General
      const summaryRows = [
        ['Total Productos', String(exportStats?.totalProducts || 0)],
        ['Total Stock', `${(exportStats?.totalStock || 0).toLocaleString('es-NI')} unidades`],
        ['Valor Estimado', `$${(exportStats?.totalValue || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`],
        ['Stock Bajo', String(exportStats?.lowStockItems || 0)],
        ['Sin Stock', String(exportStats?.outOfStockItems || 0)],
        ['Bodegas Activas', String(exportStats?.activeWarehouses || 0)],
      ];

      autoTable(doc, {
        startY: 38,
        head: [['Indicador', 'Valor']],
        body: summaryRows,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.4 },
        headStyles: { fillColor: [31, 41, 55], textColor: 255 },
        columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 70 } },
        margin: { left: 14 },
        tableWidth: 120,
      });

      let nextY = (doc as any).lastAutoTable.finalY + 12;

      // 1b. Existencias Generales: Categorías y Marcas
      const catChartData = freshData?.charts?.categoryBreakdown || [];
      const totalUnitsCats = catChartData.reduce((acc: number, c: any) => acc + (c.value || 0), 0);
      const brandChartData = freshData?.charts?.brandBreakdown || [];
      const totalUnitsBrands = brandChartData.reduce((acc: number, b: any) => acc + (b.value || 0), 0);

      if (catChartData.length > 0) {
        if (nextY > 170) { doc.addPage(); nextY = 20; }
        doc.setFontSize(14);
        doc.setTextColor(139, 92, 246); // purple
        doc.text('Inventario por Categorías (Existencias Generales)', 14, nextY);

        const catRowsPDF = catChartData.map((cat: any) => {
          const percentageUnits = totalUnitsCats > 0 ? ((cat.value || 0) / totalUnitsCats) * 100 : 0;
          return [cat.label, (cat.value || 0).toLocaleString('es-NI'), `${percentageUnits.toFixed(1)}%`];
        });

        autoTable(doc, {
          startY: nextY + 4,
          head: [['Categoría', 'Unidades Totales', '% del Inventario']],
          body: catRowsPDF,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [139, 92, 246], textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      if (brandChartData.length > 0) {
        if (nextY > 170) { doc.addPage(); nextY = 20; }
        doc.setFontSize(14);
        doc.setTextColor(245, 158, 11); // orange
        doc.text('Inventario por Marcas (Existencias Generales)', 14, nextY);

        const brandRowsPDF = brandChartData.map((brand: any) => {
          const percentageUnits = totalUnitsBrands > 0 ? ((brand.value || 0) / totalUnitsBrands) * 100 : 0;
          return [brand.label, (brand.value || 0).toLocaleString('es-NI'), `${percentageUnits.toFixed(1)}%`];
        });

        autoTable(doc, {
          startY: nextY + 4,
          head: [['Marca', 'Unidades Totales', '% del Inventario']],
          body: brandRowsPDF,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [245, 158, 11], textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      // 2. Bodegas
      if (exportWarehouses.length > 0) {
        if (nextY > 170) { doc.addPage(); nextY = 20; }
        doc.setFontSize(14);
        doc.setTextColor(14, 165, 233); // #0ea5e9
        doc.text('Inventario y Distribución por Almacén', 14, nextY);

        const whRowsPDF = exportWarehouses.map((wh: any) => {
          const totalUnitsAll = exportWarehouses.reduce((acc: number, w: any) => acc + (w.value || 0), 0);
          const totalCapitalAll = exportWarehouses.reduce((acc: number, w: any) => acc + (w.capital || 0), 0);
          const percentageUnits = totalUnitsAll > 0 ? ((wh.value || 0) / totalUnitsAll) * 100 : 0;
          const percentageCapital = totalCapitalAll > 0 ? ((wh.capital || 0) / totalCapitalAll) * 100 : 0;
          return [
            wh.label || wh.code,
            (wh.value || 0).toLocaleString('es-NI'),
            `${percentageUnits.toFixed(1)}%`,
            `$${(wh.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
            `${percentageCapital.toFixed(1)}%`
          ];
        });

        autoTable(doc, {
          startY: nextY + 4,
          head: [['Bodega/Almacén', 'Unidades Totales', '% de Unidades', 'Capital Invertido', '% del Capital']],
          body: whRowsPDF,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [14, 165, 233], textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      // 3. Alertas Quiebre Stock
      if (exportLowStock.length > 0) {
        if (nextY > 170) { doc.addPage(); nextY = 20; }
        doc.setFontSize(14);
        doc.setTextColor(245, 158, 11); // #f59e0b
        doc.text('Alerta Crítica: Quiebre de Stock', 14, nextY);

        const alertRowsPDF = exportLowStock.map((item: any) => [
          item.stock_total <= 3 ? 'Crítico' : 'Bajo',
          item.sku || '',
          item.name || '',
          item.marca || '—',
          String(item.stock_total || 0)
        ]);

        autoTable(doc, {
          startY: nextY + 4,
          head: [['Estado', 'SKU', 'Producto', 'Marca', 'Stock Actual']],
          body: alertRowsPDF,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [245, 158, 11], textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      // 4. Money Maker Categorías
      if (exportMoneyCats.length > 0) {
        if (nextY > 170) { doc.addPage(); nextY = 20; }
        doc.setFontSize(14);
        doc.setTextColor(139, 92, 246); // #8b5cf6
        doc.text('El "Money Maker" de Categorías', 14, nextY);

        const catRowsPDF = exportMoneyCats.map((cat: any) => {
          const avgTicket = cat.stock > 0 ? (cat.capital / cat.stock) : 0;
          return [
            cat.label,
            String(cat.uniqueSkus || 0),
            (cat.stock || 0).toLocaleString('es-NI'),
            `$${(cat.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
            `$${avgTicket.toLocaleString('es-NI', { maximumFractionDigits: 2 })}`
          ];
        });

        autoTable(doc, {
          startY: nextY + 4,
          head: [['Categoría', 'SKUs Diferentes', 'Stock Físico (Unids)', 'Capital Invertido', 'Ticket Promedio']],
          body: catRowsPDF,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [139, 92, 246], textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      // 5. Money Maker Marcas
      if (exportMoneyBrands.length > 0) {
        if (nextY > 170) { doc.addPage(); nextY = 20; }
        doc.setFontSize(14);
        doc.setTextColor(245, 158, 11); // #f59e0b
        doc.text('El "Money Maker" de Marcas', 14, nextY);

        const brandRowsPDF = exportMoneyBrands.map((brand: any) => {
          const avgTicket = brand.stock > 0 ? (brand.capital / brand.stock) : 0;
          return [
            brand.label,
            String(brand.uniqueSkus || 0),
            (brand.stock || 0).toLocaleString('es-NI'),
            `$${(brand.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
            `$${avgTicket.toLocaleString('es-NI', { maximumFractionDigits: 2 })}`
          ];
        });

        autoTable(doc, {
          startY: nextY + 4,
          head: [['Marca', 'SKUs Diferentes', 'Stock Físico (Unids)', 'Capital Invertido', 'Ticket Promedio']],
          body: brandRowsPDF,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [245, 158, 11], textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });
      }

      doc.save(`reporte_inventario_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err: any) {
      alert(`Error al exportar PDF: ${err.message}`);
    } finally {
      setExporting(null);
    }
  }

  async function exportToExcel() {
    setExporting('excel');
    try {
      const whParams = new URLSearchParams();
      if (globalFilters.category) whParams.set('category', globalFilters.category);
      if (globalFilters.marca) whParams.set('marca', globalFilters.marca);
      if (globalFilters.state) whParams.set('state', globalFilters.state);
      if (globalFilters.color) whParams.set('color', globalFilters.color);

      const [freshData, whRes] = await Promise.all([
        loadExportData(),
        fetch(`/api/reports/warehouses?${whParams.toString()}`, { cache: 'no-store' })
      ]);
      const whDataJson = whRes.ok ? await whRes.json() : { warehouseBreakdown: [] };

      const exportStats = freshData?.stats || stats;
      const exportWarehouses = whDataJson.warehouseBreakdown || [];
      const exportLowStock = freshData?.lowStockList || [];
      const exportMoneyCats = freshData?.moneyMakerCategories || [];
      const exportMoneyBrands = freshData?.moneyMakerBrands || [];

      // 1. Inventario por Bodegas (Unids y %) - Covers Bar and Pie chart
      const whRows = exportWarehouses.map((wh: any) => {
        const totalUnitsAll = exportWarehouses.reduce((acc: number, w: any) => acc + (w.value || 0), 0);
        const totalCapitalAll = exportWarehouses.reduce((acc: number, w: any) => acc + (w.capital || 0), 0);
        const percentageUnits = totalUnitsAll > 0 ? ((wh.value || 0) / totalUnitsAll) * 100 : 0;
        const percentageCapital = totalCapitalAll > 0 ? ((wh.capital || 0) / totalCapitalAll) * 100 : 0;
        return `<tr>
          <td>${wh.label || wh.code}</td>
          <td style="text-align:right">${(wh.value || 0).toLocaleString('es-NI')}</td>
          <td style="text-align:center">${percentageUnits.toFixed(1)}%</td>
          <td style="text-align:right">${(wh.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}</td>
          <td style="text-align:center">${percentageCapital.toFixed(1)}%</td>
        </tr>`;
      }).join('');

      // 1b. Existencias Generales: Inventario por Categorías (Unids y %) - Covers Bar and Pie chart
      const catChartData = freshData?.charts?.categoryBreakdown || [];
      const totalUnitsCats = catChartData.reduce((acc: number, c: any) => acc + (c.value || 0), 0);
      const catRows = catChartData.map((cat: any) => {
        const percentageUnits = totalUnitsCats > 0 ? ((cat.value || 0) / totalUnitsCats) * 100 : 0;
        return `<tr>
          <td>${cat.label}</td>
          <td style="text-align:right">${(cat.value || 0).toLocaleString('es-NI')}</td>
          <td style="text-align:center">${percentageUnits.toFixed(1)}%</td>
        </tr>`;
      }).join('');

      // 1c. Existencias Generales: Inventario por Marca (Unids y %) - Covers Bar and Pie chart
      const brandChartData = freshData?.charts?.brandBreakdown || [];
      const totalUnitsBrands = brandChartData.reduce((acc: number, b: any) => acc + (b.value || 0), 0);
      const brandRows = brandChartData.map((brand: any) => {
        const percentageUnits = totalUnitsBrands > 0 ? ((brand.value || 0) / totalUnitsBrands) * 100 : 0;
        return `<tr>
          <td>${brand.label}</td>
          <td style="text-align:right">${(brand.value || 0).toLocaleString('es-NI')}</td>
          <td style="text-align:center">${percentageUnits.toFixed(1)}%</td>
        </tr>`;
      }).join('');

      // 2. Alertas
      const alertRows = exportLowStock.map((item: any) => `
        <tr>
          <td style="text-align:center">${item.stock_total <= 3 ? 'Critico' : 'Bajo'}</td>
          <td style="mso-number-format:'\\@'">${item.sku || ''}</td>
          <td>${item.name || ''}</td>
          <td>${item.marca || '—'}</td>
          <td style="text-align:right;color:#ef4444;font-weight:bold">${item.stock_total || 0}</td>
        </tr>
      `).join('');

      // 3. Money Maker Categorías
      const mmCatsRows = exportMoneyCats.map((cat: any) => {
        const avgTicket = cat.stock > 0 ? (cat.capital / cat.stock) : 0;
        return `<tr>
          <td>${cat.label}</td>
          <td style="text-align:center">${cat.uniqueSkus || 0}</td>
          <td style="text-align:right">${(cat.stock || 0).toLocaleString('es-NI')}</td>
          <td style="text-align:right">${(cat.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}</td>
          <td style="text-align:right">${avgTicket.toLocaleString('es-NI', { maximumFractionDigits: 2 })}</td>
        </tr>`;
      }).join('');

      // 4. Money Maker Marcas
      const mmBrandsRows = exportMoneyBrands.map((brand: any) => {
        const avgTicket = brand.stock > 0 ? (brand.capital / brand.stock) : 0;
        return `<tr>
          <td>${brand.label}</td>
          <td style="text-align:center">${brand.uniqueSkus || 0}</td>
          <td style="text-align:right">${(brand.stock || 0).toLocaleString('es-NI')}</td>
          <td style="text-align:right">${(brand.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}</td>
          <td style="text-align:right">${avgTicket.toLocaleString('es-NI', { maximumFractionDigits: 2 })}</td>
        </tr>`;
      }).join('');

      const excelHtml = `
        <html>
          <head>
            <meta charset="UTF-8" />
            <style>
              body { font-family: Arial, sans-serif; }
              h1, h2 { color: #dc2626; margin: 16px 0 8px 0; }
              .meta { color: #475569; margin-bottom: 12px; font-size: 12px; }
              .summary { margin-bottom: 12px; border-collapse: collapse; }
              .summary td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 12px; }
              table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
              th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 12px; }
              th { background: #dc2626; color: #fff; text-align: left; }
              h2.blue { color: #0ea5e9; } th.blue { background: #0ea5e9; }
              h2.orange { color: #f59e0b; } th.orange { background: #f59e0b; }
              h2.purple { color: #8b5cf6; } th.purple { background: #8b5cf6; }
              tr:nth-child(even) td { background: #f8fafc; }
            </style>
          </head>
          <body>
            <h1>SOLCOM · Reporte Ejecutivo de Inventario</h1>
            <div class="meta">Generado: ${new Date().toLocaleString('es-NI')} · Período: últimos ${period} días</div>
            <table class="summary">
              <tr><td><strong>Total Productos</strong></td><td>${exportStats?.totalProducts || 0}</td><td><strong>Total Stock</strong></td><td>${(exportStats?.totalStock || 0).toLocaleString('es-NI')}</td></tr>
              <tr><td><strong>Valor Estimado</strong></td><td>${(exportStats?.totalValue || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}</td><td><strong>Stock Bajo</strong></td><td>${exportStats?.lowStockItems || 0}</td></tr>
            </table>

            <h2 class="blue">Inventario y Distribución por Almacén</h2>
            <table>
              <thead>
                <tr><th class="blue">Bodega/Almacén</th><th class="blue">Unidades Totales</th><th class="blue">% de Unidades</th><th class="blue">Capital Invertido</th><th class="blue">% del Capital</th></tr>
              </thead>
              <tbody>${whRows}</tbody>
            </table>

            <h2 class="purple">Inventario por Categorías (Existencias Generales)</h2>
            <table>
              <thead>
                <tr><th class="purple">Categoría</th><th class="purple">Unidades Totales</th><th class="purple">% del Inventario</th></tr>
              </thead>
              <tbody>${catRows}</tbody>
            </table>

            <h2 class="orange">Inventario por Marca (Existencias Generales)</h2>
            <table>
              <thead>
                <tr><th class="orange">Marca</th><th class="orange">Unidades Totales</th><th class="orange">% del Inventario</th></tr>
              </thead>
              <tbody>${brandRows}</tbody>
            </table>

            <h2 class="orange">Alerta Crítica: Quiebre de Stock</h2>
            <table>
              <thead>
                <tr><th class="orange">Estado</th><th class="orange">SKU</th><th class="orange">Producto</th><th class="orange">Marca</th><th class="orange">Stock Actual</th></tr>
              </thead>
              <tbody>${alertRows}</tbody>
            </table>

            <h2 class="purple">El "Money Maker" de Categorías</h2>
            <table>
              <thead>
                <tr><th class="purple">Categoría</th><th class="purple">SKUs Diferentes</th><th class="purple">Stock Físico (Unids)</th><th class="purple">Capital Invertido</th><th class="purple">Ticket Promedio</th></tr>
              </thead>
              <tbody>${mmCatsRows}</tbody>
            </table>

            <h2 class="orange">El "Money Maker" de Marcas</h2>
            <table>
              <thead>
                <tr><th class="orange">Marca</th><th class="orange">SKUs Diferentes</th><th class="orange">Stock Físico (Unids)</th><th class="orange">Capital Invertido</th><th class="orange">Ticket Promedio</th></tr>
              </thead>
              <tbody>${mmBrandsRows}</tbody>
            </table>
          </body>
        </html>
      `;

      const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_inventario_${new Date().toISOString().split('T')[0]}.xls`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Error al exportar Excel: ${err.message}`);
    } finally {
      setExporting(null);
    }
  }

  const generateColors = (count: number) => {
    const baseColors = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];
    const colors: string[] = [];
    for (let i = 0; i < count; i++) colors.push(baseColors[i % baseColors.length]);
    return colors;
  };

  const hasFilters = Object.values(globalFilters).some(v => v !== '');

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: '100%', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div className="h-title" style={{ fontSize: 'clamp(18px, 5vw, 24px)' }}>Reportes de Inventario</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={exportToExcel} disabled={exporting === 'excel'}>
            <Download size={16} style={{ marginRight: 6 }} />
            <span style={{ display: isMobile ? 'none' : 'inline' }}>{exporting === 'excel' ? 'Exportando...' : 'Excel Pro'}</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={exportToPDF} disabled={exporting === 'pdf'}>
            <FileText size={16} style={{ marginRight: 6 }} />
            <span style={{ display: isMobile ? 'none' : 'inline' }}>{exporting === 'pdf' ? 'Exportando...' : 'PDF Pro'}</span>
          </Button>
        </div>
      </div>

      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 8 }}>
          <Calendar size={18} color="var(--muted)" />
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            options={[
              { value: '7', label: 'Últimos 7 días' },
              { value: '30', label: 'Últimos 30 días' },
              { value: '90', label: 'Últimos 90 días' },
              { value: '365', label: 'Último año' },
            ]}
          />
        </div>
      </Card>

      {sinMarcaCount > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={20} color="var(--warning)" />
              <div>
                <div style={{ fontWeight: 600 }}>Productos sin marca</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {sinMarcaCount.toLocaleString('es-NI')} productos sin marca asignada
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <Card>
          <div style={{ padding: 16, color: 'var(--danger)' }}>
            Error: {error}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14 }}>
        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--warning)15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingDown size={20} color="var(--warning)" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Stock Bajo</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{stats?.lowStockItems || 0}</div>
                <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 4 }}>Menos de 10 unidades</div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--danger)15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={20} color="var(--danger)" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Sin Stock</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{stats?.outOfStockItems || 0}</div>
                <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>Productos agotados</div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--brand-primary)15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Warehouse size={20} color="var(--brand-primary)" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Bodegas Activas</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{stats?.activeWarehouses || 0}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Ubicaciones operativas</div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#10b98115', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={20} color="#10b981" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Valor del Inventario</div>
                <span style={{ fontSize: 9, background: '#10b98120', color: '#10b981', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>Zoho</span>
              </div>
            </div>
            {!zohoKpisLoaded ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader size={16} color="#10b981" style={{ animation: 'spin 1.5s linear infinite' }} />
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>Cargando...</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Calculando inventario...
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                  {new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(zohoKpis?.totalValue || 0)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Valoración exitosa
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* FILTROS GLOBALES */}
      <Card>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Filter size={18} color="var(--brand-primary)" />
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Filtros Globales</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12 }}>
            <Select
              value={globalFilters.category}
              onChange={(e) => { setGlobalFilters({ ...globalFilters, category: e.target.value }); }}
              options={[
                { value: '', label: 'Todas las categorías' },
                ...(filterOptions?.categories || []).map((c: string) => ({ value: c, label: c }))
              ]}
            />
            <Select
              value={globalFilters.marca}
              onChange={(e) => { setGlobalFilters({ ...globalFilters, marca: e.target.value }); }}
              options={[
                { value: '', label: 'Todas las marcas' },
                ...(filterOptions?.marcas || []).map((m: string) => ({ value: m, label: m }))
              ]}
            />
            <Select
              value={globalFilters.warehouse}
              onChange={(e) => { setGlobalFilters({ ...globalFilters, warehouse: e.target.value }); }}
              options={[
                { value: '', label: 'Todos los almacenes' },
                ...(filterOptions?.warehouses || []).map((w: string) => ({ value: w, label: w }))
              ]}
            />
            <Select
              value={globalFilters.state}
              onChange={(e) => { setGlobalFilters({ ...globalFilters, state: e.target.value }); }}
              options={[
                { value: '', label: 'Todos los estados' },
                ...(filterOptions?.states || []).map((s: string) => ({ value: s, label: s }))
              ]}
            />
            <Select
              value={globalFilters.color}
              onChange={(e) => { setGlobalFilters({ ...globalFilters, color: e.target.value }); }}
              options={[
                { value: '', label: 'Todos los colores' },
                ...(filterOptions?.colors || []).map((c: string) => ({ value: c, label: c }))
              ]}
            />
          </div>
        </div>
      </Card>

      {/* NUEVA SECCIÓN: DISTRIBUCIÓN DE CAPITAL POR BODEGA */}
      <div style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)', padding: '12px 20px', borderRadius: 8 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>Distribución de Capital por Bodega</h2>
      </div>
      <Card>
        <div style={{ padding: 16 }}>
          {warehouseLoading ? (
            <div style={{ height: 200, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : !warehouseData || warehouseData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
              No hay datos de bodegas
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--panel)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Bodega</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>SKUs Únicos</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Unidades Totales</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Capital Invertido</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>% del Capital</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouseData.map((wh: any, idx: number) => {
                    const totalCapitalAll = warehouseData.reduce((acc, w) => acc + (w.capital || 0), 0);
                    const percentage = totalCapitalAll > 0 ? ((wh.capital || 0) / totalCapitalAll) * 100 : 0;
                    return (
                      <tr key={wh.code || idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--panel)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{wh.label || wh.code}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{(wh.uniqueSkus || 0).toLocaleString('es-NI')}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{(wh.value || 0).toLocaleString('es-NI')}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                          ${(wh.capital || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                            <div style={{ fontSize: 12 }}>{percentage.toFixed(1)}%</div>
                            <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${percentage}% `, height: '100%', background: '#0ea5e9' }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* NUEVA SECCIÓN: ALERTA CRÍTICA: QUIEBRE DE STOCK */}
      <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)', padding: '12px 20px', borderRadius: 8 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>Alerta Crítica: Quiebre de Stock (Restocking)</h2>
      </div>
      <Card>
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ height: 200, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : !reportData?.lowStockList || reportData.lowStockList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
              <Package size={32} style={{ marginBottom: 8, opacity: 0.5, margin: '0 auto' }} />
              <div>No hay productos con stock crítico (bajo 10 unidades)</div>
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--panel)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Estado</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>SKU</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Producto</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Marca</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Stock Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.lowStockList.map((item: any, idx: number) => {
                    const isCritical = item.stock_total <= 3;
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--panel)' }}>
                        <td style={{ padding: '8px 12px', textAlign: 'center', width: 40 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: isCritical ? '#ef4444' : '#f59e0b', margin: '0 auto', boxShadow: `0 0 8px ${isCritical ? '#ef4444' : '#f59e0b'} ` }} title={isCritical ? 'Estado Crítico (<= 3)' : 'Bajo Stock (< 10)'} />
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{item.sku}</td>
                        <td style={{ padding: '8px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{item.marca || '—'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: isCritical ? '#ef4444' : '#f59e0b', fontSize: 16 }}>
                          {item.stock_total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* NUEVA SECCIÓN: MONEY MAKER DE CATEGORÍAS */}
      <div style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', padding: '12px 20px', borderRadius: 8 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>El "Money Maker" de Categorías</h2>
      </div>
      <Card>
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ height: 200, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : !reportData?.moneyMakerCategories || reportData.moneyMakerCategories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
              No hay datos de categorías
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--panel)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Categoría</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>SKUs Diferentes</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Stock Físico (Unids)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Capital Invertido</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Ticket Prom. (Costo/Uníd)</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.moneyMakerCategories.map((cat: any, idx: number) => {
                    const avgTicket = cat.stock > 0 ? (cat.capital / cat.stock) : 0;
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--panel)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#8b5cf6' }}>{cat.label}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{(cat.uniqueSkus || 0).toLocaleString('es-NI')}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{(cat.stock || 0).toLocaleString('es-NI')}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>
                          ${(cat.capital || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--muted)' }}>
                          ${avgTicket.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* NUEVA SECCIÓN: MONEY MAKER DE MARCAS */}
      <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '12px 20px', borderRadius: 8, marginTop: 16 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>El "Money Maker" de Marcas</h2>
      </div>
      <Card>
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ height: 200, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : !reportData?.moneyMakerBrands || reportData.moneyMakerBrands.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
              No hay datos de marcas
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--panel)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Marca</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>SKUs Diferentes</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Stock Físico (Unids)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Capital Invertido</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Ticket Prom. (Costo/Uníd)</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.moneyMakerBrands.map((brand: any, idx: number) => {
                    const avgTicket = brand.stock > 0 ? (brand.capital / brand.stock) : 0;
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--panel)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f59e0b' }}>{brand.label}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{(brand.uniqueSkus || 0).toLocaleString('es-NI')}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{(brand.stock || 0).toLocaleString('es-NI')}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>
                          ${(brand.capital || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--muted)' }}>
                          ${avgTicket.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>



      {/* SECCIÓN 2: EXISTENCIAS GENERALES */}
      <div style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', padding: '12px 20px', borderRadius: 8 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>EXISTENCIAS GENERALES</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 14 }}>
        <ChartCard title="Inventario por Categorías (Unids)">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = charts?.categoryBreakdown;
            return data && data.length > 0 ? (
              <HorizontalBarChart data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))} height={300} />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>

        <ChartCard title="Top Inventario por Marca (Unids)">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = charts?.brandBreakdown;
            const total = data?.reduce((sum: number, d: any) => sum + d.value, 0) || 0;
            return data && data.length > 0 ? (
              <HorizontalBarChart
                data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))}
                height={300}
                showValues={true}
                showPercentage={true}
                totalValue={total}
              />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 14 }}>
        <ChartCard title="Participación de Inventario - Unids por Categoría">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = charts?.categoryBreakdown;
            return data && data.length > 0 ? (
              <PieChart data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))} size={250} />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>

        <ChartCard title="Participación de Inventario - Unids por Marca">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = charts?.brandBreakdown;
            return data && data.length > 0 ? (
              <PieChart data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))} size={250} />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>
      </div>

      {/* SECCIÓN TOTALES */}

      {/* WAREHOUSE CHARTS - loaded lazily */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 14 }}>
        <ChartCard title="Inventario por Almacén (Unidades)">
          {warehouseLoading ? (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 8 }}>
              <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Cargando bodegas...
            </div>
          ) : warehouseData && warehouseData.length > 0 ? (
            <BarChart data={warehouseData} height={300} showValues={true} />
          ) : (
            <ReportPlaceholder title={warehouseData ? "Sin datos" : "Cargando..."} height={300} />
          )}
        </ChartCard>

        <ChartCard title="Participación de Inventario - Unids por Almacén">
          {warehouseLoading ? (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 8 }}>
              <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Cargando bodegas...
            </div>
          ) : warehouseData && warehouseData.length > 0 ? (
            <PieChart data={warehouseData.map((d: any, i: number) => ({ ...d, color: generateColors(warehouseData.length)[i] }))} size={250} />
          ) : (
            <ReportPlaceholder title={warehouseData ? "Sin datos" : "Cargando..."} height={300} />
          )}
        </ChartCard>
      </div>

      {/* SECCIÓN 3: ANÁLISIS DE VENTAS */}
      <div style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', padding: '12px 20px', borderRadius: 8 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>Análisis de Ventas por Almacén Consignación</h2>
      </div>
      <ReportPlaceholder title="Análisis de Ventas" reason="Requiere datos de ventas desde Zoho Inventory" height={400} />

      {/* SECCIÓN 4: INDICADORES MENSUALES */}
      <div style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', padding: '12px 20px', borderRadius: 8 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>Indicadores Mensuales por Almacén</h2>
      </div>
      <ReportPlaceholder title="Indicadores Mensuales" reason="Requiere datos mensuales de ventas desde Zoho Inventory" height={400} />
    </div>
  );
}
