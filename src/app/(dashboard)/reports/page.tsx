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
        fetch('/api/reports/warehouses')
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

  async function exportToPDF() {
    if (!stats) return;
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
      doc.text(`Total Productos: ${stats.totalProducts || 0}`, 14, 52);
      doc.text(`Total Stock: ${stats.totalStock?.toLocaleString('es-NI') || 0} unidades`, 14, 58);
      doc.text(`Valor Estimado: $${stats.totalValue?.toLocaleString('es-NI') || 0}`, 14, 64);
      doc.text(`Items Stock Bajo: ${stats.lowStockItems || 0}`, 14, 70);
      doc.text(`Items Sin Stock: ${stats.outOfStockItems || 0}`, 14, 76);
      doc.text(`Bodegas Activas: ${stats.activeWarehouses || 0}`, 14, 82);

      const tableData = (agingData?.items || []).slice(0, 50).map((item: any) => [
        item.sku || 'N/A',
        item.name || 'N/A',
        item.category || 'Sin categoría',
        (item.stock_total || 0).toString(),
        `$${((item.stock_total || 0) * (item.price || 0)).toLocaleString('es-NI', { minimumFractionDigits: 2 })}`,
        `${item.daysAgo}d`
      ]);

      autoTable(doc, {
        startY: 90,
        head: [['SKU', 'Producto', 'Categoría', 'Stock', 'Valor', 'Días']],
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
    if (!agingData?.items) return;
    try {
      const csvRows = [
        ['SKU', 'Producto', 'Categoría', 'Stock', 'Valor', 'Días sin movimiento'].join(','),
      ];

      agingData.items.forEach((item: any) => {
        csvRows.push([
          item.sku || '',
          `"${item.name || ''}"`,
          `"${item.category || 'Sin categoría'}"`,
          String(item.stock_total ?? 0),
          String((item.stock_total || 0) * (item.price || 0)),
          String(item.daysAgo || 0),
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
          <Button variant="secondary" size="sm" onClick={exportToExcel}>
            <Download size={16} style={{ marginRight: 6 }} />
            <span style={{ display: isMobile ? 'none' : 'inline' }}>Excel</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={exportToPDF}>
            <FileText size={16} style={{ marginRight: 6 }} />
            <span style={{ display: isMobile ? 'none' : 'inline' }}>PDF</span>
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
            <strong>Error:</strong> {error}
          </div>
        </Card>
      )}

      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14 }}>


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
                <div style={{ fontSize: 28, fontWeight: 600 }}>{stats?.totalStock?.toLocaleString('es-NI') || 0}</div>
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
            ) : !hasFilters && !zohoKpisLoaded ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite', width: '60%' }} />
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ${stats?.totalValue?.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Inventario total
                </div>
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

      {/* SECCIÓN 1: INVENTARIO REMANENTE */}
      <div style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', padding: '12px 20px', borderRadius: 8 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>Inventario Remanente {'>'} = 90 Días</h2>
      </div>
      {loading ? (
        <Card><div style={{ height: 250, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} /></Card>
      ) : (() => {
        const agingItems = agingData?.items || [];
        const agingTotalUnits = agingData?.totalUnits || 0;
        const agingTotalValue = agingData?.totalValue || 0;

        return (
          <Card>
            <div style={{ padding: 16 }}>
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
                <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 13 }}>
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
                      {agingItems.map((item: any, idx: number) => {
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
                  {agingItems.length >= 100 && (
                    <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)', textAlign: 'center', background: 'var(--panel)' }}>
                      Mostrando top 100 productos
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
            return data && data.length > 0 ? (
              <HorizontalBarChart data={data.map((d: any, i: number) => ({ ...d, color: generateColors(data.length)[i] }))} height={300} />
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
