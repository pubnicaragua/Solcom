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
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export const dynamic = 'force-dynamic';

// Utility component for mobile view
function MobileReportCard({ title, label, total, warehouses, data, color }: {
  title: string;
  label: string;
  total: string;
  warehouses: { code: string; label: string }[];
  data: { [key: string]: number | string };
  color?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: 12,
        padding: 16,
        border: '1px solid var(--border)',
        marginBottom: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        borderLeft: color ? `4px solid ${color}` : '1px solid var(--border)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 2, fontWeight: 500 }}>{label}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{title}</div>
        </div>
        <div style={{ textAlign: 'right', marginLeft: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fbbf24' }}>{total}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, padding: 10, background: 'rgba(0,0,0,0.15)', borderRadius: 8 }}>
        {warehouses.map(w => {
          const qty = data[w.code];
          if (qty === undefined || qty === null) return null;
          return (
            <div key={w.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{w.code}:</span>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: (typeof qty === 'string' && qty.endsWith('$'))
                  ? '#10b981' // Green for money
                  : (typeof qty === 'number' ? qty > 0 : !!qty)
                    ? '#e2e8f0'
                    : 'rgba(255,255,255,0.2)'
              }}>
                {qty}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [period, setPeriod] = useState('30');
  const [isMobile, setIsMobile] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
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
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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

  // Shared Chart Canvas Helpers
  const drawBarChart = (data: any[], title: string, horizontal = true, color: string | string[] = '#3b82f6', valueFormatter?: (v: number) => string, showTotal = false) => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 450;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 900, 450);

    const margin = { top: 60, right: 60, bottom: 60, left: 280 };
    const chartWidth = 900 - margin.left - margin.right;
    const chartHeight = 450 - margin.top - margin.bottom;

    const maxVal = Math.max(...data.map(d => d.value), 1);
    const total = data.reduce((s, d) => s + (d.value || 0), 0);
    const palette = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, 450, 30);

    data.slice(0, 10).forEach((item, i) => {
      const val = item.value || 0;
      const barColor = Array.isArray(color) ? color[i % color.length] : (color === 'multi' ? palette[i % palette.length] : color);
      
      if (horizontal) {
        const barHeight = (chartHeight / Math.min(data.length, 10)) * 0.7;
        const gap = (chartHeight / Math.min(data.length, 10)) * 0.3;
        const w = (val / maxVal) * chartWidth;
        const x = margin.left;
        const y = margin.top + i * (barHeight + gap) + gap / 2;

        ctx.fillStyle = barColor;
        ctx.fillRect(x, y, w, barHeight);
        
        ctx.fillStyle = '#475569';
        ctx.font = '11px Arial';
        ctx.textAlign = 'right';
        const label = item.label.length > 55 ? item.label.substring(0, 52) + '...' : item.label;
        ctx.fillText(label, x - 10, y + barHeight / 2 + 4);
        
        ctx.textAlign = 'left';
        const pct = total > 0 ? ` (${((val / total) * 100).toFixed(1)}%)` : '';
        const displayVal = valueFormatter ? valueFormatter(val) : val.toLocaleString('es-NI');
        ctx.fillText(`${displayVal}${pct}`, x + w + 10, y + barHeight / 2 + 4);
      } else {
        const barWidth = (chartWidth / Math.min(data.length, 10)) * 0.7;
        const gap = (chartWidth / Math.min(data.length, 10)) * 0.3;
        const h = (val / maxVal) * chartHeight;
        const x = margin.left + i * (barWidth + gap) + gap / 2;
        const y = 450 - margin.bottom - h;

        ctx.fillStyle = barColor;
        ctx.fillRect(x, y, barWidth, h);
        
        ctx.fillStyle = '#475569';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        const label = item.label.length > 15 ? item.label.substring(0, 12) + '...' : item.label;
        ctx.fillText(label, x + barWidth / 2, 450 - margin.bottom + 15);
        ctx.fillText(valueFormatter ? valueFormatter(val) : val.toLocaleString('es-NI'), x + barWidth / 2, y - 8);
      }
    });

    if (showTotal) {
      ctx.fillStyle = '#1e3a8a';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(`Total: ${total.toLocaleString('es-NI')} unidades`, 900 - margin.right, 435);
    }

    return canvas.toDataURL('image/png');
  };

  const drawDonutChart = (data: any[], title: string, valueFormatter?: (v: number) => string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 450;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1000, 450);

    const centerX = 280, centerY = 225, radius = 130, innerRadius = 75;
    const total = data.reduce((s, d) => s + (d.value || 0), 0);

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, 500, 35);

    const palette = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];

    let currentAngle = -0.5 * Math.PI;
    data.slice(0, 10).forEach((item, i) => {
      const sliceAngle = ((item.value || 0) / (total || 1)) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = palette[i % palette.length];
      ctx.fillRect(580, 70 + i * 28, 14, 14);
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'left';
      ctx.font = '12px Arial';
      const pct = (((item.value || 0) / (total || 1)) * 100).toFixed(1);
      const label = (item.label || 'N/A');
      const truncatedLabel = label.length > 45 ? label.substring(0, 42) + '...' : label;
      const valStr = valueFormatter ? ` - ${valueFormatter(item.value || 0)}` : '';
      ctx.fillText(`${truncatedLabel}${valStr} (${pct}%)`, 605, 82 + i * 28);
      currentAngle += sliceAngle;
    });

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(valueFormatter ? valueFormatter(total) : total.toLocaleString('es-NI'), centerX, centerY + 8);

    return canvas.toDataURL('image/png');
  };

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
        [59, 130, 246], [139, 92, 246], [16, 185, 129], [245, 158, 11], [239, 68, 68],
        [236, 72, 153], [20, 184, 166], [249, 115, 22], [99, 102, 241], [132, 204, 22]
      ];
      const getColor = (i: number): [number, number, number] => pdfColors[i % pdfColors.length];

      // Helper: draw donut chart manually deleted (replaced by image charts)
      // Helper: draw horizontal bar chart manually deleted (replaced by image charts)

      // === LOAD LOGO IMAGE ===
      let logoDataUrl: string | null = null;
      try {
        logoDataUrl = await new Promise<string | null>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL('image/png'));
            } else {
              resolve(null);
            }
          };
          img.onerror = () => resolve(null);
          img.src = '/solcom-logo.png';
        });
      } catch { /* logo will be skipped if load fails */ }

      // === CABECERA ===
      doc.setFillColor(220, 38, 38);
      doc.rect(0, 0, pageWidth, 24, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text('Reporte Ejecutivo de Inventario', marginLeft, 14);
      doc.setFontSize(9);
      doc.text(`Generado: ${new Date().toLocaleString('es-NI')}`, marginLeft, 20);
      // SOLCOM logo image — top right
      if (logoDataUrl) {
        const logoH = 18;
        const logoW = 28;
        const logoX = pageWidth - marginRight - logoW;
        const logoY = 3;
        // White background behind logo for contrast
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(logoX - 2, logoY - 1, logoW + 4, logoH + 2, 2, 2, 'F');
        doc.addImage(logoDataUrl, 'PNG', logoX, logoY, logoW, logoH);
      } else {
        // Fallback text
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('SOLCOM', pageWidth - marginRight, 16, { align: 'right' });
        doc.setFont('helvetica', 'normal');
      }

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

        const totalSkusAll = exportWarehouses.reduce((acc: number, w: any) => acc + (w.uniqueSkus || 0), 0);
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Bodega/Almacén', 'SKUs Únicos', 'Unidades', '% Unids', 'Capital Invertido', '% Capital']],
          body: whRowsPDF,
          foot: [['TOTAL', String(totalSkusAll.toLocaleString('es-NI')), String(totalUnitsAll.toLocaleString('es-NI')), '100.0%', `$${totalCapitalAll.toLocaleString('es-NI', { maximumFractionDigits: 2 })}`, '100.0%']],
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
            String(exportMoneyCats.reduce((sum: number, c: any) => sum + (c.uniqueSkus || 0), 0).toLocaleString('es-NI')),
            String(exportMoneyCats.reduce((sum: number, c: any) => sum + (c.stock || 0), 0).toLocaleString('es-NI')),
            `$${exportMoneyCats.reduce((sum: number, c: any) => sum + (c.capital || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
            '100.0%'
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
            showFoot: 'lastPage',
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
            showFoot: 'lastPage',
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
            String(exportMoneyBrands.reduce((sum: number, b: any) => sum + (b.uniqueSkus || 0), 0).toLocaleString('es-NI')),
            String(exportMoneyBrands.reduce((sum: number, b: any) => sum + (b.stock || 0), 0).toLocaleString('es-NI')),
            `$${exportMoneyBrands.reduce((sum: number, b: any) => sum + (b.capital || 0), 0).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`,
            '100.0%'
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
            showFoot: 'lastPage',
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
            showFoot: 'lastPage',
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
            ...topWhUnitsCols.map(wh => String(exportTopItems.reduce((sum: number, item: any) => sum + (item.byWarehouse?.[wh] || 0), 0).toLocaleString('es-NI'))),
            String(exportTopItems.reduce((sum: number, item: any) => sum + (item.stock_total || 0), 0).toLocaleString('es-NI'))
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

      // Setup data for visual charts
      const catChartData = freshData?.charts?.categoryBreakdown || [];
      const brandChartData = freshData?.charts?.brandBreakdown || [];

      // === 9. GRÁFICOS DE EXISTENCIAS GENERALES (Imágenes Premium) ===
      doc.addPage();
      nextY = 20;
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text('Análisis Visual de Existencias Generales', marginLeft, nextY);
      nextY += 10;

      const chartW = 132;
      const barH = 66; // 2:1 aspect
      const donutH = 60; // 2.22:1 aspect

      // Almacenes
      if (exportWarehouses.length > 0) {
        const whData = exportWarehouses.map((wh: any) => ({ label: wh.label || wh.code, value: wh.value || 0 }));
        const whImg = drawBarChart(whData, 'Inventario por Almacén (Unidades)', false, '#0ea5e9');
        if (whImg) doc.addImage(whImg, 'PNG', marginLeft, nextY, chartW, barH);
        
        const whDonut = drawDonutChart(whData, 'Participación por Almacén');
        if (whDonut) doc.addImage(whDonut, 'PNG', marginLeft + chartW + 5, nextY, chartW, donutH);
        nextY += barH + 10;
      }

      // Categorías
      if (catChartData.length > 0) {
        const catImg = drawBarChart(catChartData, 'Inventario por Categorías (Unidades)', true, '#8b5cf6');
        if (catImg) {
          if (nextY + barH > pageHeight - 15) { doc.addPage(); nextY = 20; }
          doc.addImage(catImg, 'PNG', marginLeft, nextY, chartW, barH);
        }
        
        const catDonut = drawDonutChart(catChartData, 'Participación por Categoría');
        if (catDonut) doc.addImage(catDonut, 'PNG', marginLeft + chartW + 5, nextY, chartW, donutH);
        nextY += barH + 10;
      }

      // Marcas
      if (brandChartData.length > 0) {
        const brandImg = drawBarChart(brandChartData, 'Inventario por Marcas (Unidades)', true, '#f59e0b');
        if (brandImg) {
          if (nextY + barH > pageHeight - 15) { doc.addPage(); nextY = 20; }
          doc.addImage(brandImg, 'PNG', marginLeft, nextY, chartW, barH);
        }
        
        const brandDonut = drawDonutChart(brandChartData, 'Participación por Marca');
        if (brandDonut) doc.addImage(brandDonut, 'PNG', marginLeft + chartW + 5, nextY, chartW, donutH);
        nextY += barH + 10;
      }

      // Top Equipos
      if (exportTopItems.length > 0) {
        const topUnitsDonut = drawDonutChart(exportTopItems.map((i: any) => ({ label: i.name, value: i.stock_total })), 'Top Equipos (Unidades)');
        if (topUnitsDonut) {
          if (nextY + donutH > pageHeight - 15) { doc.addPage(); nextY = 20; }
          doc.addImage(topUnitsDonut, 'PNG', marginLeft, nextY, chartW, donutH);
        }
        
        if (exportTopItemsByCost.length > 0) {
          const topCostDonut = drawDonutChart(exportTopItemsByCost.map((i: any) => ({ label: i.name, value: i.capital })), 'Top Equipos (al Costo)', v => '$' + v.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
          if (topCostDonut) doc.addImage(topCostDonut, 'PNG', marginLeft + chartW + 5, nextY, chartW, donutH);
        }
        nextY += donutH + 10;
      }

      // Top 5 / Bottom 5 Warehouses
      if (exportWarehouses.length > 0) {
        const sortedWh = [...exportWarehouses].sort((a: any, b: any) => (b.value || 0) - (a.value || 0));
        const top5Data = sortedWh.slice(0, 5).map(wh => ({ label: wh.label || wh.code, value: wh.value || 0 }));
        const bottom5Data = sortedWh.filter(w => w.value > 0).reverse().slice(0, 5).map(wh => ({ label: wh.label || wh.code, value: wh.value || 0 }));

        if (top5Data.length > 0) {
          const top5Img = drawBarChart(top5Data, 'Top 5 - Inventario en Existencia por Almacén', true, 'multi', undefined, true);
          if (top5Img) {
            if (nextY + barH > pageHeight - 15) { doc.addPage(); nextY = 20; }
            doc.addImage(top5Img, 'PNG', marginLeft, nextY, chartW, barH);
          }
        }

        if (bottom5Data.length > 0) {
          const bottom5Img = drawBarChart(bottom5Data, 'Bottom 5 - Inventario en Existencia por Almacén', true, 'multi', undefined, true);
          if (bottom5Img) {
            if (nextY + barH > pageHeight - 15) { doc.addPage(); nextY = 20; }
            doc.addImage(bottom5Img, 'PNG', marginLeft + chartW + 5, nextY, chartW, barH);
          }
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
      const exportMoneyCats = freshData?.moneyMakerCategories || [];
      const exportMoneyBrands = freshData?.moneyMakerBrands || [];
      const exportTopItems = freshData?.topInventoryItems || [];
      const exportTopItemsByCost = freshData?.topInventoryItemsByCost || [];
      const chartsData = freshData?.charts || {};

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Solcom Dashboard';
      workbook.lastModifiedBy = 'Solcom Dashboard';
      workbook.created = new Date();
      workbook.modified = new Date();

      const sheet = workbook.addWorksheet('Reporte de Inventario');

      // Styles
      const headerStyle: Partial<ExcelJS.Style> = {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      };

      const titleStyle: Partial<ExcelJS.Style> = {
        font: { bold: true, size: 16, color: { argb: 'FFDC2626' } },
        alignment: { horizontal: 'left', vertical: 'middle' }
      };

      const footerStyle: Partial<ExcelJS.Style> = {
        font: { bold: true },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } },
        border: { top: { style: 'thin' }, bottom: { style: 'double' } }
      };

      // Table Header Styles by type
      const blueHeader: Partial<ExcelJS.Style> = { ...headerStyle, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } } };
      const purpleHeader: Partial<ExcelJS.Style> = { ...headerStyle, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } } };
      const orangeHeader: Partial<ExcelJS.Style> = { ...headerStyle, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } } };
      const navyHeader: Partial<ExcelJS.Style> = { ...headerStyle, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } } };

      // Logo and Title
      sheet.mergeCells('A1:F3');
      const titleCell = sheet.getCell('A1');
      titleCell.value = 'Reporte Ejecutivo de Inventario';
      titleCell.style = titleStyle;

      // Add Logo
      try {
        const logoResponse = await fetch('/solcom-logo.png');
        const logoBlob = await logoResponse.blob();
        const logoArrayBuffer = await logoBlob.arrayBuffer();
        const logoImage = workbook.addImage({
          buffer: logoArrayBuffer,
          extension: 'png',
        });
        sheet.addImage(logoImage, {
          tl: { col: 6, row: 0 },
          ext: { width: 150, height: 60 }
        });
      } catch (e) { console.error('Error loading logo for Excel', e); }

      let currentRow = 5;

      // Info
      sheet.getCell(`A${currentRow}`).value = `Generado: ${new Date().toLocaleString('es-NI')}`;
      sheet.getCell(`A${currentRow}`).font = { italic: true };
      currentRow += 2;

      // Active Filters
      const activeFilters: string[] = [];
      if (globalFilters.category) activeFilters.push(`Categoría: ${globalFilters.category}`);
      if (globalFilters.marca) activeFilters.push(`Marca: ${globalFilters.marca}`);
      if (globalFilters.warehouse) activeFilters.push(`Almacén: ${globalFilters.warehouse}`);
      if (globalFilters.state) activeFilters.push(`Estado: ${globalFilters.state}`);
      if (globalFilters.color) activeFilters.push(`Color: ${globalFilters.color}`);
      
      if (activeFilters.length > 0) {
        sheet.getCell(`A${currentRow}`).value = `Filtros: ${activeFilters.join(' | ')}`;
        sheet.getCell(`A${currentRow}`).font = { color: { argb: 'FFDC2626' }, bold: true };
        currentRow += 2;
      }

      // 1. Summary Table
      sheet.getCell(`A${currentRow}`).value = 'Resumen General';
      sheet.getCell(`A${currentRow}`).font = { bold: true };
      currentRow++;

      const summaryData = [
        ['Total Productos', exportStats?.totalProducts || 0, 'Total Stock', (exportStats?.totalStock || 0)],
        ['Valor Estimado', exportStats?.totalValue || 0, 'Stock Bajo', exportStats?.lowStockItems || 0],
        ['Sin Stock', exportStats?.outOfStockItems || 0, 'Bodegas Activas', exportStats?.activeWarehouses || 0]
      ];

      summaryData.forEach((rowItems, i) => {
        const row = sheet.addRow(rowItems);
        if (i === 1) row.getCell(2).numFmt = '"$"#,##0.00';
        row.eachCell((cell, colNum) => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          if (colNum === 1 || colNum === 3) cell.font = { bold: true };
        });
        currentRow++;
      });
      currentRow += 2;

      // 2. Distribution by Warehouse
      sheet.getCell(`A${currentRow}`).value = 'Distribución de Capital por Bodega';
      sheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FF0EA5E9' } };
      currentRow++;

      const whHeaderRow = sheet.addRow(['Bodega/Almacén', 'SKUs Únicos', 'Unidades', '% Unids', 'Capital Invertido', '% Capital']);
      whHeaderRow.eachCell(cell => cell.style = blueHeader);
      currentRow++;

      const totalUnitsAll = exportWarehouses.reduce((acc: number, w: any) => acc + (w.value || 0), 0);
      const totalCapitalAll = exportWarehouses.reduce((acc: number, w: any) => acc + (w.capital || 0), 0);
      const totalSkusAll = exportWarehouses.reduce((acc: number, w: any) => acc + (w.uniqueSkus || 0), 0);

      exportWarehouses.forEach((wh: any) => {
        const pctU = totalUnitsAll > 0 ? (wh.value || 0) / totalUnitsAll : 0;
        const pctC = totalCapitalAll > 0 ? (wh.capital || 0) / totalCapitalAll : 0;
        const r = sheet.addRow([
          wh.label || wh.code,
          wh.uniqueSkus || 0,
          wh.value || 0,
          pctU,
          wh.capital || 0,
          pctC
        ]);
        r.getCell(4).numFmt = '0.0%';
        r.getCell(5).numFmt = '"$"#,##0.00';
        r.getCell(6).numFmt = '0.0%';
        currentRow++;
      });

      const whTotalRow = sheet.addRow(['TOTAL', totalSkusAll, totalUnitsAll, 1, totalCapitalAll, 1]);
      whTotalRow.eachCell((cell, colNum) => {
        cell.style = { ...footerStyle };
        if (colNum === 2 || colNum === 3) cell.numFmt = '#,##0';
        if (colNum === 4 || colNum === 6) cell.numFmt = '0.0%';
        if (colNum === 5) cell.numFmt = '"$"#,##0.00';
      });
      currentRow += 2;

      // Helper for Grid Tables
      const addGridTable = (title: string, data: any[], warehouseCols: string[], type: 'units' | 'cost', headerStyle: any) => {
        sheet.getCell(`A${currentRow}`).value = title;
        sheet.getCell(`A${currentRow}`).font = { bold: true, color: headerStyle.fill.fgColor };
        currentRow++;

        const headers = ['Nombre', ...warehouseCols, 'Total'];
        const hRow = sheet.addRow(headers);
        hRow.eachCell(cell => cell.style = headerStyle);
        currentRow++;

        const colTotals = new Array(warehouseCols.length + 1).fill(0);

        data.forEach(item => {
          const rowData = [item.label || item.name];
          warehouseCols.forEach((wh, idx) => {
            const val = (type === 'units' ? item.byWarehouse?.[wh] : item.capitalByWarehouse?.[wh]) || 0;
            rowData.push(val);
            colTotals[idx] += val;
          });
          const totalValue = (type === 'units' ? item.stock : item.capital) || 0;
          rowData.push(totalValue);
          colTotals[warehouseCols.length] += totalValue;

          const r = sheet.addRow(rowData);
          if (type === 'cost') {
            for (let i = 2; i <= warehouseCols.length + 2; i++) {
              r.getCell(i).numFmt = '"$"#,##0.00';
            }
          }
          currentRow++;
        });

        const fRow = sheet.addRow(['TOTAL', ...colTotals]);
        fRow.eachCell((cell, colNum) => {
          cell.style = { ...footerStyle };
          if (colNum > 1) {
            if (type === 'cost') {
              cell.numFmt = '"$"#,##0.00';
            } else {
              cell.numFmt = '#,##0';
            }
          }
        });
        currentRow += 2;
      };

      const whCols = exportWarehouses.map((w: any) => w.label || w.code).sort();

      // 3. Money Maker Categories
      // 3a. General
      sheet.getCell(`A${currentRow}`).value = 'Money Maker Categorías — General';
      sheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FF8B5CF6' } };
      currentRow++;
      const mmCatHeader = sheet.addRow(['Categoría', 'SKUs Diferentes', 'Stock Físico (Unids)', 'Capital Invertido', '% del Inventario']);
      mmCatHeader.eachCell(cell => cell.style = purpleHeader);
      currentRow++;

      let totalCatSkus = 0, totalCatStock = 0, totalCatCapital = 0;
      exportMoneyCats.forEach((cat: any) => {
        const pct = exportStats?.totalStock > 0 ? (cat.stock / exportStats.totalStock) : 0;
        const r = sheet.addRow([cat.label, cat.uniqueSkus || 0, cat.stock || 0, cat.capital || 0, pct]);
        r.getCell(4).numFmt = '"$"#,##0.00';
        r.getCell(5).numFmt = '0.0%';
        totalCatSkus += (cat.uniqueSkus || 0);
        totalCatStock += (cat.stock || 0);
        totalCatCapital += (cat.capital || 0);
        currentRow++;
      });
      const catTotalRow = sheet.addRow(['TOTAL', totalCatSkus, totalCatStock, totalCatCapital, 1]);
      catTotalRow.eachCell((cell, colNum) => {
        cell.style = { ...footerStyle };
        if (colNum === 2 || colNum === 3) cell.numFmt = '#,##0';
        if (colNum === 4) cell.numFmt = '"$"#,##0.00';
        if (colNum === 5) cell.numFmt = '0.0%';
      });
      currentRow += 2;

      // 3b. Desglose Unidades
      addGridTable('Categorías — Desglose por Unidades', exportMoneyCats, whCols, 'units', purpleHeader);
      // 3c. Desglose Costo
      addGridTable('Categorías — Desglose por Costo', exportMoneyCats, whCols, 'cost', purpleHeader);

      // 4. Money Maker Marcas
      // 4a. General
      sheet.getCell(`A${currentRow}`).value = 'Money Maker Marcas — General';
      sheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FFF59E0B' } };
      currentRow++;
      const mmBrandHeader = sheet.addRow(['Marca', 'SKUs Diferentes', 'Stock Físico (Unids)', 'Capital Invertido', '% del Inventario']);
      mmBrandHeader.eachCell(cell => cell.style = orangeHeader);
      currentRow++;

      let totalBrandSkus = 0, totalBrandStock = 0, totalBrandCapital = 0;
      exportMoneyBrands.forEach((brand: any) => {
        const pct = exportStats?.totalStock > 0 ? (brand.stock / exportStats.totalStock) : 0;
        const r = sheet.addRow([brand.label, brand.uniqueSkus || 0, brand.stock || 0, brand.capital || 0, pct]);
        r.getCell(4).numFmt = '"$"#,##0.00';
        r.getCell(5).numFmt = '0.0%';
        totalBrandSkus += (brand.uniqueSkus || 0);
        totalBrandStock += (brand.stock || 0);
        totalBrandCapital += (brand.capital || 0);
        currentRow++;
      });
      const brandTotalRow = sheet.addRow(['TOTAL', totalBrandSkus, totalBrandStock, totalBrandCapital, 1]);
      brandTotalRow.eachCell((cell, colNum) => {
        cell.style = { ...footerStyle };
        if (colNum === 2 || colNum === 3) cell.numFmt = '#,##0';
        if (colNum === 4) cell.numFmt = '"$"#,##0.00';
        if (colNum === 5) cell.numFmt = '0.0%';
      });
      currentRow += 2;

      // 4b. Desglose Unidades
      addGridTable('Marcas — Desglose por Unidades', exportMoneyBrands, whCols, 'units', orangeHeader);
      // 4c. Desglose Costo
      addGridTable('Marcas — Desglose por Costo', exportMoneyBrands, whCols, 'cost', orangeHeader);

      // 5. Top Inventario por Equipo
      // 5a. Unidades
      addGridTable('Top Inventario por Equipo — Unidades', exportTopItems, whCols, 'units', navyHeader);
      // 5b. al Costo
      addGridTable('Top Inventario por Equipo — al Costo', exportTopItemsByCost, whCols, 'cost', navyHeader);

      // 6. CHARTS SECTION
      currentRow += 2;
      sheet.getCell(`A${currentRow}`).value = 'EXISTENCIAS GENERALES — ANÁLISIS VISUAL';
      sheet.getCell(`A${currentRow}`).font = { bold: true, size: 14 };
      currentRow += 2;

      // Replaced by shared helpers

      const addChartToSheet = (imgData: string | null, col: number, row: number, width = 500, height = 250) => {
        if (!imgData) return;
        const imageId = workbook.addImage({ base64: imgData, extension: 'png' });
        sheet.addImage(imageId, { tl: { col, row }, ext: { width, height } });
      };

      // General Stock Charts
      // 1. Categories Units & Cost
      const chartW_px = 560;
      const barH_px = 280;
      const donutW_px = 640;
      const donutH_px = 288;

      addChartToSheet(drawBarChart(chartsData.categoryBreakdown || [], 'Inventario por Categorías (Unidades)', true, '#8b5cf6'), 0, currentRow, chartW_px, barH_px);
      addChartToSheet(drawBarChart(exportMoneyCats.map((c: any) => ({ label: c.label, value: c.capital })), 'Inventario por Categoría (Costo $)', true, '#8b5cf6', v => '$' + v.toLocaleString()), 5, currentRow, chartW_px, barH_px);
      currentRow += 15;

      // 2. Brands Units & Cost
      addChartToSheet(drawBarChart(chartsData.brandBreakdown || [], 'Inventario por Marcas (Unidades)', true, '#f59e0b'), 0, currentRow, chartW_px, barH_px);
      addChartToSheet(drawBarChart(exportMoneyBrands.map((b: any) => ({ label: b.label, value: b.capital })), 'Inventario por Marcas (Costo $)', true, '#f59e0b', v => '$' + v.toLocaleString()), 5, currentRow, chartW_px, barH_px);
      currentRow += 15;

      // 3. Top/Bottom 5
      const top5 = [...exportWarehouses].sort((a, b) => b.value - a.value).slice(0, 5);
      const bottom5 = [...exportWarehouses].filter(w => w.value > 0).sort((a, b) => a.value - b.value).slice(0, 5);
      addChartToSheet(drawBarChart(top5.map(w => ({ label: w.label || w.code, value: w.value })), 'Top 5 - Inventario en Existencia por Almacén', true, 'multi', undefined, true), 0, currentRow, chartW_px, barH_px);
      addChartToSheet(drawBarChart(bottom5.map(w => ({ label: w.label || w.code, value: w.value })), 'Bottom 5 - Inventario en Existencia por Almacén', true, 'multi', undefined, true), 5, currentRow, chartW_px, barH_px);
      currentRow += 15;

      // 4. Participation Donuts
      addChartToSheet(drawDonutChart(chartsData.categoryBreakdown || [], 'Participación por Categoría'), 0, currentRow, donutW_px, donutH_px);
      addChartToSheet(drawDonutChart(chartsData.brandBreakdown || [], 'Participación por Marca'), 5, currentRow, donutW_px, donutH_px);
      currentRow += 15;

      addChartToSheet(drawDonutChart(exportWarehouses.map((w: any) => ({ label: w.label || w.code, value: w.value })), 'Participación por Almacén'), 0, currentRow, donutW_px, donutH_px);
      addChartToSheet(drawDonutChart(exportTopItems.map((i: any) => ({ label: i.name, value: i.stock_total })), 'Participación Top Equipos (Unids)'), 5, currentRow, donutW_px, donutH_px);
      currentRow += 15;

      addChartToSheet(drawBarChart(exportWarehouses.map((w: any) => ({ label: w.label || w.code, value: w.value })), 'Inventario por Almacén (Unidades)', false, 'multi', undefined, true), 0, currentRow, chartW_px, barH_px);
      addChartToSheet(drawDonutChart(exportTopItemsByCost.map((i: any) => ({ label: i.name, value: i.capital })), 'Participación Top Equipos (al Costo)', v => '$' + v.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })), 5, currentRow, donutW_px, donutH_px);
      currentRow += 15;

      // Final column widths
      sheet.getColumn(1).width = 38;
      for (let i = 2; i <= 6; i++) sheet.getColumn(i).width = 20; 
      for (let i = 7; i <= 30; i++) sheet.getColumn(i).width = 15;

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `reporte_completo_${new Date().toISOString().split('T')[0]}.xlsx`);

    } catch (err: any) {
      console.error(err);
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
        @media (max-width: 640px) {
          .h-title { font-size: 1.25rem !important; }
          .money-maker-header { flex-direction: column; align-items: flex-start !important; }
          .money-maker-btns { width: 100%; justify-content: space-between; }
        }
      `}</style>
      <div className="reports-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div className="h-title" style={{ fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 700 }}>Reportes de Inventario</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={exportToExcel} disabled={exporting === 'excel'}>
            <Download size={16} style={{ marginRight: 6 }} />
            <span className="btn-label" style={{ display: isMobile ? 'none' : 'inline' }}>{exporting === 'excel' ? 'Exportando...' : 'Excel'}</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={exportToPDF} disabled={exporting === 'pdf'}>
            <FileText size={16} style={{ marginRight: 6 }} />
            <span className="btn-label" style={{ display: isMobile ? 'none' : 'inline' }}>{exporting === 'pdf' ? 'Exportando...' : 'PDF'}</span>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
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
          <div className="filters-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
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
            isMobile ? (
              <div style={{ padding: '8px 4px' }}>
                {warehouseData.map((wh: any, idx: number) => {
                  const totalCapitalAll = (warehouseData || []).reduce((acc, w) => acc + (w.capital || 0), 0);
                  const percentage = totalCapitalAll > 0 ? ((wh.capital || 0) / totalCapitalAll) * 100 : 0;
                  return (
                    <MobileReportCard
                      key={wh.code || idx}
                      title={wh.label || wh.code}
                      label="Bodega"
                      total={`$${(wh.capital || 0).toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`}
                      warehouses={[
                        { code: 'SKUs', label: 'SKUs Únicos' },
                        { code: 'UNID', label: 'Unidades' },
                        { code: 'PCT', label: '% Capital' }
                      ]}
                      data={{
                        'SKUs': wh.uniqueSkus || 0,
                        'UNID': wh.value || 0,
                        'PCT': Number(percentage.toFixed(1))
                      }}
                      color="#0ea5e9"
                    />
                  );
                })}
              </div>
            ) : (
              <div className="custom-scrollbar" style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', minWidth: 500, borderCollapse: 'collapse', fontSize: 13 }}>
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
                      const totalCapitalAll = (warehouseData || []).reduce((acc, w) => acc + (w.capital || 0), 0);
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
            )
          )}
        </div>
      </Card>

      {/* NUEVA SECCIÓN: MONEY MAKER DE CATEGORÍAS */}
      <div className="money-maker-header" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', padding: '12px 20px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: 'white', fontSize: 'clamp(15px, 4vw, 18px)', fontWeight: 700, margin: 0 }}>El "Money Maker" de Categorías</h2>
        <div className="money-maker-btns" style={{ display: 'flex', background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: 2, flexWrap: 'wrap' }}>
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

              const categoryData = reportData.moneyMakerCategories.map((cat: any) => {
                const itemData: { [key: string]: any } = {
                  category: cat.label,
                  name: cat.label, // For MobileReportCard title
                  label: cat.label, // For compatibility with table view
                  total: categoryViewMode === 'units' ? (cat.stock || 0) : (cat.capital || 0),
                  uniqueSkus: cat.uniqueSkus || 0,
                  stock: cat.stock || 0,
                  capital: cat.capital || 0,
                  percentage: stats?.totalStock > 0 ? (cat.stock / stats.totalStock) * 100 : 0,
                };
                warehouseCols.forEach(wh => {
                  if (categoryViewMode === 'units') {
                    itemData[wh] = cat.byWarehouse?.[wh] || 0;
                  } else {
                    itemData[wh] = cat.capitalByWarehouse?.[wh] || 0;
                  }
                });
                return itemData;
              });

              const totalUniqueSkus = reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.uniqueSkus || 0), 0);
              const totalStock = reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.stock || 0), 0);
              const totalCapital = reportData.moneyMakerCategories.reduce((acc: number, c: any) => acc + (c.capital || 0), 0);
              const totalPercentage = stats?.totalStock > 0 ? (totalStock / stats.totalStock) * 100 : 0;

              return (
                isMobile ? (
                  <div style={{ padding: '8px 4px' }}>
                    {categoryData.map((item: any, idx: number) => {
                      const isConsolidated = categoryViewMode === 'consolidated';
                      let statsData = item;

                      if (isConsolidated) {
                        statsData = {
                          'SKUs': item.uniqueSkus.toLocaleString('es-NI'),
                          'Stock': item.stock.toLocaleString('es-NI') + ' unids',
                          'Total Capital': item.capital.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '$',
                          'Pct': item.percentage.toFixed(1) + '%'
                        };
                      } else if (categoryViewMode === 'cost') {
                        statsData = { ...item };
                        warehouseCols.forEach(wh => {
                          if (typeof statsData[wh] === 'number' && statsData[wh] > 0) {
                            statsData[wh] = statsData[wh].toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '$';
                          }
                        });
                      }

                      return (
                        <MobileReportCard
                          key={idx}
                          title={item.category || item.name}
                          label="Categoría"
                          total={categoryViewMode === 'units' ? item.stock.toLocaleString('es-NI') : item.capital.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '$'}
                          warehouses={isConsolidated
                            ? [
                              { code: 'SKUs', label: 'SKUs Diferentes' },
                              { code: 'Stock', label: 'Stock Físico' },
                              { code: 'Pct', label: '% Inventario' }
                            ]
                            : warehouseCols.map(code => ({ code, label: code }))
                          }
                          data={statsData}
                          color="#a78bfa"
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="custom-scrollbar" style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', minWidth: categoryViewMode !== 'consolidated' ? 300 + (warehouseCols.length * 70) : 500, borderCollapse: 'collapse', fontSize: 13 }}>
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
                        {categoryData.map((cat: any, idx: number) => {
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--panel)' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: '#a78bfa' }}>{cat.category || cat.label}</td>
                              {categoryViewMode !== 'consolidated' ? (
                                <>
                                  {warehouseCols.map(wh => {
                                    if (categoryViewMode === 'units') {
                                      const qty = cat[wh] || 0;
                                      return (
                                        <td key={wh} style={{ padding: '8px 12px', textAlign: 'right' }}>
                                          {qty > 0 ? qty.toLocaleString('es-NI') : ''}
                                        </td>
                                      );
                                    } else {
                                      const cost = cat[wh] || 0;
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
                                      <div style={{ fontWeight: 600 }}>{cat.percentage.toFixed(1)}%</div>
                                      <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ width: `${cat.percentage}%`, height: '100%', background: '#8b5cf6' }} />
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
                                  ? totalStock.toLocaleString('es-NI')
                                  : '$' + totalCapital.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                                }
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                {totalUniqueSkus.toLocaleString('es-NI')}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                {totalStock.toLocaleString('es-NI')}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>
                                ${totalCapital.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                  <div style={{ fontWeight: 600 }}>
                                    {totalPercentage.toFixed(1)}%
                                  </div>
                                  <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{
                                      width: `${Math.min(100, totalPercentage)}%`,
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
                )
              );
            })()}
          </div>
        </Card>
      </div>

      {/* NUEVA SECCIÓN: MONEY MAKER DE MARCAS */}
      <div className="money-maker-header" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '12px 20px', borderRadius: 8, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: 'white', fontSize: 'clamp(15px, 4vw, 18px)', fontWeight: 700, margin: 0 }}>El "Money Maker" de Marcas</h2>
        <div className="money-maker-btns" style={{ display: 'flex', background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: 2, flexWrap: 'wrap' }}>
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

              const brandData = reportData.moneyMakerBrands.map((brand: any) => {
                const itemData: { [key: string]: any } = {
                  brand: brand.label,
                  name: brand.label,
                  total: brandViewMode === 'units' ? (brand.stock || 0) : (brand.capital || 0),
                  uniqueSkus: brand.uniqueSkus || 0,
                  stock: brand.stock || 0,
                  capital: brand.capital || 0,
                  percentage: stats?.totalStock > 0 ? (brand.stock / stats.totalStock) * 100 : 0,
                };
                warehouseCols.forEach(wh => {
                  if (brandViewMode === 'units') {
                    itemData[wh] = brand.byWarehouse?.[wh] || 0;
                  } else {
                    itemData[wh] = brand.capitalByWarehouse?.[wh] || 0;
                  }
                });
                return itemData;
              });

              return (
                isMobile ? (
                  <div style={{ padding: '8px 4px' }}>
                    {brandData.map((item: any, idx: number) => {
                      const isConsolidated = brandViewMode === 'consolidated';
                      let statsData = item;

                      if (isConsolidated) {
                        statsData = {
                          'SKUs': item.uniqueSkus.toLocaleString('es-NI'),
                          'Stock': item.stock.toLocaleString('es-NI') + ' unids',
                          'Pct': item.percentage.toFixed(1) + '%',
                          'Total Capital': item.capital.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '$'
                        };
                      } else if (brandViewMode === 'cost') {
                        statsData = { ...item };
                        warehouseCols.forEach(wh => {
                          if (typeof statsData[wh] === 'number' && statsData[wh] > 0) {
                            statsData[wh] = statsData[wh].toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '$';
                          }
                        });
                      }

                      return (
                        <MobileReportCard
                          key={idx}
                          title={item.brand}
                          label="Marca"
                          total={brandViewMode === 'units' ? item.stock.toLocaleString('es-NI') : item.capital.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '$'}
                          warehouses={isConsolidated
                            ? [
                              { code: 'SKUs', label: 'SKUs Diferentes' },
                              { code: 'Stock', label: 'Stock Físico' },
                              { code: 'Pct', label: '% Inventario' }
                            ]
                            : warehouseCols.map(code => ({ code, label: code }))
                          }
                          data={statsData}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="custom-scrollbar" style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', minWidth: brandViewMode !== 'consolidated' ? 300 + (warehouseCols.length * 70) : 500, borderCollapse: 'collapse', fontSize: 13 }}>
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
                        {brandData.map((brand: any, idx: number) => {
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--panel)' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f59e0b' }}>{brand.brand}</td>
                              {brandViewMode !== 'consolidated' ? (
                                <>
                                  {warehouseCols.map(wh => {
                                    const val = brand[wh];
                                    return (
                                      <td key={wh} style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        {brandViewMode === 'units'
                                          ? (val > 0 ? val.toLocaleString('es-NI') : '')
                                          : (val > 0 ? '$' + val.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '')
                                        }
                                      </td>
                                    );
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
                                      <div style={{ fontWeight: 600 }}>{brand.percentage.toFixed(1)}%</div>
                                      <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ width: `${brand.percentage}%`, height: '100%', background: '#f59e0b' }} />
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
                                const whVal = brandData.reduce((acc: number, b: any) => acc + (b[wh] || 0), 0);
                                return (
                                  <td key={wh} style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                    {brandViewMode === 'units'
                                      ? (whVal > 0 ? whVal.toLocaleString('es-NI') : '')
                                      : (whVal > 0 ? '$' + whVal.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '')
                                    }
                                  </td>
                                );
                              })}
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                {brandViewMode === 'units'
                                  ? brandData.reduce((acc: number, b: any) => acc + (b.stock || 0), 0).toLocaleString('es-NI')
                                  : '$' + brandData.reduce((acc: number, b: any) => acc + (b.capital || 0), 0).toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                                }
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                {brandData.reduce((acc: number, b: any) => acc + (b.uniqueSkus || 0), 0).toLocaleString('es-NI')}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                {brandData.reduce((acc: number, b: any) => acc + (b.stock || 0), 0).toLocaleString('es-NI')}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>
                                ${brandData.reduce((acc: number, b: any) => acc + (b.capital || 0), 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                  <div style={{ fontWeight: 600 }}>
                                    {(stats?.totalStock > 0
                                      ? (brandData.reduce((acc: number, b: any) => acc + (b.stock || 0), 0) / stats.totalStock) * 100
                                      : 0).toFixed(1)}%
                                  </div>
                                  <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{
                                      width: `${Math.min(100, stats?.totalStock > 0 ? (brandData.reduce((acc: number, b: any) => acc + (b.stock || 0), 0) / stats.totalStock) * 100 : 0)}%`,
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
                )
              );
            })()}
          </div>
        </Card>
      </div>

      {/* NUEVA SECCIÓN: TOP INVENTARIO POR EQUIPO UNIDAD */}
      <div className="money-maker-header" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)', padding: '12px 20px', borderRadius: 8, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: 'white', fontSize: 'clamp(15px, 4vw, 18px)', fontWeight: 700, margin: 0 }}>Top Inventario por Equipo ({topItemsViewMode === 'units' ? 'Unidad' : 'al Costo'})</h2>
        <div className="money-maker-btns" style={{ display: 'flex', background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: 2, flexWrap: 'wrap' }}>
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
                isMobile ? (
                  <div style={{ padding: '8px 4px' }}>
                    {currentItems.map((item: any, idx: number) => {
                      const isCost = topItemsViewMode === 'cost';
                      const source = isCost ? (item.capitalByWarehouse || {}) : (item.byWarehouse || {});
                      const formattedData: { [key: string]: any } = {};

                      Object.keys(source).forEach(wh => {
                        const val = source[wh];
                        if (typeof val === 'number' && val > 0) {
                          formattedData[wh] = isCost
                            ? val.toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '$'
                            : val.toLocaleString('es-NI');
                        } else {
                          formattedData[wh] = val;
                        }
                      });

                      return (
                        <MobileReportCard
                          key={idx}
                          title={item.name}
                          label="Producto"
                          total={topItemsViewMode === 'units' ? (item.stock_total || 0).toLocaleString('es-NI') : (item.capital || 0).toLocaleString('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '$'}
                          warehouses={warehouseCols.map(code => ({ code, label: code }))}
                          data={formattedData}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="custom-scrollbar" style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', minWidth: 300 + (warehouseCols.length * 70), borderCollapse: 'collapse', fontSize: 13 }}>
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
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: '#60a5fa' }}>{item.name}</td>
                              {warehouseCols.map(wh => {
                                if (topItemsViewMode === 'units') {
                                  const qty = item.byWarehouse?.[wh] || 0;
                                  return (
                                    <td key={wh} style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                      {qty > 0 ? qty.toLocaleString('es-NI') : ''}
                                    </td>
                                  );
                                } else {
                                  const cost = item.capitalByWarehouse?.[wh] || 0;
                                  return (
                                    <td key={wh} style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
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
                          <td style={{ padding: '10px 12px', textAlign: 'left', color: '#60a5fa' }}>Total</td>
                          {warehouseCols.map(wh => {
                            if (topItemsViewMode === 'units') {
                              const whTotal = currentItems.reduce((acc: number, item: any) => acc + (item.byWarehouse?.[wh] || 0), 0);
                              return (
                                <td key={wh} style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                  {whTotal > 0 ? whTotal.toLocaleString('es-NI') : ''}
                                </td>
                              );
                            } else {
                              const whCost = currentItems.reduce((acc: number, item: any) => acc + (item.capitalByWarehouse?.[wh] || 0), 0);
                              return (
                                <td key={wh} style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>
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
                )
              );
            })()}
          </div>
        </Card>
      </div>



      {/* SECCIÓN 2: EXISTENCIAS GENERALES */}
      <div style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', padding: '12px 20px', borderRadius: 8 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>EXISTENCIAS GENERALES</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14, marginTop: 14 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
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
