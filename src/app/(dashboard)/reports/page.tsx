'use client';

import { useState, useEffect, useMemo } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import ChartCard from '@/components/reports/ChartCard';
import BarChart from '@/components/reports/BarChart';
import LineChart from '@/components/reports/LineChart';
import DonutChart from '@/components/reports/DonutChart';
import HorizontalBarChart from '@/components/charts/HorizontalBarChart';
import PieChart from '@/components/charts/PieChart';
import ReportPlaceholder from '@/components/reports/ReportPlaceholder';
import { Download, Package, TrendingUp, TrendingDown, Calendar, Warehouse, AlertTriangle, DollarSign, FileText, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ReportsPage() {
  const [period, setPeriod] = useState('30');
  const [items, setItems] = useState<any[]>([]);
  const [stockSnapshots, setStockSnapshots] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [agingData, setAgingData] = useState<any>(null); // New state for Zoho aging
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalFilters, setGlobalFilters] = useState({
    category: '',
    marca: '',
    warehouse: '',
    state: '',
    color: ''
  });
  const [filterOptions, setFilterOptions] = useState<any>(null);
  const [filteredSnapshots, setFilteredSnapshots] = useState<any[]>([]);

  useEffect(() => {
    fetchAllData();
  }, [period]);

  async function fetchAllItems() {
    const allItems: any[] = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw new Error(`Error items: ${error.message}`);

      const batch = data || [];
      allItems.push(...batch);

      if (batch.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    }

    return allItems;
  }

  async function fetchAllData() {
    setLoading(true);
    setError(null);
    try {
      const daysAgo = parseInt(period);
      const dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - daysAgo);

      const [itemsData, snapshotsResult, warehousesResult, kpisResponse, agingResponse] = await Promise.all([
        fetchAllItems(),
        supabase.from('stock_snapshots').select('*, items(*), warehouses(*)')
          .gte('synced_at', dateFilter.toISOString())
          .range(0, 9999),
        supabase.from('warehouses').select('*').eq('active', true),
        fetch('/api/inventory/kpis'),
        fetch('/api/inventory/aging')
      ]);

      if (snapshotsResult.error) throw new Error(`Error snapshots: ${snapshotsResult.error.message}`);
      if (warehousesResult.error) throw new Error(`Error warehouses: ${warehousesResult.error.message}`);

      const snapshotsData = snapshotsResult.data || [];
      const warehousesData = warehousesResult.data || [];
      const kpis = kpisResponse.ok ? await kpisResponse.json() : null;
      const aging = agingResponse.ok ? await agingResponse.json() : null;

      setItems(itemsData);
      setStockSnapshots(snapshotsData);
      setWarehouses(warehousesData);
      setAgingData(aging);

      // Obtener opciones de filtros
      const categories = new Set<string>();
      const marcas = new Set<string>();
      const warehouseCodes = new Set<string>();
      const states = new Set<string>();
      const colors = new Set<string>();

      snapshotsData.forEach((s: any) => {
        if (s.items?.category) categories.add(s.items.category);
        if (s.items?.marca) marcas.add(s.items.marca);
        if (s.warehouses?.code) warehouseCodes.add(s.warehouses.code);
        if (s.items?.state) states.add(s.items.state);
        if (s.items?.color) colors.add(s.items.color);
      });

      setFilterOptions({
        categories: Array.from(categories).sort(),
        marcas: Array.from(marcas).sort(),
        warehouses: Array.from(warehouseCodes).sort(),
        states: Array.from(states).sort(),
        colors: Array.from(colors).sort()
      });

      // Aplicar filtros
      let filtered = snapshotsData;
      if (globalFilters.category) filtered = filtered.filter((s: any) => s.items?.category === globalFilters.category);
      if (globalFilters.marca) filtered = filtered.filter((s: any) => s.items?.marca === globalFilters.marca);
      if (globalFilters.warehouse) filtered = filtered.filter((s: any) => s.warehouses?.code === globalFilters.warehouse);
      if (globalFilters.state) filtered = filtered.filter((s: any) => s.items?.state === globalFilters.state);
      if (globalFilters.color) filtered = filtered.filter((s: any) => s.items?.color === globalFilters.color);

      setFilteredSnapshots(filtered);

      calculateStats(itemsData, filtered, warehousesData, kpis);
    } catch (err: any) {
      setError(err.message || 'Error al cargar datos');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }

  function calculateStats(
    items: any[],
    snapshots: any[],
    warehouses: any[],
    kpis?: { totalProducts?: number; totalStock?: number; totalValue?: number; activeWarehouses?: number }
  ) {
    const totalStock = kpis?.totalStock ?? items.reduce((sum, item) => sum + (item.stock_total || 0), 0);
    // Use Zoho's real inventory valuation
    const totalValue = kpis?.totalValue ?? items.reduce((sum, item) => sum + ((item.stock_total || 0) * (item.price || 0)), 0);
    const lowStockItems = items.filter(i => (i.stock_total || 0) > 0 && (i.stock_total || 0) < 10).length;
    const outOfStockItems = items.filter(i => (i.stock_total || 0) === 0).length;

    const categoryBreakdown: Record<string, number> = {};
    snapshots.forEach(s => {
      if (s.items) {
        const cat = s.items.category || 'Sin categoría';
        categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + s.qty;
      }
    });

    const warehouseBreakdown: Record<string, { stock: number; items: number }> = {};
    snapshots.forEach(s => {
      if (s.warehouses) {
        const code = s.warehouses.code;
        if (!warehouseBreakdown[code]) {
          warehouseBreakdown[code] = { stock: 0, items: 0 };
        }
        warehouseBreakdown[code].stock += s.qty;
        warehouseBreakdown[code].items += 1;
      }
    });

    const stockHistory: Array<{ date: string; stock: number }> = [];
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date.toISOString().split('T')[0];
    });

    last7Days.forEach(date => {
      const daySnapshots = snapshots.filter(s => s.synced_at.startsWith(date));
      const dayStock = daySnapshots.reduce((sum, s) => sum + s.qty, 0);
      stockHistory.push({ date, stock: dayStock || totalStock / 7 });
    });

    setStats({
      totalProducts: kpis?.totalProducts ?? items.length,
      totalStock,
      totalValue,
      lowStockItems,
      outOfStockItems,
      activeWarehouses: kpis?.activeWarehouses ?? warehouses.length,
      categoryBreakdown,
      warehouseBreakdown,
      stockHistory
    });
  }

  async function exportToPDF() {
    try {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Reporte de Inventario', 14, 20);
      doc.setFontSize(11);
      doc.text(`Período: Últimos ${period} días`, 14, 28);
      doc.text(`Generado: ${new Date().toLocaleDateString('es-NI')}`, 14, 34);

      doc.setFontSize(14);
      doc.text('Resumen Ejecutivo', 14, 45);
      doc.setFontSize(10);
      doc.text(`Total Productos: ${stats?.totalProducts || 0}`, 14, 52);
      doc.text(`Total Stock: ${stats?.totalStock.toLocaleString('es-NI') || 0} unidades`, 14, 58);
      doc.text(`Valor Estimado: $${stats?.totalValue.toLocaleString('es-NI') || 0}`, 14, 64);
      doc.text(`Items Stock Bajo: ${stats?.lowStockItems || 0}`, 14, 70);
      doc.text(`Items Sin Stock: ${stats?.outOfStockItems || 0}`, 14, 76);
      doc.text(`Bodegas Activas: ${stats?.activeWarehouses || 0}`, 14, 82);

      const tableData = stockSnapshots.slice(0, 50).map(s => [
        s.items?.sku || 'N/A',
        s.items?.name || 'N/A',
        s.items?.category || 'Sin categoría',
        s.warehouses?.code || 'N/A',
        s.qty.toString(),
        new Date(s.synced_at).toLocaleDateString('es-NI')
      ]);

      autoTable(doc, {
        startY: 90,
        head: [['SKU', 'Producto', 'Categoría', 'Bodega', 'Stock', 'Actualizado']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] }
      });

      doc.save(`reporte_inventario_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err: any) {
      alert(`Error al exportar PDF: ${err.message}`);
    }
  }

  async function exportToExcel() {
    try {
      const csvRows = [
        ['SKU', 'Producto', 'Categoría', 'Color', 'Estado', 'Bodega', 'Stock', 'Actualizado'].join(','),
      ];

      stockSnapshots.forEach((snapshot) => {
        csvRows.push([
          snapshot.items?.sku || '',
          `"${snapshot.items?.name || ''}"`,
          `"${snapshot.items?.category || 'Sin categoría'}"`,
          `"${snapshot.items?.color || 'N/A'}"`,
          `"${snapshot.items?.state || 'N/A'}"`,
          `"${snapshot.warehouses?.code || 'N/A'}"`,
          snapshot.qty.toString(),
          new Date(snapshot.synced_at).toLocaleDateString('es-NI'),
        ].join(','));
      });

      const csv = csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_inventario_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Error al exportar Excel: ${err.message}`);
    }
  }

  const topProducts = stockSnapshots
    .reduce((acc: any, s: any) => {
      const existing = acc.find((p: any) => p.item_id === s.item_id);
      if (existing) {
        existing.totalQty += s.qty;
      } else {
        acc.push({ item_id: s.item_id, item: s.items, totalQty: s.qty });
      }
      return acc;
    }, [])
    .sort((a: any, b: any) => b.totalQty - a.totalQty)
    .slice(0, 10);

  // Funciones de transformación
  const groupByCategoryUnits = (snapshots: any[]) => {
    if (!snapshots || snapshots.length === 0) return null;
    const groups: Record<string, number> = {};
    snapshots.forEach((s: any) => {
      const cat = s.items?.category || 'Sin categoría';
      groups[cat] = (groups[cat] || 0) + s.qty;
    });
    return Object.entries(groups).map(([label, value]) => ({ label, value })).sort((a: any, b: any) => b.value - a.value);
  };

  const groupByBrandUnits = (snapshots: any[]) => {
    if (!snapshots || snapshots.length === 0) return null;
    const groups: Record<string, number> = {};
    snapshots.forEach((s: any) => {
      const marca = s.items?.marca || 'Sin marca';
      groups[marca] = (groups[marca] || 0) + s.qty;
    });
    return Object.entries(groups).map(([label, value]) => ({ label, value })).sort((a: any, b: any) => b.value - a.value);
  };

  // Conteo por marca desde items (stock_total): evita duplicados por snapshot/bodega y límite 10k filas.
  // Normaliza marca (trim + mayúsculas) para unificar "Samsung" y "SAMSUNG".
  const groupByBrandUnitsFromItems = (itemsList: any[]) => {
    if (!itemsList || itemsList.length === 0) return null;
    const groups: Record<string, { value: number; label: string }> = {};
    itemsList.forEach((item: any) => {
      const raw = (item.marca || '').trim() || 'Sin marca';
      const key = raw.toUpperCase();
      const qty = Number(item.stock_total) || 0;
      if (!groups[key]) groups[key] = { value: 0, label: raw };
      groups[key].value += qty;
    });
    return Object.values(groups)
      .map(({ label, value }) => ({ label, value }))
      .sort((a: any, b: any) => b.value - a.value);
  };

  // Agrupar por categoría usando `items.stock_total` (evita depender solo de `stock_snapshots`).
  const groupByCategoryUnitsFromItems = (itemsList: any[]) => {
    if (!itemsList || itemsList.length === 0) return null;
    const groups: Record<string, { value: number; label: string }> = {};
    itemsList.forEach((item: any) => {
      const catRaw = (item.category || '').toString().trim() || 'Sin categoría';
      const key = catRaw.toUpperCase();
      const qty = Number(item.stock_total) || 0;
      if (!groups[key]) groups[key] = { value: 0, label: catRaw };
      groups[key].value += qty;
    });
    return Object.values(groups)
      .map(({ label, value }) => ({ label, value }))
      .sort((a: any, b: any) => b.value - a.value);
  };

  // Resolve quantity per item preferring snapshots (filteredSnapshots) when present,
  // otherwise fall back to `item.stock_total`. Returns items augmented with `resolved_qty`.
  const resolveItemQuantities = (itemsList: any[], snapshotsList: any[]) => {
    const snapshotMap: Record<string, number> = {};
    (snapshotsList || []).forEach((s: any) => {
      if (!s.item_id) return;
      snapshotMap[s.item_id] = (snapshotMap[s.item_id] || 0) + (Number(s.qty) || 0);
    });

    return (itemsList || []).map((it: any) => {
      const qtyFromSnapshots = snapshotMap[it.id];
      const resolved = typeof qtyFromSnapshots === 'number' ? qtyFromSnapshots : (Number(it.stock_total) || 0);
      return { ...it, resolved_qty: resolved };
    });
  };

  const groupByWarehouseUnits = (snapshots: any[]) => {
    if (!snapshots || snapshots.length === 0) return null;
    const groups: Record<string, number> = {};
    snapshots.forEach((s: any) => {
      const warehouse = s.warehouses?.name || s.warehouses?.code || 'Sin almacén';
      groups[warehouse] = (groups[warehouse] || 0) + s.qty;
    });
    return Object.entries(groups).map(([label, value]) => ({ label, value })).sort((a: any, b: any) => b.value - a.value);
  };

  const topN = (data: any, n: number) => {
    if (!data || data.length === 0) return null;
    return data.slice(0, n);
  };

  // Ítems filtrados por los mismos criterios globales (para gráficos por marca desde items)
  const itemsForBrandCharts = useMemo(() => {
    let list = items;
    if (globalFilters.category) list = list.filter((i: any) => i.category === globalFilters.category);
    if (globalFilters.marca) list = list.filter((i: any) => (i.marca || '').trim() === globalFilters.marca);
    if (globalFilters.state) list = list.filter((i: any) => i.state === globalFilters.state);
    if (globalFilters.color) list = list.filter((i: any) => i.color === globalFilters.color);
    if (globalFilters.warehouse) {
      const ids = new Set(filteredSnapshots.map((s: any) => s.item_id));
      list = list.filter((i: any) => ids.has(i.id));
    }
    return list;
  }, [items, globalFilters, filteredSnapshots]);

  // Ítems filtrados para gráficos por categoría (mismas reglas que `itemsForBrandCharts`)
  const itemsForCategoryCharts = useMemo(() => {
    let list = items;
    if (globalFilters.category) list = list.filter((i: any) => i.category === globalFilters.category);
    if (globalFilters.marca) list = list.filter((i: any) => (i.marca || '').trim() === globalFilters.marca);
    if (globalFilters.state) list = list.filter((i: any) => i.state === globalFilters.state);
    if (globalFilters.color) list = list.filter((i: any) => i.color === globalFilters.color);
    if (globalFilters.warehouse) {
      const ids = new Set(filteredSnapshots.map((s: any) => s.item_id));
      list = list.filter((i: any) => ids.has(i.id));
    }
    return list;
  }, [items, globalFilters, filteredSnapshots]);

  const generateColors = (count: number) => {
    const baseColors = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];
    const colors: string[] = [];
    for (let i = 0; i < count; i++) colors.push(baseColors[i % baseColors.length]);
    return colors;
  };

  const [showDebugCategory, setShowDebugCategory] = useState(false);


  // Productos sin marca asignada (para exportar lista)
  const itemsSinMarca = useMemo(
    () => items.filter((i: any) => !(i.marca || '').trim()),
    [items]
  );

  function exportSinMarca() {
    if (itemsSinMarca.length === 0) {
      alert('No hay productos sin marca para exportar.');
      return;
    }
    try {
      const csvRows = [
        ['SKU', 'Nombre', 'Categoría', 'Stock total', 'Precio', 'Estado', 'Color'].join(','),
      ];
      itemsSinMarca.forEach((item: any) => {
        csvRows.push([
          item.sku || '',
          `"${(item.name || '').replace(/"/g, '""')}"`,
          `"${(item.category || '').replace(/"/g, '""')}"`,
          String(item.stock_total ?? 0),
          String(item.price ?? ''),
          `"${(item.state || '').replace(/"/g, '""')}"`,
          `"${(item.color || '').replace(/"/g, '""')}"`,
        ].join(','));
      });
      const csv = '\uFEFF' + csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `productos_sin_marca_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Error al exportar: ${err?.message || err}`);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="h-title">Reportes de Inventario</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={exportToExcel}>
            <Download size={16} style={{ marginRight: 6 }} />
            Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={exportToPDF}>
            <FileText size={16} style={{ marginRight: 6 }} />
            PDF
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

      {itemsSinMarca.length > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={20} color="var(--warning)" />
              <div>
                <div style={{ fontWeight: 600 }}>Productos sin marca</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {itemsSinMarca.length.toLocaleString('es-NI')} productos sin marca asignada
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={exportSinMarca}>
              <Download size={16} style={{ marginRight: 6 }} />
              Exportar lista (CSV)
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <Card>
          <div style={{ padding: 16, color: 'var(--danger)' }}>
            <strong>Error:</strong> {error}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--success)15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={20} color="var(--success)" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Total Productos</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{stats?.totalProducts.toLocaleString('es-NI') || 0}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Productos en inventario</div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#3B82F615', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package size={20} color="#3B82F6" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Total Stock</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{stats?.totalStock.toLocaleString('es-NI') || 0}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Unidades totales</div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--success)15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={20} color="var(--success)" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Valor Estimado</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 600 }}>${stats?.totalValue.toLocaleString('es-NI') || 0}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Inventario total</div>
              </>
            )}
          </div>
        </Card>

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
      </div>

      {/* FILTROS GLOBALES */}
      <Card>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Filter size={18} color="var(--brand-primary)" />
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Filtros Globales</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
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

      {/* SECCIÓN 1: INVENTARIO REMANENTE */}
      <div style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', padding: '12px 20px', borderRadius: 8 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>Inventario Remanente {'>'}= 90 Días (Zoho Books)</h2>
      </div>
      {loading ? (
        <Card><div style={{ height: 250, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} /></Card>
      ) : (() => {
        // Use real Zoho data if available, otherwise fallback to local calculation
        const agingItems = agingData?.items ? agingData.items : items
          .filter(item => {
            const stock = item.stock_total || 0;
            if (stock <= 0) return false;
            const lastUpdate = item.updated_at ? new Date(item.updated_at) : null;
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            return lastUpdate && lastUpdate < ninetyDaysAgo;
          })
          .map(item => {
            const lastUpdate = new Date(item.updated_at);
            const daysAgo = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
            return { ...item, daysAgo };
          })
          .sort((a, b) => b.daysAgo - a.daysAgo);

        const agingTotalUnits = agingData?.totalUnits ?? agingItems.reduce((sum: number, i: any) => sum + (i.stock_total || 0), 0);
        const agingTotalValue = agingData?.totalValue ?? agingItems.reduce((sum: number, i: any) => sum + ((i.stock_total || 0) * (i.price || 0)), 0);

        return (
          <Card>
            <div style={{ padding: 16 }}>
              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <div style={{ background: 'var(--panel)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{agingItems.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Productos estancados</div>
                </div>
                <div style={{ background: 'var(--panel)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#f97316' }}>{agingTotalUnits.toLocaleString('es-NI')}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Unidades sin movimiento</div>
                </div>
                <div style={{ background: 'var(--panel)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#eab308' }}>${agingTotalValue.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Capital inmovilizado</div>
                </div>
              </div>

              {agingItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
                  <Package size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <div>No hay productos con stock estancado {'>'}= 90 días</div>
                </div>
              ) : (
                <div style={{ maxHeight: 400, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--panel)', position: 'sticky', top: 0, zIndex: 1 }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>SKU</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Producto</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Categoría</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Stock</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Valor</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Días sin movimiento</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Último cambio (Aprox)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingItems.slice(0, 100).map((item: any, idx: number) => {
                        const badgeColor = item.daysAgo >= 180 ? '#ef4444' : item.daysAgo >= 120 ? '#f97316' : '#eab308';
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--panel)' }}>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{item.sku}</td>
                            <td style={{ padding: '8px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{item.category || '—'}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{(item.stock_total || 0).toLocaleString('es-NI')}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>${((item.stock_total || 0) * (item.price || 0)).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <span style={{ background: badgeColor + '20', color: badgeColor, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                                {item.daysAgo}d
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)' }}>
                              {new Date(item.updated_at).toLocaleDateString('es-NI', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {agingItems.length > 100 && (
                    <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)', textAlign: 'center', background: 'var(--panel)' }}>
                      Mostrando 100 de {agingItems.length} productos
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        );
      })()}

      {/* SECCIÓN 2: EXISTENCIAS GENERALES */}
      <div style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', padding: '12px 20px', borderRadius: 8 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>EXISTENCIAS GENERALES</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <ChartCard title="Inventario por Categorías (Unids)">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const resolved = resolveItemQuantities(itemsForCategoryCharts, filteredSnapshots);
            const data = groupByCategoryUnitsFromItems(resolved.map((i: any) => ({ ...i, stock_total: i.resolved_qty })));
            return data ? (
              <HorizontalBarChart data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))} height={300} />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}

          <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowDebugCategory(v => !v)} style={{ background: 'transparent', color: 'var(--muted)', border: 'none', cursor: 'pointer' }}>
              {showDebugCategory ? 'Ocultar debug' : 'Mostrar debug'}
            </button>
          </div>
          {showDebugCategory && (
            <div style={{ padding: 12, color: '#CBD5E1', fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}><strong>Desglose desde `items.stock_total`:</strong></div>
              <pre style={{ maxHeight: 160, overflow: 'auto', background: 'rgba(0,0,0,0.25)', padding: 8, borderRadius: 6 }}>{JSON.stringify(groupByCategoryUnitsFromItems(itemsForCategoryCharts), null, 2)}</pre>

              <div style={{ margin: '12px 0 8px 0' }}><strong>Desglose desde `stock_snapshots` (filteredSnapshots):</strong></div>
              <pre style={{ maxHeight: 160, overflow: 'auto', background: 'rgba(0,0,0,0.25)', padding: 8, borderRadius: 6 }}>{JSON.stringify(groupByCategoryUnits(filteredSnapshots), null, 2)}</pre>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Top Inventario por Marca (Unids)">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = topN(groupByBrandUnitsFromItems(itemsForBrandCharts), 10);
            return data ? (
              <HorizontalBarChart data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))} height={300} />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <ChartCard title="Participación de Inventario - Unids por Categoría">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const resolved = resolveItemQuantities(itemsForCategoryCharts, filteredSnapshots);
            const data = groupByCategoryUnitsFromItems(resolved.map((i: any) => ({ ...i, stock_total: i.resolved_qty })));
            return data ? (
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
            const data = topN(groupByBrandUnitsFromItems(itemsForBrandCharts), 10);
            return data ? (
              <PieChart data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))} size={250} />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <ChartCard title="Inventario por Almacén (Unidades)">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = groupByWarehouseUnits(filteredSnapshots);
            return data ? (
              <BarChart data={data} height={300} showValues={true} />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
        </ChartCard>

        <ChartCard title="Participación de Inventario - Unids por Almacén">
          {loading ? (
            <div style={{ height: 300, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (() => {
            const data = groupByWarehouseUnits(filteredSnapshots);
            return data ? (
              <PieChart data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))} size={250} />
            ) : (
              <ReportPlaceholder title="Sin datos" height={300} />
            );
          })()}
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
