'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { FileText, Package, Truck, Clock, BarChart3, ShoppingCart, ExternalLink } from 'lucide-react';

type ModuleId = 'ventas' | 'cotizaciones' | 'alistamiento' | 'ordenes-venta' | 'insights' | 'transito';
type RecordStatus = 'borrador' | 'pendiente' | 'confirmado' | 'en_proceso' | 'completado' | 'cancelado';

type Fase2Record = {
  id: string;
  module: ModuleId;
  title: string;
  description: string;
  status: RecordStatus;
  owner_email?: string;
  priority?: 'baja' | 'media' | 'alta';
  created_at: string;
  updated_at: string;
};

export default function Fase2Page() {
  const [activeModule, setActiveModule] = useState<ModuleId | ''>('');
  const [records, setRecords] = useState<Fase2Record[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    module: 'ventas' as ModuleId,
    title: '',
    description: '',
    owner_email: '',
    priority: 'media',
    status: 'borrador' as RecordStatus,
  });

  const modules = [
    {
      id: 'ventas',
      title: 'Módulo de Ventas',
      description: 'Gestión completa de ventas y órdenes',
      icon: ShoppingCart,
      color: '#10B981',
      route: '/fase2/ventas',
      features: [
        'Registro de ventas',
        'Historial de transacciones',
        'Reportes de ventas por vendedor',
        'Integración con inventario'
      ]
    },
    {
      id: 'cotizaciones',
      title: 'Módulo de Cotizaciones',
      description: 'Generación y gestión de cotizaciones',
      icon: FileText,
      color: '#3B82F6',
      route: '/fase2/cotizaciones',
      features: [
        'Crear cotizaciones personalizadas',
        'Convertir cotizaciones a órdenes',
        'Seguimiento de estado',
        'Plantillas predefinidas'
      ]
    },
    {
      id: 'alistamiento',
      title: 'Órdenes de Alistamiento',
      description: 'Gestión de preparación de pedidos en bodega',
      icon: Package,
      color: '#F59E0B',
      route: '/alistamiento',
      features: [
        'Generar orden de alistamiento',
        'Imprimir ticket de preparación',
        'Seguimiento de estado (Pendiente, En proceso, Listo)',
        'Asignación a personal de bodega'
      ]
    },
    {
      id: 'ordenes-venta',
      title: 'Órdenes de Venta - Plantilla Minorista',
      description: 'Sistema de órdenes con ticket y métricas de tiempo',
      icon: Truck,
      color: '#8B5CF6',
      route: '/fase2/ordenes-venta',
      features: [
        'Generar ticket tipo Plantilla Minorista',
        'Estados: Pendiente, Confirmado, En preparación, Listo',
        'Impresión automática al confirmar',
        'Notificación al cliente'
      ]
    },
    {
      id: 'insights',
      title: 'Insights de Bodega',
      description: 'Métricas y análisis de operaciones',
      icon: Clock,
      color: '#EC4899',
      route: '/fase2/insights',
      features: [
        'Tiempo promedio de preparación',
        'Horas pico de demanda',
        'Recomendaciones de personal',
        'Encolamiento inteligente de pedidos',
        'Dashboard de productividad'
      ]
    },
    {
      id: 'transito',
      title: 'Mercancías en Tránsito',
      description: 'Visualización y seguimiento de mercancías en tránsito',
      icon: BarChart3,
      color: '#14B8A6',
      route: '/fase2/transito',
      features: [
        'Registro de mercancías en tránsito',
        'Seguimiento de ubicación',
        'Fecha estimada de llegada',
        'Alertas de retrasos',
        'Integración con transferencias'
      ]
    }
  ];

  async function loadRecords() {
    setLoading(true);
    try {
      const res = await fetch('/api/fase2/records', { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudieron cargar registros');
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      const matchesModule = activeModule ? r.module === activeModule : true;
      const matchesQuery = !q
        ? true
        : [r.title, r.description, r.owner_email, r.module, r.status].join(' ').toLowerCase().includes(q);
      return matchesModule && matchesQuery;
    });
  }, [records, query, activeModule]);

  const countByModule = useMemo(() => {
    const map: Record<string, number> = {};
    modules.forEach((m) => { map[m.id] = 0; });
    records.forEach((r) => { map[r.module] = (map[r.module] || 0) + 1; });
    return map;
  }, [records]);

  async function createRecord() {
    if (!form.title.trim()) {
      alert('El título es requerido');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/fase2/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Error al crear');
      setForm({ module: 'ventas', title: '', description: '', owner_email: '', priority: 'media', status: 'borrador' });
      await loadRecords();
    } catch {
      alert('No se pudo crear el registro');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: RecordStatus) {
    try {
      const res = await fetch(`/api/fase2/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Error al actualizar estado');
      await loadRecords();
    } catch {
      alert('No se pudo actualizar el estado');
    }
  }

  async function removeRecord(id: string) {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      const res = await fetch(`/api/fase2/records/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      await loadRecords();
    } catch {
      alert('No se pudo eliminar el registro');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="h-title" style={{ fontSize: 'clamp(18px, 5vw, 24px)' }}>Fase 2 - Próximas Funcionalidades</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Módulos en desarrollo para mejorar la gestión operativa
          </div>
        </div>
      </div>

      <Card>
        <div style={{ padding: 20, background: 'linear-gradient(135deg, #1f3f8a 0%, #182848 100%)', borderRadius: 8 }}>
          <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 8 }}>Fase 2 - CRUD Operativo</h2>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: 0 }}>
            Aquí ya puedes crear, actualizar y eliminar registros reales para ir construyendo el flujo completo.
          </p>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 12 }}>
        {modules.map((module) => {
          const Icon = module.icon;
          const isActive = activeModule === module.id;
          
          return (
            <Card key={module.id}>
              <div
                onClick={() => setActiveModule(isActive ? '' : module.id as ModuleId)}
                style={{
                  padding: 16,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  borderLeft: `4px solid ${module.color}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: `${module.color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={24} color={module.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 4 }}>
                      {module.title}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                      {module.description}
                    </p>
                    <p style={{ fontSize: 12, color: '#93c5fd', marginTop: 8 }}>
                      Registros: {countByModule[module.id] || 0}
                    </p>
                  </div>
                </div>

                {isActive && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: module.color }}>
                      Funcionalidades Planificadas:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--muted)' }}>
                      {module.features.map((feature, idx) => (
                        <li key={idx} style={{ marginBottom: 6 }}>
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {module.id === 'ordenes-venta' && (
                      <div style={{ marginTop: 12, padding: 12, background: 'var(--panel)', borderRadius: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                          Roles con acceso:
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          • Super Admin (acceso completo)<br />
                          • Gerente de Bodega (gestión de órdenes)<br />
                          • Vendedor (solo sus propias ventas)
                        </div>
                      </div>
                    )}

                    {module.id === 'insights' && (
                      <div style={{ marginTop: 12, padding: 12, background: 'var(--panel)', borderRadius: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                          Métricas clave:
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          • Tiempo promedio de preparación por pedido<br />
                          • Horas pico (más pedidos)<br />
                          • Sugerencias de personal necesario<br />
                          • Cola de pedidos en tiempo real
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Link href={module.route} onClick={(e) => e.stopPropagation()}>
                    <Button variant="secondary" size="sm">
                      Ver detalles
                      <ExternalLink size={14} />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveModule(isActive ? '' : module.id as ModuleId);
                    }}
                  >
                    {isActive ? 'Ocultar resumen' : 'Resumen rápido'}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <div style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Crear nuevo registro</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 10 }}>
              <Select
                value={form.module}
                onChange={(e) => setForm((p) => ({ ...p, module: e.target.value as ModuleId }))}
                options={modules.map((m) => ({ value: m.id, label: m.title }))}
              />
              <Select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as RecordStatus }))}
                options={[
                  { value: 'borrador', label: 'Borrador' },
                  { value: 'pendiente', label: 'Pendiente' },
                  { value: 'confirmado', label: 'Confirmado' },
                  { value: 'en_proceso', label: 'En proceso' },
                  { value: 'completado', label: 'Completado' },
                  { value: 'cancelado', label: 'Cancelado' },
                ]}
              />
              <Select
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                options={[
                  { value: 'baja', label: 'Prioridad baja' },
                  { value: 'media', label: 'Prioridad media' },
                  { value: 'alta', label: 'Prioridad alta' },
                ]}
              />
            </div>

            <Input
              placeholder="Título"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            />
            <Input
              placeholder="Descripción"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
            <Input
              placeholder="Email responsable"
              value={form.owner_email}
              onChange={(e) => setForm((p) => ({ ...p, owner_email: e.target.value }))}
            />

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" size="sm" onClick={createRecord} disabled={saving}>
                {saving ? 'Guardando...' : 'Crear registro'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setForm({ module: 'ventas', title: '', description: '', owner_email: '', priority: 'media', status: 'borrador' })}>
                Limpiar
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 20, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Registros Fase 2</h3>
            <Input
              placeholder="Buscar registro"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ minWidth: 220 }}
            />
          </div>

          {loading ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando registros...</div>
          ) : filteredRecords.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>No hay registros para esta selección.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {filteredRecords.map((r) => (
                <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--panel)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.description || 'Sin descripción'}</div>
                      <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 4 }}>
                        {r.module} · {r.owner_email || 'sin responsable'} · {new Date(r.updated_at).toLocaleString('es-NI')}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Select
                        value={r.status}
                        onChange={(e) => updateStatus(r.id, e.target.value as RecordStatus)}
                        options={[
                          { value: 'borrador', label: 'Borrador' },
                          { value: 'pendiente', label: 'Pendiente' },
                          { value: 'confirmado', label: 'Confirmado' },
                          { value: 'en_proceso', label: 'En proceso' },
                          { value: 'completado', label: 'Completado' },
                          { value: 'cancelado', label: 'Cancelado' },
                        ]}
                      />
                      <Button variant="danger" size="sm" onClick={() => removeRecord(r.id)}>Eliminar</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Total registros: {filteredRecords.length}
          </div>
        </div>
      </Card>
    </div>
  );
}
