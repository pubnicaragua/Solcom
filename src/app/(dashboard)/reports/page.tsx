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
  const [categoryViewMode, setCategoryViewMode] = useState<'consolidated' | 'units' | 'cost'>('consolidated');
  const [brandViewMode, setBrandViewMode] = useState<'consolidated' | 'units' | 'cost'>('consolidated');
  const [topItemsViewMode, setTopItemsViewMode] = useState<'units' | 'cost'>('units');

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

        const res = await fetch(`/api/reports/data?${params.toString()}`, { cache: 'no-store' });
        if (cancelled) return;
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const errorText =
            data?.details
              ? `${data?.error || `Error ${res.status}`}: ${data.details}`
              : (data?.error || `Error ${res.status}`);
          throw new Error(errorText);
        }
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
      const exportMoneyCats = freshData?.moneyMakerCategories || [];
      const exportMoneyBrands = freshData?.moneyMakerBrands || [];
      const exportTopItems = freshData?.topInventoryItems || [];
      const exportTopItemsByCost = freshData?.topInventoryItemsByCost || [];

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = 297;
      const pageHeight = 210;
      const marginLeft = 14;
      const marginRight = 14;
      const pageBreakThreshold = 170;

      // Helper: check page break
      const ensureSpace = (y: number, needed: number = 30) => {
        if (y > pageBreakThreshold || y + needed > pageHeight - 15) {
          doc.addPage();
          return 20;
        }
        return y;
      };

      // Helper: section title — ensures title + at least header+2 rows stay together
      const sectionTitle = (title: string, y: number, color: [number, number, number]) => {
        // Need ~45mm minimum for title + header + 2-3 data rows
        if (y + 45 > pageHeight - 10) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(13);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(title, marginLeft, y);
        return y;
      };

      // Color palette matching UI
      const pdfColors: [number, number, number][] = [
        [59,130,246],[139,92,246],[16,185,129],[245,158,11],[239,68,68],
        [236,72,153],[20,184,166],[249,115,22],[99,102,241],[132,204,22]
      ];
      const getColor = (i: number): [number, number, number] => pdfColors[i % pdfColors.length];

      // Helper: draw donut chart on PDF
      const drawDonutChart = (
        chartData: Array<{ label: string; value: number }>,
        centerX: number, centerY: number,
        radius: number, innerRadius: number,
        title: string, titleColor: [number, number, number]
      ) => {
        const total = chartData.reduce((s, d) => s + d.value, 0);
        if (total === 0) return centerY;
        // Title
        doc.setFontSize(10);
        doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
        doc.text(title, centerX, centerY - radius - 6, { align: 'center' });
        // Draw slices
        let startAngle = -90;
        chartData.forEach((item, idx) => {
          const sweepAngle = (item.value / total) * 360;
          if (sweepAngle <= 0) return;
          const endAngle = startAngle + sweepAngle;
          const c = getColor(idx);
          doc.setFillColor(c[0], c[1], c[2]);
          // Draw filled arc as polygon segments
          const steps = Math.max(Math.ceil(sweepAngle / 1.5), 8); // Smoother arcs
          const points: number[][] = [];
          for (let s = 0; s <= steps; s++) {
            const a = ((startAngle + (sweepAngle * s) / steps) * Math.PI) / 180;
            points.push([centerX + radius * Math.cos(a), centerY + radius * Math.sin(a)]);
          }
          for (let s = steps; s >= 0; s--) {
            const a = ((startAngle + (sweepAngle * s) / steps) * Math.PI) / 180;
            points.push([centerX + innerRadius * Math.cos(a), centerY + innerRadius * Math.sin(a)]);
          }
          if (points.length > 2) {
            doc.setDrawColor(255, 255, 255);
            doc.setLineWidth(0.15); // Thinner border for cleaner look
            doc.moveTo(points[0][0], points[0][1]);
            for (let p = 1; p < points.length; p++) doc.lineTo(points[p][0], points[p][1]);
            (doc as any).fill('F');
          }
          // Percentage label
          if (sweepAngle > 15) {
            const midA = ((startAngle + sweepAngle / 2) * Math.PI) / 180;
            const lr = (radius + innerRadius) / 2;
            const lx = centerX + lr * Math.cos(midA);
            const ly = centerY + lr * Math.sin(midA);
            doc.setFontSize(7);
            doc.setTextColor(255, 255, 255);
            doc.text(`${((item.value / total) * 100).toFixed(1)}%`, lx, ly, { align: 'center' });
          }
          startAngle = endAngle;
        });
        // Center total
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);
        doc.text(total.toLocaleString('es-NI'), centerX, centerY + 1.5, { align: 'center' });
        // Legend below
        const legendY = centerY + radius + 8;
        const colWidth = 40;
        const cols = 3;
        let lastY = legendY;
        chartData.forEach((item, idx) => {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const lx = centerX - ((cols * colWidth) / 2) + col * colWidth;
          const ly = legendY + row * 5;
          const c = getColor(idx);
          doc.setFillColor(c[0], c[1], c[2]);
          doc.rect(lx, ly - 1.8, 2.5, 2.5, 'F');
          doc.setFontSize(5.5);
          doc.setTextColor(80, 80, 80);
          const label = item.label.length > 22 ? item.label.substring(0, 21) + '…' : item.label;
          doc.text(label, lx + 4, ly + 0.2);
          lastY = Math.max(lastY, ly + 4);
        });
        return lastY;
      };

      // Helper: draw horizontal bar chart on PDF
      const drawHorizontalBarChart = (
        chartData: Array<{ label: string; value: number }>,
        x: number, y: number, width: number, maxHeight: number,
        title: string, titleColor: [number, number, number],
        valueFormatter?: (v: number) => string
      ) => {
        const maxVal = Math.max(...chartData.map(d => d.value), 1);
        const total = chartData.reduce((s, d) => s + d.value, 0);
        const barH = 5;
        const gap = 2;
        const labelW = 35;
        const barAreaW = width - labelW - 30;
        // Title
        doc.setFontSize(10);
        doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
        doc.text(title, x, y);
        let cy = y + 4;
        chartData.forEach((item, idx) => {
          const pct = (item.value / maxVal) * 100;
          const barW = (pct / 100) * barAreaW;
          const c = getColor(idx);
          // Label
          doc.setFontSize(6);
          doc.setTextColor(80, 80, 80);
          const label = item.label.length > 18 ? item.label.substring(0, 17) + '…' : item.label;
          doc.text(label, x + labelW - 1, cy + barH / 2 + 0.5, { align: 'right' });
          // Bar
          doc.setFillColor(c[0], c[1], c[2]);
          doc.rect(x + labelW, cy, Math.max(barW, 1), barH, 'F');
          // Value
          doc.setFontSize(6);
          doc.setTextColor(31, 41, 55);
          const valTxt = valueFormatter ? valueFormatter(item.value) : item.value.toLocaleString('es-NI');
          const pctTxt = total > 0 ? ` (${((item.value / total) * 100).toFixed(1)}%)` : '';
          doc.text(valTxt + pctTxt, x + labelW + barW + 2, cy + barH / 2 + 0.5);
          cy += barH + gap;
        });
        return cy + 4;
      };

      // === CABECERA ===
      doc.setFillColor(220, 38, 38);
      doc.rect(0, 0, pageWidth, 24, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text('SOLCOM · Reporte Ejecutivo de Inventario', marginLeft, 14);
      doc.setFontSize(9);
      doc.text(`Generado: ${new Date().toLocaleString('es-NI')}`, marginLeft, 20);

      doc.setTextColor(31, 41, 55);
      doc.setFontSize(11);
      doc.text(`Período: Últimos ${period} días`, marginLeft, 34);

      let nextY = 38;

      // === FILTROS ACTIVOS ===
      const activeFilters: string[] = [];
      if (globalFilters.category) activeFilters.push(`Categoría: ${globalFilters.category}`);
      if (globalFilters.marca) activeFilters.push(`Marca: ${globalFilters.marca}`);
      if (globalFilters.warehouse) activeFilters.push(`Almacén: ${globalFilters.warehouse}`);
      if (globalFilters.state) activeFilters.push(`Estado: ${globalFilters.state}`);
      if (globalFilters.color) activeFilters.push(`Color: ${globalFilters.color}`);

      if (activeFilters.length > 0) {
        doc.setFontSize(9);
        doc.setTextColor(220, 38, 38);
        doc.text(`Filtros aplicados: ${activeFilters.join(' | ')}`, marginLeft, nextY);
        nextY += 6;
      }

      // === 1. RESUMEN GENERAL ===
      const summaryRows = [
        ['Total Productos', String(exportStats?.totalProducts || 0)],
        ['Total Stock', `${(exportStats?.totalStock || 0).toLocaleString('es-NI')} unidades`],
        ['Valor Estimado', `$${(exportStats?.totalValue || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`],
        ['Stock Bajo', String(exportStats?.lowStockItems || 0)],
        ['Sin Stock', String(exportStats?.outOfStockItems || 0)],
        ['Bodegas Activas', String(exportStats?.activeWarehouses || 0)],
      ];

      autoTable(doc, {
        startY: nextY,
        head: [['Indicador', 'Valor']],
        body: summaryRows,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.4 },
        headStyles: { fillColor: [31, 41, 55], textColor: 255 },
        columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 70 } },
        margin: { left: marginLeft },
        tableWidth: 120,
      });
      nextY = (doc as any).lastAutoTable.finalY + 12;

      // === 2. DISTRIBUCIÓN DE CAPITAL POR BODEGA ===
      if (exportWarehouses.length > 0) {
        nextY = sectionTitle('Distribución de Capital por Bodega', nextY, [14, 165, 233]);
        const totalUnitsAll = exportWarehouses.reduce((acc: number, w: any) => acc + (w.value || 0), 0);
        const totalCapitalAll = exportWarehouses.reduce((acc: number, w: any) => acc + (w.capital || 0), 0);

        const whRowsPDF = exportWarehouses.map((wh: any) => {
          const percentageUnits = totalUnitsAll > 0 ? ((wh.value || 0) / totalUnitsAll) * 100 : 0;
          const percentageCapital = totalCapitalAll > 0 ? ((wh.capital || 0) / totalCapitalAll) * 100 : 0;
          return [
            wh.label || wh.code,
            (wh.uniqueSkus || 0).toLocaleString('es-NI'),
            (wh.value || 0).toLocaleString('es-NI'),
            `${percentageUnits.toFixed(1)}%`,
            `$${(wh.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
            `${percentageCapital.toFixed(1)}%`
          ];
        });

        autoTable(doc, {
          startY: nextY + 4,
          head: [['Bodega/Almacén', 'SKUs Únicos', 'Unidades', '% Unids', 'Capital Invertido', '% Capital']],
          body: whRowsPDF,
          foot: [['TOTAL', '', totalUnitsAll.toLocaleString('es-NI'), '100%', `$${totalCapitalAll.toLocaleString('es-NI', { maximumFractionDigits: 2 })}`, '100%']],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [14, 165, 233], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
          showFoot: 'lastPage',
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      // === 3. MONEY MAKER CATEGORÍAS (3 tablas) ===
      if (exportMoneyCats.length > 0) {
        // 3a. General
        nextY = sectionTitle('Money Maker Categorías — General', nextY, [139, 92, 246]);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Categoría', 'SKUs Diferentes', 'Stock Físico (Unids)', 'Capital Invertido', '% del Inventario']],
          body: exportMoneyCats.map((cat: any) => {
            const pct = exportStats?.totalStock > 0 ? (cat.stock / exportStats.totalStock) * 100 : 0;
            return [
              cat.label,
              String(cat.uniqueSkus || 0),
              (cat.stock || 0).toLocaleString('es-NI'),
              `$${(cat.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
              `${pct.toFixed(1)}%`
            ];
          }),
          foot: [[
            'TOTAL',
            exportMoneyCats.reduce((sum: number, c: any) => sum + (c.uniqueSkus || 0), 0).toLocaleString('es-NI'),
            exportMoneyCats.reduce((sum: number, c: any) => sum + (c.stock || 0), 0).toLocaleString('es-NI'),
            `$${exportMoneyCats.reduce((sum: number, c: any) => sum + (c.capital || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
            ''
          ]],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [139, 92, 246], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
          showFoot: 'lastPage',
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;

        // 3b. Desglose Unidades por Bodega
        const catWhUnits = new Set<string>();
        exportMoneyCats.forEach((c: any) => { if (c.byWarehouse) Object.keys(c.byWarehouse).forEach(w => catWhUnits.add(w)); });
        const catWhUnitsCols = Array.from(catWhUnits).sort();

        if (catWhUnitsCols.length > 0) {
          nextY = sectionTitle('Money Maker Categorías — Desglose Unidades por Bodega', nextY, [139, 92, 246]);
          autoTable(doc, {
            startY: nextY + 4,
            head: [['Categoría', ...catWhUnitsCols, 'Total Unids']],
            body: exportMoneyCats.map((cat: any) => [
              cat.label,
              ...catWhUnitsCols.map(wh => { const q = cat.byWarehouse?.[wh] || 0; return q > 0 ? q.toLocaleString('es-NI') : ''; }),
              (cat.stock || 0).toLocaleString('es-NI')
            ]),
            foot: [[
              'TOTAL',
              ...catWhUnitsCols.map(wh => exportMoneyCats.reduce((sum: number, c: any) => sum + (c.byWarehouse?.[wh] || 0), 0).toLocaleString('es-NI')),
              exportMoneyCats.reduce((sum: number, c: any) => sum + (c.stock || 0), 0).toLocaleString('es-NI')
            ]],
            theme: 'striped',
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: [139, 92, 246], textColor: 255 },
            footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: marginLeft, right: marginRight },
          });
          nextY = (doc as any).lastAutoTable.finalY + 12;
        }

        // 3c. Desglose Costo por Bodega
        const catWhCost = new Set<string>();
        exportMoneyCats.forEach((c: any) => { if (c.capitalByWarehouse) Object.keys(c.capitalByWarehouse).forEach(w => catWhCost.add(w)); });
        const catWhCostCols = Array.from(catWhCost).sort();

        if (catWhCostCols.length > 0) {
          nextY = sectionTitle('Money Maker Categorías — Desglose Costo por Bodega', nextY, [139, 92, 246]);
          autoTable(doc, {
            startY: nextY + 4,
            head: [['Categoría', ...catWhCostCols, 'Total Costo']],
            body: exportMoneyCats.map((cat: any) => [
              cat.label,
              ...catWhCostCols.map(wh => { const c = cat.capitalByWarehouse?.[wh] || 0; return c > 0 ? '$' + c.toLocaleString('es-NI', { maximumFractionDigits: 1 }) : ''; }),
              '$' + (cat.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 1 })
            ]),
            foot: [[
              'TOTAL',
              ...catWhCostCols.map(wh => '$' + exportMoneyCats.reduce((sum: number, c: any) => sum + (c.capitalByWarehouse?.[wh] || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 1 })),
              '$' + exportMoneyCats.reduce((sum: number, c: any) => sum + (c.capital || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 1 })
            ]],
            theme: 'striped',
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: [139, 92, 246], textColor: 255 },
            footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: marginLeft, right: marginRight },
          });
          nextY = (doc as any).lastAutoTable.finalY + 12;
        }
      }

      // === 4. MONEY MAKER MARCAS (3 tablas) ===
      if (exportMoneyBrands.length > 0) {
        // 4a. General
        nextY = sectionTitle('Money Maker Marcas — General', nextY, [245, 158, 11]);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Marca', 'SKUs Diferentes', 'Stock Físico (Unids)', 'Capital Invertido', '% del Inventario']],
          body: exportMoneyBrands.map((brand: any) => {
            const pct = exportStats?.totalStock > 0 ? (brand.stock / exportStats.totalStock) * 100 : 0;
            return [
              brand.label,
              String(brand.uniqueSkus || 0),
              (brand.stock || 0).toLocaleString('es-NI'),
              `$${(brand.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
              `${pct.toFixed(1)}%`
            ];
          }),
          foot: [[
            'TOTAL',
            exportMoneyBrands.reduce((sum: number, b: any) => sum + (b.uniqueSkus || 0), 0).toLocaleString('es-NI'),
            exportMoneyBrands.reduce((sum: number, b: any) => sum + (b.stock || 0), 0).toLocaleString('es-NI'),
            `$${exportMoneyBrands.reduce((sum: number, b: any) => sum + (b.capital || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
            ''
          ]],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [245, 158, 11], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
          showFoot: 'lastPage',
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;

        // 4b. Desglose Unidades por Bodega
        const brandWhUnits = new Set<string>();
        exportMoneyBrands.forEach((b: any) => { if (b.byWarehouse) Object.keys(b.byWarehouse).forEach(w => brandWhUnits.add(w)); });
        const brandWhUnitsCols = Array.from(brandWhUnits).sort();

        if (brandWhUnitsCols.length > 0) {
          nextY = sectionTitle('Money Maker Marcas — Desglose Unidades por Bodega', nextY, [245, 158, 11]);
          autoTable(doc, {
            startY: nextY + 4,
            head: [['Marca', ...brandWhUnitsCols, 'Total Unids']],
            body: exportMoneyBrands.map((brand: any) => [
              brand.label,
              ...brandWhUnitsCols.map(wh => { const q = brand.byWarehouse?.[wh] || 0; return q > 0 ? q.toLocaleString('es-NI') : ''; }),
              (brand.stock || 0).toLocaleString('es-NI')
            ]),
            foot: [[
              'TOTAL',
              ...brandWhUnitsCols.map(wh => exportMoneyBrands.reduce((sum: number, b: any) => sum + (b.byWarehouse?.[wh] || 0), 0).toLocaleString('es-NI')),
              exportMoneyBrands.reduce((sum: number, b: any) => sum + (b.stock || 0), 0).toLocaleString('es-NI')
            ]],
            theme: 'striped',
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: [245, 158, 11], textColor: 255 },
            footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: marginLeft, right: marginRight },
          });
          nextY = (doc as any).lastAutoTable.finalY + 12;
        }

        // 4c. Desglose Costo por Bodega
        const brandWhCost = new Set<string>();
        exportMoneyBrands.forEach((b: any) => { if (b.capitalByWarehouse) Object.keys(b.capitalByWarehouse).forEach(w => brandWhCost.add(w)); });
        const brandWhCostCols = Array.from(brandWhCost).sort();

        if (brandWhCostCols.length > 0) {
          nextY = sectionTitle('Money Maker Marcas — Desglose Costo por Bodega', nextY, [245, 158, 11]);
          autoTable(doc, {
            startY: nextY + 4,
            head: [['Marca', ...brandWhCostCols, 'Total Costo']],
            body: exportMoneyBrands.map((brand: any) => [
              brand.label,
              ...brandWhCostCols.map(wh => { const c = brand.capitalByWarehouse?.[wh] || 0; return c > 0 ? '$' + c.toLocaleString('es-NI', { maximumFractionDigits: 1 }) : ''; }),
              '$' + (brand.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 1 })
            ]),
            foot: [[
              'TOTAL',
              ...brandWhCostCols.map(wh => '$' + exportMoneyBrands.reduce((sum: number, b: any) => sum + (b.capitalByWarehouse?.[wh] || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 1 })),
              '$' + exportMoneyBrands.reduce((sum: number, b: any) => sum + (b.capital || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 1 })
            ]],
            theme: 'striped',
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: [245, 158, 11], textColor: 255 },
            footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: marginLeft, right: marginRight },
          });
          nextY = (doc as any).lastAutoTable.finalY + 12;
        }
      }

      // === 5. TOP INVENTARIO POR EQUIPO (2 tablas) ===
      // 5a. Top 10 por Unidades
      if (exportTopItems.length > 0) {
        const topWhUnits = new Set<string>();
        exportTopItems.forEach((item: any) => { if (item.byWarehouse) Object.keys(item.byWarehouse).forEach(w => topWhUnits.add(w)); });
        const topWhUnitsCols = Array.from(topWhUnits).sort();

        nextY = sectionTitle('Top Inventario por Equipo — Unidades', nextY, [30, 58, 138]);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Producto', ...topWhUnitsCols, 'Total']],
          body: exportTopItems.map((item: any) => [
            item.name,
            ...topWhUnitsCols.map(wh => { const q = item.byWarehouse?.[wh] || 0; return q > 0 ? q.toLocaleString('es-NI') : ''; }),
            (item.stock_total || 0).toLocaleString('es-NI')
          ]),
          foot: [[
            'TOTAL',
            ...topWhUnitsCols.map(wh => exportTopItems.reduce((sum: number, item: any) => sum + (item.byWarehouse?.[wh] || 0), 0).toLocaleString('es-NI')),
            exportTopItems.reduce((sum: number, item: any) => sum + (item.stock_total || 0), 0).toLocaleString('es-NI')
          ]],
          theme: 'striped',
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { fillColor: [30, 58, 138], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
          showFoot: 'lastPage',
          columnStyles: { 0: { cellWidth: 60 } },
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      // 5b. Top 10 al Costo
      if (exportTopItemsByCost.length > 0) {
        const topWhCost = new Set<string>();
        exportTopItemsByCost.forEach((item: any) => { if (item.capitalByWarehouse) Object.keys(item.capitalByWarehouse).forEach(w => topWhCost.add(w)); });
        const topWhCostCols = Array.from(topWhCost).sort();

        nextY = sectionTitle('Top Inventario por Equipo — al Costo', nextY, [30, 58, 138]);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Producto', ...topWhCostCols, 'Total Costo']],
          body: exportTopItemsByCost.map((item: any) => [
            item.name,
            ...topWhCostCols.map(wh => { const c = item.capitalByWarehouse?.[wh] || 0; return c > 0 ? '$' + c.toLocaleString('es-NI', { maximumFractionDigits: 1 }) : ''; }),
            '$' + (item.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 1 })
          ]),
          foot: [[
            'TOTAL',
            ...topWhCostCols.map(wh => '$' + exportTopItemsByCost.reduce((sum: number, item: any) => sum + (item.capitalByWarehouse?.[wh] || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 1 })),
            '$' + exportTopItemsByCost.reduce((sum: number, item: any) => sum + (item.capital || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 1 })
          ]],
          theme: 'striped',
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { fillColor: [30, 58, 138], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
          showFoot: 'lastPage',
          columnStyles: { 0: { cellWidth: 60 } },
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      // === 6. EXISTENCIAS GENERALES ===
      const catChartData = freshData?.charts?.categoryBreakdown || [];
      const totalUnitsCats = catChartData.reduce((acc: number, c: any) => acc + (c.value || 0), 0);
      const brandChartData = freshData?.charts?.brandBreakdown || [];
      const totalUnitsBrands = brandChartData.reduce((acc: number, b: any) => acc + (b.value || 0), 0);

      // 6a. Inventario por Categorías (Unidades)
      if (catChartData.length > 0) {
        nextY = sectionTitle('Inventario por Categorías en Unidades', nextY, [139, 92, 246]);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Categoría', 'Unidades Totales', '% del Inventario']],
          body: catChartData.map((cat: any) => {
            const pct = totalUnitsCats > 0 ? ((cat.value || 0) / totalUnitsCats) * 100 : 0;
            return [cat.label, (cat.value || 0).toLocaleString('es-NI'), `${pct.toFixed(1)}%`];
          }),
          foot: [['TOTAL', totalUnitsCats.toLocaleString('es-NI'), '100%']],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [139, 92, 246], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
          showFoot: 'lastPage',
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      // 6b. Inventario por Categoría al Costo
      if (exportMoneyCats.length > 0) {
        const totalCatCapital = exportMoneyCats.reduce((acc: number, c: any) => acc + (c.capital || 0), 0);
        nextY = sectionTitle('Inventario por Categoría al Costo', nextY, [139, 92, 246]);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Categoría', 'Capital Invertido', '% del Capital']],
          body: exportMoneyCats.map((cat: any) => {
            const pct = totalCatCapital > 0 ? ((cat.capital || 0) / totalCatCapital) * 100 : 0;
            return [
              cat.label,
              `$${(cat.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
              `${pct.toFixed(1)}%`
            ];
          }),
          foot: [['TOTAL', `$${totalCatCapital.toLocaleString('es-NI', { maximumFractionDigits: 2 })}`, '100%']],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [139, 92, 246], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
          showFoot: 'lastPage',
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      // 6c. Inventario por Marcas (Unidades)
      if (brandChartData.length > 0) {
        nextY = sectionTitle('Top Inventario por Marcas en Unidades', nextY, [245, 158, 11]);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Marca', 'Unidades Totales', '% del Inventario']],
          body: brandChartData.map((brand: any) => {
            const pct = totalUnitsBrands > 0 ? ((brand.value || 0) / totalUnitsBrands) * 100 : 0;
            return [brand.label, (brand.value || 0).toLocaleString('es-NI'), `${pct.toFixed(1)}%`];
          }),
          foot: [['TOTAL', totalUnitsBrands.toLocaleString('es-NI'), '100%']],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [245, 158, 11], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
          showFoot: 'lastPage',
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      // 6d. Inventario por Marcas al Costo
      if (exportMoneyBrands.length > 0) {
        const totalBrandCapital = exportMoneyBrands.reduce((acc: number, b: any) => acc + (b.capital || 0), 0);
        nextY = sectionTitle('Top Inventario por Marcas al Costo', nextY, [245, 158, 11]);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Marca', 'Capital Invertido', '% del Capital']],
          body: exportMoneyBrands.map((brand: any) => {
            const pct = totalBrandCapital > 0 ? ((brand.capital || 0) / totalBrandCapital) * 100 : 0;
            return [
              brand.label,
              `$${(brand.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
              `${pct.toFixed(1)}%`
            ];
          }),
          foot: [['TOTAL', `$${totalBrandCapital.toLocaleString('es-NI', { maximumFractionDigits: 2 })}`, '100%']],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [245, 158, 11], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
          showFoot: 'lastPage',
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      // === 7. TOP 5 / BOTTOM 5 INVENTARIO POR ALMACÉN ===
      if (exportWarehouses.length > 0) {
        const sortedByUnits = [...exportWarehouses].sort((a: any, b: any) => (b.value || 0) - (a.value || 0));
        const top5 = sortedByUnits.slice(0, 5);
        const bottom5 = sortedByUnits.filter((w: any) => (w.value || 0) > 0).reverse().slice(0, 5);

        // 7a. Top 5
        nextY = sectionTitle('Top 5 — Inventario en Existencia por Almacén', nextY, [29, 172, 60]);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Bodega', 'Unidades', 'Capital Invertido']],
          body: top5.map((wh: any) => [
            wh.label || wh.code,
            (wh.value || 0).toLocaleString('es-NI'),
            `$${(wh.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`
          ]),
          foot: [[
            'TOTAL (Top 5)',
            top5.reduce((sum, wh: any) => sum + (wh.value || 0), 0).toLocaleString('es-NI'),
            `$${top5.reduce((sum, wh: any) => sum + (wh.capital || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`
          ]],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [29, 172, 60], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
          showFoot: 'lastPage',
          tableWidth: 160,
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;

        // 7b. Bottom 5
        if (bottom5.length > 0) {
          nextY = sectionTitle('Bottom 5 — Inventario en Existencia por Almacén', nextY, [202, 49, 49]);
          autoTable(doc, {
            startY: nextY + 4,
            head: [['Bodega', 'Unidades', 'Capital Invertido']],
            body: bottom5.map((wh: any) => [
              wh.label || wh.code,
              (wh.value || 0).toLocaleString('es-NI'),
              `$${(wh.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`
            ]),
            foot: [[
              'TOTAL (Bottom 5)',
              bottom5.reduce((sum, wh: any) => sum + (wh.value || 0), 0).toLocaleString('es-NI'),
              `$${bottom5.reduce((sum, wh: any) => sum + (wh.capital || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`
            ]],
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 1.8 },
            headStyles: { fillColor: [202, 49, 49], textColor: 255 },
            footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: marginLeft, right: marginRight },
            showFoot: 'lastPage',
            tableWidth: 160,
          });
          nextY = (doc as any).lastAutoTable.finalY + 12;
        }
      }

      // === 8. PARTICIPACIÓN — TOP INVENTARIO EQUIPOS ===
      if (exportTopItems.length > 0) {
        const totalTopUnits = exportTopItems.reduce((acc: number, item: any) => acc + (item.stock_total || 0), 0);
        nextY = sectionTitle('Participación — Top Inventario Equipos (Unidades)', nextY, [30, 58, 138]);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Producto', 'Unidades', '% Participación']],
          body: exportTopItems.map((item: any) => {
            const pct = totalTopUnits > 0 ? ((item.stock_total || 0) / totalTopUnits) * 100 : 0;
            return [item.name, (item.stock_total || 0).toLocaleString('es-NI'), `${pct.toFixed(1)}%`];
          }),
          foot: [['TOTAL', totalTopUnits.toLocaleString('es-NI'), '100%']],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [30, 58, 138], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
        });
        nextY = (doc as any).lastAutoTable.finalY + 12;
      }

      if (exportTopItemsByCost.length > 0) {
        const totalTopCost = exportTopItemsByCost.reduce((acc: number, item: any) => acc + (item.capital || 0), 0);
        nextY = sectionTitle('Participación — Top Inventario Equipos (al Costo)', nextY, [30, 58, 138]);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Producto', 'Capital', '% Participación']],
          body: exportTopItemsByCost.map((item: any) => {
            const pct = totalTopCost > 0 ? ((item.capital || 0) / totalTopCost) * 100 : 0;
            return [
              item.name,
              `$${(item.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
              `${pct.toFixed(1)}%`
            ];
          }),
          foot: [['TOTAL', `$${totalTopCost.toLocaleString('es-NI', { maximumFractionDigits: 2 })}`, '100%']],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [30, 58, 138], textColor: 255 },
          footStyles: { fillColor: [241, 245, 249], textColor: 31, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: marginLeft, right: marginRight },
        });
      }
      // === 9. INVENTARIO POR ALMACÉN (Gráficos) ===
      if (exportWarehouses.length > 0) {
        const whChartData = exportWarehouses.map((wh: any) => ({ label: wh.label || wh.code, value: wh.value || 0 }));
        // Warehouse bar chart + donut side by side
        doc.addPage();
        nextY = 20;
        // Bar chart left side
        nextY = drawHorizontalBarChart(
          whChartData, marginLeft, nextY, 130, 80,
          'Inventario por Almacén (Unidades)', [14, 165, 233]
        );
        // Donut chart right side
        drawDonutChart(
          whChartData,
          230, 65, 30, 18,
          'Participación - Unidades por Almacén', [14, 165, 233]
        );
        nextY = Math.max(nextY, 120);
      }

      // === 10. GRÁFICOS DE PARTICIPACIÓN (Donut Charts) ===
      if (catChartData.length > 0 || brandChartData.length > 0 || exportTopItems.length > 0) {
        doc.addPage();
        nextY = 25;
        sectionTitle('Resumen de Participación de Inventario', nextY, [14, 165, 233]);
        nextY += 15;

        // Row 1: Category + Brand
        const radius = 26;
        const inner = 16;
        let maxY = nextY;
        if (catChartData.length > 0) {
          const cy1 = drawDonutChart(catChartData, 75, nextY + radius + 10, radius, inner, 'Unidades por Categoría', [139, 92, 246]);
          maxY = Math.max(maxY, cy1);
        }
        if (brandChartData.length > 0) {
          const cy2 = drawDonutChart(brandChartData, 215, nextY + radius + 10, radius, inner, 'Unidades por Marca', [245, 158, 11]);
          maxY = Math.max(maxY, cy2);
        }
        
        nextY = maxY + 25;
        // Row 2: Top Item Units + Cost
        if (exportTopItems.length > 0) {
          const cy3 = drawDonutChart(exportTopItems.map((i: any) => ({ label: i.name, value: i.stock_total })), 75, nextY + radius + 10, radius, inner, 'Top Equipos (Unidades)', [30, 58, 138]);
          maxY = Math.max(maxY, cy3);
        }
        if (exportTopItemsByCost.length > 0) {
          const cy4 = drawDonutChart(exportTopItemsByCost.map((i: any) => ({ label: i.name, value: i.capital })), 215, nextY + radius + 10, radius, inner, 'Top Equipos (al Costo)', [30, 58, 138]);
          maxY = Math.max(maxY, cy4);
        }
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

      // 3. Money Maker Categorías
      const mmCatsRows = exportMoneyCats.map((cat: any) => {
        const percentageUnits = exportStats?.totalStock > 0 ? (cat.stock / exportStats.totalStock) * 100 : 0;
        return `<tr>
          <td>${cat.label}</td>
          <td style="text-align:center">${cat.uniqueSkus || 0}</td>
          <td style="text-align:right">${(cat.stock || 0).toLocaleString('es-NI')}</td>
          <td style="text-align:right">${(cat.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}</td>
          <td style="text-align:center">${percentageUnits.toFixed(1)}%</td>
        </tr>`;
      }).join('');

      // 4. Money Maker Marcas
      const mmBrandsRows = exportMoneyBrands.map((brand: any) => {
        const percentageUnits = exportStats?.totalStock > 0 ? (brand.stock / exportStats.totalStock) * 100 : 0;
        return `<tr>
          <td>${brand.label}</td>
          <td style="text-align:center">${brand.uniqueSkus || 0}</td>
          <td style="text-align:right">${(brand.stock || 0).toLocaleString('es-NI')}</td>
          <td style="text-align:right">${(brand.capital || 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}</td>
          <td style="text-align:center">${percentageUnits.toFixed(1)}%</td>
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

            <h2 class="purple">El "Money Maker" de Categorías</h2>
            <table>
              <thead>
                <tr><th class="purple">Categoría</th><th class="purple">SKUs Diferentes</th><th class="purple">Stock Físico (Unids)</th><th class="purple">Capital Invertido</th><th class="purple">% del Inventario</th></tr>
              </thead>
              <tbody>${mmCatsRows}</tbody>
            </table>

            <h2 class="orange">El "Money Maker" de Marcas</h2>
            <table>
              <thead>
                <tr><th class="orange">Marca</th><th class="orange">SKUs Diferentes</th><th class="orange">Stock Físico (Unids)</th><th class="orange">Capital Invertido</th><th class="orange">% del Inventario</th></tr>
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
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 8px;
          height: 8px;
          transition: background 0.3s ease;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 4px;
        }
        .table-card-hover:hover .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8 !important;
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div className="h-title" style={{ fontSize: 'clamp(18px, 5vw, 24px)' }}>Reportes de Inventario</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={exportToExcel} disabled={exporting === 'excel'}>
            <Download size={16} style={{ marginRight: 6 }} />
            <span style={{ display: isMobile ? 'none' : 'inline' }}>{exporting === 'excel' ? 'Exportando...' : 'Excel'}</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={exportToPDF} disabled={exporting === 'pdf'}>
            <FileText size={16} style={{ marginRight: 6 }} />
            <span style={{ display: isMobile ? 'none' : 'inline' }}>{exporting === 'pdf' ? 'Exportando...' : 'PDF'}</span>
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
            <div className="custom-scrollbar" style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
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
                <tfoot>
                  <tr style={{ background: 'var(--panel)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <td style={{ padding: '10px 12px', textAlign: 'left' }}>Total</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {warehouseData.reduce((acc: number, w: any) => acc + (w.uniqueSkus || 0), 0).toLocaleString('es-NI')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {warehouseData.reduce((acc: number, w: any) => acc + (w.value || 0), 0).toLocaleString('es-NI')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>
                      ${warehouseData.reduce((acc: number, w: any) => acc + (w.capital || 0), 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        <div style={{ fontSize: 12 }}>100.0%</div>
                        <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: '100%', height: '100%', background: '#0ea5e9' }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* NUEVA SECCIÓN: MONEY MAKER DE CATEGORÍAS */}
      <div style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', padding: '12px 20px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>El "Money Maker" de Categorías</h2>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: 2 }}>
          <button
            onClick={() => setCategoryViewMode('consolidated')}
            style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: categoryViewMode === 'consolidated' ? 'white' : 'transparent', color: categoryViewMode === 'consolidated' ? '#6d28d9' : 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            General
          </button>
          <button
            onClick={() => setCategoryViewMode('units')}
            style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: categoryViewMode === 'units' ? 'white' : 'transparent', color: categoryViewMode === 'units' ? '#6d28d9' : 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            Desglose Unids
          </button>
          <button
            onClick={() => setCategoryViewMode('cost')}
            style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: categoryViewMode === 'cost' ? 'white' : 'transparent', color: categoryViewMode === 'cost' ? '#6d28d9' : 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            Desglose Costo
          </button>
        </div>
      </div>
      <div className="table-card-hover">
        <Card>
          <div style={{ padding: 16 }}>
            {loading ? (
              <div style={{ height: 200, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : !reportData?.moneyMakerCategories || reportData.moneyMakerCategories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
                No hay datos de categorías
              </div>
            ) : (() => {
              const uniqueWarehouses = new Set<string>();
              if (categoryViewMode !== 'consolidated') {
                reportData.moneyMakerCategories.forEach((cat: any) => {
                  const source = categoryViewMode === 'units' ? cat.byWarehouse : cat.capitalByWarehouse;
                  if (source) {
                    Object.keys(source).forEach(w => uniqueWarehouses.add(w));
                  }
                });
              }
              const warehouseCols = Array.from(uniqueWarehouses).sort();

              return (
                <div className="custom-scrollbar" style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', minWidth: categoryViewMode !== 'consolidated' ? 400 + (warehouseCols.length * 80) : 600, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--panel)', position: 'sticky', top: 0, zIndex: 1 }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Categoría</th>
                        {categoryViewMode !== 'consolidated' ? (
                          <>
                            {warehouseCols.map(wh => (
                              <th key={wh} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{wh}</th>
                            ))}
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                              {categoryViewMode === 'units' ? 'Total Unids' : 'Total Costo'}
                            </th>
                          </>
                        ) : (
                          <>
                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>SKUs Diferentes</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Stock Físico (Unids)</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Capital Invertido</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>% del Inventario</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.moneyMakerCategories.map((cat: any, idx: number) => {
                        const percentageUnits = stats?.totalStock > 0 ? (cat.stock / stats.totalStock) * 100 : 0;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--panel)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#8b5cf6' }}>{cat.label}</td>
                            {categoryViewMode !== 'consolidated' ? (
                              <>
                                {warehouseCols.map(wh => {
                                  if (categoryViewMode === 'units') {
                                    const qty = cat.byWarehouse?.[wh] || 0;
                                    return (
                                      <td key={wh} style={{ padding: '8px 12px', textAlign: 'right' }}>
                                        {qty > 0 ? qty.toLocaleString('es-NI') : ''}
                                      </td>
                                    );
                                  } else {
                                    const cost = cat.capitalByWarehouse?.[wh] || 0;
                                    return (
                                      <td key={wh} style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontSize: 12 }}>
                                        {cost > 0 ? '$' + cost.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : ''}
                                      </td>
                                    );
                                  }
                                })}
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                                  {categoryViewMode === 'units'
                                    ? (cat.stock || 0).toLocaleString('es-NI')
                                    : '$' + (cat.capital || 0).toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                                  }
                                </td>
                              </>
                            ) : (
                              <>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>{(cat.uniqueSkus || 0).toLocaleString('es-NI')}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{(cat.stock || 0).toLocaleString('es-NI')}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>
                                  ${(cat.capital || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                    <div style={{ fontWeight: 600 }}>{percentageUnits.toFixed(1)}%</div>
                                    <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                      <div style={{ width: `${percentageUnits}%`, height: '100%', background: '#8b5cf6' }} />
                                    </div>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--panel)', position: 'sticky', bottom: 0, zIndex: 1, boxShadow: '0 -4px 6px -1px rgba(0,0,0,0.05)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                        <td style={{ padding: '10px 12px', textAlign: 'left', color: '#8b5cf6' }}>Total</td>
                        {categoryViewMode !== 'consolidated' ? (
                          <>
                            {warehouseCols.map(wh => {
                              if (categoryViewMode === 'units') {
                                const whTotal = reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.byWarehouse?.[wh] || 0), 0);
                                return (
                                  <td key={wh} style={{ padding: '10px 12px', textAlign: 'right' }}>
                                    {whTotal > 0 ? whTotal.toLocaleString('es-NI') : ''}
                                  </td>
                                );
                              } else {
                                const whCost = reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.capitalByWarehouse?.[wh] || 0), 0);
                                return (
                                  <td key={wh} style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>
                                    {whCost > 0 ? '$' + whCost.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : ''}
                                  </td>
                                );
                              }
                            })}
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              {categoryViewMode === 'units'
                                ? reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.stock || 0), 0).toLocaleString('es-NI')
                                : '$' + reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.capital || 0), 0).toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                              }
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              {reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.uniqueSkus || 0), 0).toLocaleString('es-NI')}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              {reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.stock || 0), 0).toLocaleString('es-NI')}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>
                              ${reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.capital || 0), 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                <div style={{ fontWeight: 600 }}>
                                  {(stats?.totalStock > 0
                                    ? (reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.stock || 0), 0) / stats.totalStock) * 100
                                    : 0).toFixed(1)}%
                                </div>
                                <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${Math.min(100, stats?.totalStock > 0 ? (reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.stock || 0), 0) / stats.totalStock) * 100 : 0)}%`,
                                    height: '100%',
                                    background: '#8b5cf6'
                                  }} />
                                </div>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </div>
        </Card>
      </div>

      {/* NUEVA SECCIÓN: MONEY MAKER DE MARCAS */}
      <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '12px 20px', borderRadius: 8, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>El "Money Maker" de Marcas</h2>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: 2 }}>
          <button
            onClick={() => setBrandViewMode('consolidated')}
            style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: brandViewMode === 'consolidated' ? 'white' : 'transparent', color: brandViewMode === 'consolidated' ? '#d97706' : 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            General
          </button>
          <button
            onClick={() => setBrandViewMode('units')}
            style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: brandViewMode === 'units' ? 'white' : 'transparent', color: brandViewMode === 'units' ? '#d97706' : 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            Desglose Unids
          </button>
          <button
            onClick={() => setBrandViewMode('cost')}
            style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: brandViewMode === 'cost' ? 'white' : 'transparent', color: brandViewMode === 'cost' ? '#d97706' : 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            Desglose Costo
          </button>
        </div>
      </div>
      <div className="table-card-hover">
        <Card>
          <div style={{ padding: 16 }}>
            {loading ? (
              <div style={{ height: 200, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : !reportData?.moneyMakerBrands || reportData.moneyMakerBrands.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
                No hay datos de marcas
              </div>
            ) : (() => {
              const uniqueWarehouses = new Set<string>();
              if (brandViewMode !== 'consolidated') {
                reportData.moneyMakerBrands.forEach((brand: any) => {
                  const source = brandViewMode === 'units' ? brand.byWarehouse : brand.capitalByWarehouse;
                  if (source) {
                    Object.keys(source).forEach(w => uniqueWarehouses.add(w));
                  }
                });
              }
              const warehouseCols = Array.from(uniqueWarehouses).sort();

              return (
                <div className="custom-scrollbar" style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', minWidth: brandViewMode !== 'consolidated' ? 400 + (warehouseCols.length * 80) : 600, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--panel)', position: 'sticky', top: 0, zIndex: 1 }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Marca</th>
                        {brandViewMode !== 'consolidated' ? (
                          <>
                            {warehouseCols.map(wh => (
                              <th key={wh} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{wh}</th>
                            ))}
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                              {brandViewMode === 'units' ? 'Total Unids' : 'Total Costo'}
                            </th>
                          </>
                        ) : (
                          <>
                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>SKUs Diferentes</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Stock Físico (Unids)</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Capital Invertido</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>% del Inventario</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.moneyMakerBrands.map((brand: any, idx: number) => {
                        const percentageUnits = stats?.totalStock > 0 ? (brand.stock / stats.totalStock) * 100 : 0;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--panel)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f59e0b' }}>{brand.label}</td>
                            {brandViewMode !== 'consolidated' ? (
                              <>
                                {warehouseCols.map(wh => {
                                  if (brandViewMode === 'units') {
                                    const qty = brand.byWarehouse?.[wh] || 0;
                                    return (
                                      <td key={wh} style={{ padding: '8px 12px', textAlign: 'right' }}>
                                        {qty > 0 ? qty.toLocaleString('es-NI') : ''}
                                      </td>
                                    );
                                  } else {
                                    const cost = brand.capitalByWarehouse?.[wh] || 0;
                                    return (
                                      <td key={wh} style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontSize: 12 }}>
                                        {cost > 0 ? '$' + cost.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : ''}
                                      </td>
                                    );
                                  }
                                })}
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                                  {brandViewMode === 'units'
                                    ? (brand.stock || 0).toLocaleString('es-NI')
                                    : '$' + (brand.capital || 0).toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                                  }
                                </td>
                              </>
                            ) : (
                              <>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>{(brand.uniqueSkus || 0).toLocaleString('es-NI')}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{(brand.stock || 0).toLocaleString('es-NI')}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>
                                  ${(brand.capital || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                    <div style={{ fontWeight: 600 }}>{percentageUnits.toFixed(1)}%</div>
                                    <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                      <div style={{ width: `${percentageUnits}%`, height: '100%', background: '#f59e0b' }} />
                                    </div>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--panel)', position: 'sticky', bottom: 0, zIndex: 1, boxShadow: '0 -4px 6px -1px rgba(0,0,0,0.05)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                        <td style={{ padding: '10px 12px', textAlign: 'left', color: '#f59e0b' }}>Total</td>
                        {brandViewMode !== 'consolidated' ? (
                          <>
                            {warehouseCols.map(wh => {
                              if (brandViewMode === 'units') {
                                const whTotal = reportData.moneyMakerBrands.reduce((acc: number, b: any) => acc + (b.byWarehouse?.[wh] || 0), 0);
                                return (
                                  <td key={wh} style={{ padding: '10px 12px', textAlign: 'right' }}>
                                    {whTotal > 0 ? whTotal.toLocaleString('es-NI') : ''}
                                  </td>
                                );
                              } else {
                                const whCost = reportData.moneyMakerBrands.reduce((acc: number, b: any) => acc + (b.capitalByWarehouse?.[wh] || 0), 0);
                                return (
                                  <td key={wh} style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>
                                    {whCost > 0 ? '$' + whCost.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : ''}
                                  </td>
                                );
                              }
                            })}
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              {brandViewMode === 'units'
                                ? reportData.moneyMakerBrands.reduce((acc: number, b: any) => acc + (b.stock || 0), 0).toLocaleString('es-NI')
                                : '$' + reportData.moneyMakerBrands.reduce((acc: number, b: any) => acc + (b.capital || 0), 0).toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                              }
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              {reportData.moneyMakerBrands.reduce((acc: number, b: any) => acc + (b.uniqueSkus || 0), 0).toLocaleString('es-NI')}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              {reportData.moneyMakerBrands.reduce((acc: number, b: any) => acc + (b.stock || 0), 0).toLocaleString('es-NI')}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>
                              ${reportData.moneyMakerBrands.reduce((acc: number, b: any) => acc + (b.capital || 0), 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                <div style={{ fontWeight: 600 }}>
                                  {(stats?.totalStock > 0
                                    ? (reportData.moneyMakerBrands.reduce((acc: number, b: any) => acc + (b.stock || 0), 0) / stats.totalStock) * 100
                                    : 0).toFixed(1)}%
                                </div>
                                <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${Math.min(100, stats?.totalStock > 0 ? (reportData.moneyMakerBrands.reduce((acc: number, b: any) => acc + (b.stock || 0), 0) / stats.totalStock) * 100 : 0)}%`,
                                    height: '100%',
                                    background: '#f59e0b'
                                  }} />
                                </div>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </div>
        </Card>
      </div>

      {/* NUEVA SECCIÓN: TOP INVENTARIO POR EQUIPO UNIDAD */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)', padding: '12px 20px', borderRadius: 8, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>Top Inventario por Equipo ({topItemsViewMode === 'units' ? 'Unidad' : 'al Costo'})</h2>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: 2 }}>
          <button
            onClick={() => setTopItemsViewMode('units')}
            style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: topItemsViewMode === 'units' ? 'white' : 'transparent', color: topItemsViewMode === 'units' ? '#1e3a8a' : 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            Unidades
          </button>
          <button
            onClick={() => setTopItemsViewMode('cost')}
            style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: topItemsViewMode === 'cost' ? 'white' : 'transparent', color: topItemsViewMode === 'cost' ? '#1e3a8a' : 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            Al Costo
          </button>
        </div>
      </div>
      <div className="table-card-hover" style={{ marginTop: 14 }}>
        <Card>
          <div style={{ padding: 16 }}>
            {loading ? (
              <div style={{ height: 200, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : !reportData?.topInventoryItems || reportData.topInventoryItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
                No hay datos de productos
              </div>
            ) : (() => {
              const currentItems = topItemsViewMode === 'units' 
                ? reportData.topInventoryItems || [] 
                : reportData.topInventoryItemsByCost || [];
              
              if (currentItems.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
                    No hay datos de productos para esta vista
                  </div>
                );
              }

              const uniqueWarehouses = new Set<string>();
              currentItems.forEach((item: any) => {
                const source = item.byWarehouse;
                if (source) {
                  Object.keys(source).forEach(w => uniqueWarehouses.add(w));
                }
              });
              const warehouseCols = Array.from(uniqueWarehouses).sort();

              return (
                <div className="custom-scrollbar" style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', minWidth: 400 + (warehouseCols.length * 80), borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--panel)', position: 'sticky', top: 0, zIndex: 1 }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Nombre del Producto</th>
                        {warehouseCols.map(wh => (
                          <th key={wh} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{wh}</th>
                        ))}
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentItems.map((item: any, idx: number) => {
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--panel)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#ffffffff' }}>{item.name}</td>
                            {warehouseCols.map(wh => {
                              if (topItemsViewMode === 'units') {
                                const qty = item.byWarehouse?.[wh] || 0;
                                return (
                                  <td key={wh} style={{ padding: '8px 12px', textAlign: 'right' }}>
                                    {qty > 0 ? qty.toLocaleString('es-NI') : ''}
                                  </td>
                                );
                              } else {
                                const cost = item.capitalByWarehouse?.[wh] || 0;
                                return (
                                  <td key={wh} style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontSize: 12 }}>
                                    {cost > 0 ? '$' + cost.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : ''}
                                  </td>
                                );
                              }
                            })}
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                              {topItemsViewMode === 'units'
                                ? (item.stock_total || 0).toLocaleString('es-NI')
                                : '$' + (item.capital || 0).toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--panel)', position: 'sticky', bottom: 0, zIndex: 1, boxShadow: '0 -4px 6px -1px rgba(0,0,0,0.05)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                        <td style={{ padding: '10px 12px', textAlign: 'left', color: '#ffffffff' }}>Total</td>
                        {warehouseCols.map(wh => {
                          if (topItemsViewMode === 'units') {
                            const whTotal = currentItems.reduce((acc: number, item: any) => acc + (item.byWarehouse?.[wh] || 0), 0);
                            return (
                              <td key={wh} style={{ padding: '10px 12px', textAlign: 'right' }}>
                                {whTotal > 0 ? whTotal.toLocaleString('es-NI') : ''}
                              </td>
                            );
                          } else {
                            const whCost = currentItems.reduce((acc: number, item: any) => acc + (item.capitalByWarehouse?.[wh] || 0), 0);
                            return (
                              <td key={wh} style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>
                                {whCost > 0 ? '$' + whCost.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : ''}
                              </td>
                            );
                          }
                        })}
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {topItemsViewMode === 'units'
                            ? currentItems.reduce((acc: number, item: any) => acc + (item.stock_total || 0), 0).toLocaleString('es-NI')
                            : '$' + currentItems.reduce((acc: number, item: any) => acc + (item.capital || 0), 0).toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                          }
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </div>
        </Card>
      </div>



      {/* SECCIÓN 2: EXISTENCIAS GENERALES */}
      <div style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', padding: '12px 20px', borderRadius: 8 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>EXISTENCIAS GENERALES</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 14 }}>
        <ChartCard title="Inventario por Categorías en Unidades">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = charts?.categoryBreakdown;
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

        <ChartCard title="Inventario por Categoría al Costo $">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = reportData?.moneyMakerCategories?.map((c: any) => ({ label: c.label, value: c.capital }));
            const total = data?.reduce((sum: number, d: any) => sum + d.value, 0) || 0;
            return data && data.length > 0 ? (
              <HorizontalBarChart
                data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))}
                height={300}
                showValues={true}
                showPercentage={true}
                totalValue={total}
                valueFormatter={(v) => '$' + v.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 14 }}>
        <ChartCard title="Top Inventario por Marcas en Unidades">
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

        <ChartCard title="Top Inventario por Marcas al Costo $">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = reportData?.moneyMakerBrands?.map((c: any) => ({ label: c.label, value: c.capital }));
            const total = data?.reduce((sum: number, d: any) => sum + d.value, 0) || 0;
            return data && data.length > 0 ? (
              <HorizontalBarChart
                data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))}
                height={300}
                showValues={true}
                showPercentage={true}
                totalValue={total}
                valueFormatter={(v) => '$' + v.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 14 }}>
        <ChartCard title={
          <div style={{ backgroundColor: '#1dac3cff', color: 'white', padding: '8px 12px', borderRadius: '4px', fontSize: '1rem', fontWeight: 'bold' }}>
            Top 5 - Inventario en Existencia por Almacén
          </div>
        }>
          {warehouseLoading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const rawData = warehouseData ? [...warehouseData].sort((a: any, b: any) => b.value - a.value).slice(0, 5) : [];
            const data = rawData.map(w => ({ label: w.label || w.code, value: w.value }));
            const total = rawData.reduce((sum: number, w: any) => sum + (w.value || 0), 0);
            return data && data.length > 0 ? (
              <HorizontalBarChart
                data={data.map((d: any, i: number) => ({ ...d, color: generateColors(5)[i] }))}
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

        <ChartCard
          title={
            <div style={{ backgroundColor: '#ca3131ff', color: 'white', padding: '8px 12px', borderRadius: '4px', fontSize: '1rem', fontWeight: 'bold' }}>
              Bottom 5 - Inventario en Existencia por Almacén
            </div>
          }
        >
          {warehouseLoading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const rawData = warehouseData ? [...warehouseData].filter((w: any) => w.value > 0).sort((a: any, b: any) => a.value - b.value).slice(0, 5) : [];
            const data = rawData.map(w => ({ label: w.label || w.code, value: w.value }));
            const total = rawData.reduce((sum: number, w: any) => sum + (w.value || 0), 0);
            return data && data.length > 0 ? (
              <HorizontalBarChart
                data={data.map((d: any, i: number) => ({ ...d, color: generateColors(5)[i] }))}
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
        <ChartCard title="Participación de Inventario - Unidades por Categoría">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = charts?.categoryBreakdown;
            return data && data.length > 0 ? (
              <PieChart data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))} size={250} innerRadius={65} />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>

        <ChartCard title="Participación de Inventario - Unidades por Marca">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = charts?.brandBreakdown;
            return data && data.length > 0 ? (
              <PieChart data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))} size={250} innerRadius={65} />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 14, marginTop: 14 }}>
        <ChartCard title="Participación - Top Inventario Equipos (Unidades)">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = reportData?.topInventoryItems?.map((item: any) => ({
              label: item.name,
              value: item.stock_total
            })) || [];
            return data && data.length > 0 ? (
              <PieChart data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))} size={250} innerRadius={65} unit="unids" />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>

        <ChartCard title="Participación - Top Inventario Equipos (al Costo)">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = reportData?.topInventoryItemsByCost?.map((item: any) => ({
              label: item.name,
              value: item.capital
            })) || [];
            return data && data.length > 0 ? (
              <PieChart
                data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))}
                size={250}
                innerRadius={65}
                valueFormatter={(v) => '$' + v.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              />
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

        <ChartCard title="Participación de Inventario - Unidades por Almacén">
          {warehouseLoading ? (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 8 }}>
              <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Cargando bodegas...
            </div>
          ) : warehouseData && warehouseData.length > 0 ? (
            <PieChart data={warehouseData.map((d: any, i: number) => ({ ...d, color: generateColors(warehouseData.length)[i] }))} size={250} innerRadius={65} />
          ) : (
            <ReportPlaceholder title={warehouseData ? "Sin datos" : "Cargando..."} height={300} />
          )}
        </ChartCard>
      </div>

    </div>
  );
}
