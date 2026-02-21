'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import { Package, Boxes, Warehouse, Clock, DollarSign } from 'lucide-react';

interface KPIData {
  totalSKUs: number;
  totalProducts: number;
  totalStock: number;
  totalValue: number;
  activeWarehouses: number;
  lastSync: string;
}


export default function KPIGrid() {
  const [kpis, setKpis] = useState<KPIData>({
    totalSKUs: 0,
    totalProducts: 0,
    totalStock: 0,
    totalValue: 0,
    activeWarehouses: 0,
    lastSync: new Date().toLocaleString('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
  });
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchKPIs();
  }, []);

  // Suscripción a cambios en tiempo real de Supabase para actualizar KPIs
  useEffect(() => {
    const setupRealtime = async () => {
      try {
        const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs');
        const supabase = createClientComponentClient();

        const channel = supabase
          .channel('kpi-items-changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'items' },
            () => {
              // Refrescar KPIs cuando hay cambios
              fetchKPIs();
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (error) {
        console.error('Error setting up realtime for KPIs:', error);
      }
    };

    const cleanup = setupRealtime();
    return () => {
      cleanup.then((unsubscribe) => unsubscribe?.());
    };
  }, []);

  async function fetchKPIs() {
    try {
      const res = await fetch('/api/inventory/kpis/local');
      if (res.ok) {
        const data = await res.json();
        setKpis({
          ...data,
          lastSync: data.lastSync === 'Nunca'
            ? new Date().toLocaleString('es-NI', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
            : data.lastSync
        });
      }
    } catch (error) {
      // Error silencioso en producción
    } finally {
      setLoading(false);
    }
  }

  const kpiItems = [
    {
      icon: Package,
      label: 'Total SKUs',
      value: !mounted || loading ? '...' : kpis.totalSKUs.toLocaleString('es-NI'),
      color: 'var(--brand-primary)',
    },
    {
      icon: Package,
      label: 'Total Productos',
      value: !mounted || loading ? '...' : kpis.totalProducts.toLocaleString('es-NI'),
      color: 'var(--success)',
    },

    {
      icon: Warehouse,
      label: 'Bodegas Activas',
      value: !mounted || loading ? '...' : kpis.activeWarehouses.toString(),
      color: 'var(--brand-accent)',
    },
    {
      icon: Boxes,
      label: 'Total Stock',
      value: !mounted || loading ? '...' : kpis.totalStock.toLocaleString('es-NI'),
      color: '#f59e0b',
    },
    {
      icon: Clock,
      label: 'Última Sincronización',
      value: !mounted || loading ? '...' : kpis.lastSync,
      color: 'var(--warning)',
    },
  ];


  return (
    <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
      {kpiItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <Card
            key={item.label}
            padding={16}
            style={{
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              animation: `fadeInUp 0.5s ease ${index * 0.1}s both`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                className="kpi-icon"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  background: `${item.color}15`,
                  border: `2px solid ${item.color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease',
                  flexShrink: 0,
                }}
              >
                <Icon size={24} color={item.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 500 }}>
                  {item.label}
                </div>
                <div className="kpi-value" style={{ fontSize: 22, fontWeight: 700, color: item.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.value}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 640px) {
          .kpi-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
          .kpi-icon {
            width: 36px !important;
            height: 36px !important;
          }
          .kpi-icon svg {
            width: 18px !important;
            height: 18px !important;
          }
          .kpi-value {
            font-size: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
