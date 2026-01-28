'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import ChartCard from '@/components/reports/ChartCard';
import BarChart from '@/components/reports/BarChart';
import LineChart from '@/components/reports/LineChart';
import DonutChart from '@/components/reports/DonutChart';
import { TrendingUp, TrendingDown, Package, Warehouse, Download, Calendar, AlertTriangle, DollarSign } from 'lucide-react';

interface ReportStats {
  totalValue: number;
  lowStockItems: number;
  topWarehouse: string;
  monthlyGrowth: number;
}

export default function ReportsPage() {
  const [period, setPeriod] = useState('30');
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportStats();
  }, [period]);

  async function fetchReportStats() {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      setStats({
        totalValue: 125430.50,
        lowStockItems: 12,
        topWarehouse: 'X1',
        monthlyGrowth: 8.5,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }

  function exportReport(format: 'pdf' | 'excel') {
    alert(`Exportando reporte en formato ${format.toUpperCase()}...`);
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="h-title">Reportes de Inventario</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={() => exportReport('excel')}>
            <Download size={16} style={{ marginRight: 6 }} />
            Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={() => exportReport('pdf')}>
            <Download size={16} style={{ marginRight: 6 }} />
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: 'var(--success)15', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <TrendingUp size={20} color="var(--success)" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Valor Total Inventario</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 600 }}>
                  ${stats?.totalValue.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>
                  +{stats?.monthlyGrowth}% vs mes anterior
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: 'var(--warning)15', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <TrendingDown size={20} color="var(--warning)" />
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)' }}>Items con Stock Bajo</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{stats?.lowStockItems}</div>
                <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 4 }}>
                  Requieren reabastecimiento
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: 'var(--brand-primary)15', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Warehouse size={20} color="var(--brand-primary)" />
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)' }}>Bodega Más Activa</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 600 }}>Bodega {stats?.topWarehouse}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Mayor rotación de inventario
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: '#3B82F615', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Package size={20} color="#3B82F6" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Movimientos del Período</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 600 }}>1,247</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Entradas y salidas registradas
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: '#8B5CF615', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Package size={20} color="#8B5CF6" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Productos Totales</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 600 }}>2,847</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  En todas las bodegas
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: '#10b98115', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <TrendingUp size={20} color="#10b981" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Rotación de Inventario</div>
            </div>
            {loading ? (
              <div style={{ height: 32, background: 'var(--panel)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 600 }}>4.2x</div>
                <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>
                  Promedio mensual
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Gráficos Visuales */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <ChartCard title="Tendencia de Inventario (Últimos 7 días)">
          <LineChart
            data={[
              { label: 'Lun', value: 2650 },
              { label: 'Mar', value: 2720 },
              { label: 'Mié', value: 2680 },
              { label: 'Jue', value: 2790 },
              { label: 'Vie', value: 2847 },
              { label: 'Sáb', value: 2820 },
              { label: 'Dom', value: 2847 },
            ]}
            color="var(--brand-primary)"
          />
        </ChartCard>

        <ChartCard title="Distribución por Categoría">
          <DonutChart
            data={[
              { label: 'Electrónica', value: 847, color: '#3b82f6' },
              { label: 'Accesorios', value: 623, color: '#22c55e' },
              { label: 'Periféricos', value: 512, color: '#eab308' },
              { label: 'Redes', value: 445, color: '#8b5cf6' },
              { label: 'Otros', value: 420, color: '#94a3b8' },
            ]}
            size={180}
          />
        </ChartCard>
      </div>

      <ChartCard title="Comparativa de Ventas por Bodega">
        <BarChart
          data={[
            { label: 'X1', value: 847, color: '#3b82f6' },
            { label: 'X4', value: 623, color: '#22c55e' },
            { label: 'X5', value: 512, color: '#eab308' },
            { label: 'X7', value: 445, color: '#f59e0b' },
            { label: 'X9', value: 420, color: '#8b5cf6' },
          ]}
          height={280}
          showValues={true}
        />
      </ChartCard>

      <Card>
        <div style={{ padding: 16 }}>
          <div className="h-subtitle" style={{ marginBottom: 16 }}>
            Análisis por Categoría
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              { category: 'Electrónica', items: 45, value: 45230.50, percentage: 36 },
              { category: 'Accesorios', items: 89, value: 32150.25, percentage: 26 },
              { category: 'Periféricos', items: 67, value: 28340.75, percentage: 23 },
              { category: 'Redes', items: 34, value: 19709.00, percentage: 15 },
            ].map((cat) => (
              <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{cat.category}</span>
                    <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                      {cat.items} items • ${cat.value.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div style={{ 
                    height: 8, 
                    background: 'var(--panel)', 
                    borderRadius: 4, 
                    overflow: 'hidden' 
                  }}>
                    <div style={{ 
                      height: '100%', 
                      width: `${cat.percentage}%`, 
                      background: 'var(--brand-primary)',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, minWidth: 50, textAlign: 'right' }}>
                  {cat.percentage}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card>
          <div style={{ padding: 16 }}>
            <div className="h-subtitle" style={{ marginBottom: 16 }}>
              Comparativa de Bodegas
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                { warehouse: 'X1', items: 847, value: 42150.50, percentage: 34 },
                { warehouse: 'X4', items: 623, value: 31240.25, percentage: 25 },
                { warehouse: 'X5', items: 512, value: 25630.75, percentage: 20 },
                { warehouse: 'X7', items: 445, value: 18409.00, percentage: 15 },
                { warehouse: 'X9', items: 420, value: 8000.00, percentage: 6 },
              ].map((wh) => (
                <div key={wh.warehouse} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ 
                    minWidth: 40, 
                    height: 40, 
                    borderRadius: 8, 
                    background: 'var(--brand-primary)15',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 14
                  }}>
                    {wh.warehouse}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{wh.items} productos</span>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                        ${wh.value.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div style={{ 
                      height: 6, 
                      background: 'var(--panel)', 
                      borderRadius: 3, 
                      overflow: 'hidden' 
                    }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${wh.percentage}%`, 
                        background: 'var(--brand-primary)',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, minWidth: 45, textAlign: 'right' }}>
                    {wh.percentage}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div className="h-subtitle" style={{ marginBottom: 16 }}>
              Alertas de Stock
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                { product: 'Laptop Dell Inspiron', stock: 3, status: 'critical', warehouse: 'X1' },
                { product: 'Monitor LG 24"', stock: 7, status: 'warning', warehouse: 'X4' },
                { product: 'Teclado Logitech', stock: 0, status: 'out', warehouse: 'X5' },
                { product: 'Mouse Inalámbrico', stock: 5, status: 'warning', warehouse: 'X1' },
                { product: 'Webcam HD', stock: 2, status: 'critical', warehouse: 'X7' },
              ].map((alert, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    padding: 10, 
                    background: 'var(--panel)', 
                    borderRadius: 6,
                    borderLeft: `3px solid ${
                      alert.status === 'out' ? '#ef4444' : 
                      alert.status === 'critical' ? '#f59e0b' : 
                      '#eab308'
                    }`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{alert.product}</div>
                    <div style={{ 
                      fontSize: 11, 
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: alert.status === 'out' ? '#ef444420' : '#f59e0b20',
                      color: alert.status === 'out' ? '#ef4444' : '#f59e0b'
                    }}>
                      {alert.status === 'out' ? 'SIN STOCK' : `${alert.stock} unidades`}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Bodega {alert.warehouse}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Análisis Predictivo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card>
          <div style={{ padding: 16 }}>
            <div className="h-subtitle" style={{ marginBottom: 16 }}>
              Proyección de Reabastecimiento
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                { product: 'Laptop Dell Inspiron', days: 3, urgency: 'high', units: 15 },
                { product: 'Monitor LG 24"', days: 7, urgency: 'medium', units: 20 },
                { product: 'Teclado Logitech', days: 14, urgency: 'low', units: 30 },
                { product: 'Mouse Inalámbrico', days: 5, urgency: 'high', units: 25 },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 12,
                    background: 'var(--panel)',
                    borderRadius: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                      {item.product}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Reabastecer en {item.days} días • {item.units} unidades
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background:
                        item.urgency === 'high'
                          ? '#ef444420'
                          : item.urgency === 'medium'
                          ? '#eab30820'
                          : '#22c55e20',
                      color:
                        item.urgency === 'high'
                          ? '#ef4444'
                          : item.urgency === 'medium'
                          ? '#eab308'
                          : '#22c55e',
                    }}
                  >
                    {item.urgency === 'high' ? 'URGENTE' : item.urgency === 'medium' ? 'PRONTO' : 'NORMAL'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div className="h-subtitle" style={{ marginBottom: 16 }}>
              Análisis de Rentabilidad
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div
                style={{
                  padding: 16,
                  background: 'var(--success)10',
                  borderRadius: 8,
                  border: '1px solid var(--success)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <DollarSign size={20} color="var(--success)" />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Margen de Ganancia Promedio</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--success)' }}>32.5%</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  +2.3% vs mes anterior
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  background: 'var(--brand-primary)10',
                  borderRadius: 8,
                  border: '1px solid var(--brand-primary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <TrendingUp size={20} color="var(--brand-primary)" />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Proyección de Ventas (30 días)</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--brand-primary)' }}>
                  $156,430
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Basado en tendencia actual
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  background: 'var(--warning)10',
                  borderRadius: 8,
                  border: '1px solid var(--warning)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <AlertTriangle size={20} color="var(--warning)" />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Productos de Baja Rotación</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--warning)' }}>18</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Sin movimiento en 60+ días
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ padding: 16 }}>
          <div className="h-subtitle" style={{ marginBottom: 16 }}>
            Top 10 Productos Más Vendidos
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>#</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Producto</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Unidades</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Valor Total</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Tendencia</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { rank: 1, name: 'Laptop Dell Inspiron 15', units: 45, value: 22500, trend: 'up' },
                  { rank: 2, name: 'Monitor LG 24"', units: 38, value: 11400, trend: 'up' },
                  { rank: 3, name: 'Teclado Logitech', units: 67, value: 6700, trend: 'down' },
                  { rank: 4, name: 'Mouse Inalámbrico', units: 89, value: 4450, trend: 'up' },
                  { rank: 5, name: 'Impresora HP LaserJet', units: 12, value: 6000, trend: 'up' },
                ].map((product) => (
                  <tr key={product.rank} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 8px', fontSize: 14 }}>{product.rank}</td>
                    <td style={{ padding: '12px 8px', fontSize: 14 }}>{product.name}</td>
                    <td style={{ padding: '12px 8px', fontSize: 14, textAlign: 'right' }}>{product.units}</td>
                    <td style={{ padding: '12px 8px', fontSize: 14, textAlign: 'right' }}>
                      ${product.value.toLocaleString('es-NI')}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      {product.trend === 'up' ? (
                        <TrendingUp size={16} color="var(--success)" />
                      ) : (
                        <TrendingDown size={16} color="var(--danger)" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
