'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import ChartCard from '@/components/reports/ChartCard';
import BarChart from '@/components/reports/BarChart';
import LineChart from '@/components/reports/LineChart';
import DonutChart from '@/components/reports/DonutChart';
import { Download, Package, TrendingUp, TrendingDown, Calendar, Warehouse, AlertTriangle, DollarSign, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Item {
  id: string;
  sku: string;
  name: string;
  color: string | null;
  state: string | null;
  zoho_item_id: string | null;
  created_at: string;
  updated_at: string;
  category: string | null;
  stock_total?: number | null;
  price?: number | null;
}

interface StockSnapshot {
  id: string;
  item_id: string;
  warehouse_id: string;
  qty: number;
  synced_at: string;
  items?: Item;
  warehouses?: Warehouse;
}

interface Warehouse {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

interface ReportStats {
  totalProducts: number;
  totalStock: number;
  totalValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  activeWarehouses: number;
  categoryBreakdown: Record<string, number>;
  warehouseBreakdown: Record<string, { stock: number; items: number }>;
  stockHistory: Array<{ date: string; stock: number }>;
}

export default function ReportsPage() {
  const [period, setPeriod] = useState('30');
  const [items, setItems] = useState<Item[]>([]);
  const [stockSnapshots, setStockSnapshots] = useState<StockSnapshot[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllData();
  }, [period]);

  async function fetchAllData() {
    setLoading(true);
    setError(null);
    try {
      const daysAgo = parseInt(period);
      const dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - daysAgo);

      const [itemsResult, snapshotsResult, warehousesResult] = await Promise.all([
        supabase.from('items').select('*').order('created_at', { ascending: false }),
        supabase.from('stock_snapshots').select(`
          *,
          items(*),
          warehouses(*)
        `)
          .gte('synced_at', dateFilter.toISOString())
          .range(0, 9999),
        supabase.from('warehouses').select('*').eq('active', true)
      ]);

      if (itemsResult.error) throw new Error(`Error items: ${itemsResult.error.message}`);
      if (snapshotsResult.error) throw new Error(`Error snapshots: ${snapshotsResult.error.message}`);
      if (warehousesResult.error) throw new Error(`Error warehouses: ${warehousesResult.error.message}`);

      const itemsData = itemsResult.data || [];
      const snapshotsData = snapshotsResult.data || [];
      const warehousesData = warehousesResult.data || [];

      setItems(itemsData);
      setStockSnapshots(snapshotsData);
      setWarehouses(warehousesData);

      calculateStats(itemsData, snapshotsData, warehousesData);
    } catch (err: any) {
      setError(err.message || 'Error al cargar datos');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }

  function calculateStats(items: Item[], snapshots: StockSnapshot[], warehouses: Warehouse[]) {
    // Use items table for global stats (faster and accurate)
    const totalStock = items.reduce((sum, item) => sum + (item.stock_total || 0), 0);
    const totalValue = items.reduce((sum, item) => sum + ((item.stock_total || 0) * (item.price || 0)), 0);

    const lowStockItems = items.filter(i => (i.stock_total || 0) > 0 && (i.stock_total || 0) < 10).length;
    const outOfStockItems = items.filter(i => (i.stock_total || 0) === 0).length;

    // Use snapshots for breakdown (metrics by warehouse/history need detail)
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

    // History needs snapshots
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
      totalProducts: items.length,
      totalStock,
      totalValue,
      lowStockItems,
      outOfStockItems,
      activeWarehouses: warehouses.length,
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
      console.error('PDF export error:', err);
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
      console.error('Excel export error:', err);
    }
  }

  const totalItems = items.length;
  const itemsByCategory = items.reduce((acc, item) => {
    const cat = item.category || 'Sin categoría';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const itemsByState = items.reduce((acc, item) => {
    const state = item.state || 'Sin estado';
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const recentItems = items.slice(0, 10);

  const topProducts = stockSnapshots
    .reduce((acc, s) => {
      const existing = acc.find(p => p.item_id === s.item_id);
      if (existing) {
        existing.totalQty += s.qty;
      } else {
        acc.push({ item_id: s.item_id, item: s.items, totalQty: s.qty });
      }
      return acc;
    }, [] as Array<{ item_id: string; item?: Item; totalQty: number }>)
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, 10);

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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <ChartCard title="Tendencia de Stock (Últimos 7 días)">
          {loading ? (
            <div style={{ height: 200, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (
            <LineChart
              data={stats?.stockHistory.map((h, i) => ({
                label: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][i] || h.date.slice(-2),
                value: h.stock
              })) || []}
              color="var(--brand-primary)"
            />
          )}
        </ChartCard>

        <ChartCard title="Distribución por Categoría">
          {loading ? (
            <div style={{ height: 200, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          ) : (
            <DonutChart
              data={Object.entries(stats?.categoryBreakdown || {}).map(([label, value], idx) => ({
                label,
                value,
                color: ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'][idx % 7]
              }))}
              size={180}
            />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Comparativa de Stock por Bodega">
        {loading ? (
          <div style={{ height: 280, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
        ) : (
          <BarChart
            data={Object.entries(stats?.warehouseBreakdown || {}).map(([label, data]) => ({
              label,
              value: data.stock
            }))}
            height={280}
            showValues={true}
          />
        )}
      </ChartCard>

      <Card>
        <div style={{ padding: 16 }}>
          <div className="h-subtitle" style={{ marginBottom: 16 }}>
            Top 10 Productos con Mayor Stock
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>#</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>SKU</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Producto</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Categoría</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Stock Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 20, textAlign: 'center' }}>
                      <div style={{ height: 100, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
                    </td>
                  </tr>
                ) : topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
                      No hay datos disponibles
                    </td>
                  </tr>
                ) : (
                  topProducts.map((product, index) => (
                    <tr key={product.item_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 8px', fontSize: 13, fontWeight: 600 }}>{index + 1}</td>
                      <td style={{ padding: '12px 8px', fontSize: 13, fontFamily: 'monospace' }}>{product.item?.sku || 'N/A'}</td>
                      <td style={{ padding: '12px 8px', fontSize: 13, fontWeight: 500 }}>{product.item?.name || 'N/A'}</td>
                      <td style={{ padding: '12px 8px', fontSize: 13 }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--panel)', fontSize: 11 }}>
                          {product.item?.category || 'Sin categoría'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', fontSize: 14, textAlign: 'right', fontWeight: 600, color: 'var(--brand-primary)' }}>
                        {product.totalQty.toLocaleString('es-NI')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
