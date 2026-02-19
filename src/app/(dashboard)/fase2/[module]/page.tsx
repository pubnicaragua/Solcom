'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { ArrowLeft, ClipboardList } from 'lucide-react';

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

const MODULE_CONFIG: Record<ModuleId, { title: string; subtitle: string; color: string }> = {
  ventas: {
    title: 'Fase 2 · Ventas',
    subtitle: 'Gestión operativa de ventas y seguimiento comercial',
    color: '#10B981',
  },
  cotizaciones: {
    title: 'Fase 2 · Cotizaciones',
    subtitle: 'Creación y control de cotizaciones con estados',
    color: '#3B82F6',
  },
  alistamiento: {
    title: 'Fase 2 · Alistamiento',
    subtitle: 'Control de preparación de pedidos por bodega',
    color: '#F59E0B',
  },
  'ordenes-venta': {
    title: 'Fase 2 · Órdenes de Venta',
    subtitle: 'Gestión de ordenes y trazabilidad de despacho',
    color: '#8B5CF6',
  },
  insights: {
    title: 'Fase 2 · Insights',
    subtitle: 'Métricas operativas y gestión de hallazgos',
    color: '#EC4899',
  },
  transito: {
    title: 'Fase 2 · Mercancías en Tránsito',
    subtitle: 'Seguimiento de embarques y alertas de llegada',
    color: '#14B8A6',
  },
};

export default function Fase2ModulePage() {
  const params = useParams<{ module: string }>();
  const router = useRouter();
  const moduleId = params?.module as ModuleId;
  const config = MODULE_CONFIG[moduleId as ModuleId];
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<Fase2Record[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    owner_email: '',
    priority: 'media',
    status: 'pendiente' as RecordStatus,
  });

  if (!moduleId || !config) {
    return (
      <Card>
        <div style={{ padding: 20, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Módulo no encontrado</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            El módulo solicitado no existe o no está habilitado.
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={() => router.push('/fase2')}>
              Volver a Fase 2
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  async function loadRecords() {
    if (!moduleId || !MODULE_CONFIG[moduleId]) {
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/fase2/records?module=${moduleId}`, { cache: 'no-store' });
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
    if (!moduleId || !MODULE_CONFIG[moduleId]) return;
    void loadRecords();
  }, [moduleId]);

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      [r.title, r.description, r.owner_email, r.status, r.priority].join(' ').toLowerCase().includes(q)
    );
  }, [records, query]);

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
        body: JSON.stringify({ ...form, module: moduleId }),
      });
      if (!res.ok) throw new Error('Error al crear registro');

      setForm({ title: '', description: '', owner_email: '', priority: 'media', status: 'pendiente' });
      await loadRecords();
    } catch {
      alert('No se pudo crear el registro');
    } finally {
      setSaving(false);
    }
  }

  async function updateRecord(id: string, payload: Partial<Fase2Record>) {
    try {
      const res = await fetch(`/api/fase2/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Error al actualizar');
      await loadRecords();
    } catch {
      alert('No se pudo actualizar el registro');
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
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="h-title" style={{ fontSize: 'clamp(18px, 5vw, 24px)' }}>{config.title}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{config.subtitle}</div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push('/fase2')}>
          <ArrowLeft size={14} /> Volver a Fase 2
        </Button>
      </div>

      <Card>
        <div style={{ padding: 20, background: `linear-gradient(135deg, ${config.color} 0%, #1f2937 100%)`, borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'white', marginBottom: 8 }}>
            <ClipboardList size={18} />
            <strong>Panel operativo del módulo</strong>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
            Registra tareas, cambia estados, asigna responsables y controla el avance en tiempo real.
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Nuevo registro</div>
          <Input placeholder="Título" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          <Input placeholder="Descripción" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          <Input placeholder="Responsable (email)" value={form.owner_email} onChange={(e) => setForm((p) => ({ ...p, owner_email: e.target.value }))} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 8 }}>
            <Select
              value={form.priority}
              onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
              options={[
                { value: 'baja', label: 'Prioridad baja' },
                { value: 'media', label: 'Prioridad media' },
                { value: 'alta', label: 'Prioridad alta' },
              ]}
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
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" size="sm" onClick={createRecord} disabled={saving}>
              {saving ? 'Guardando...' : 'Crear registro'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setForm({ title: '', description: '', owner_email: '', priority: 'media', status: 'pendiente' })}>
              Limpiar
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Registros del módulo</div>
            <Input placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 220 }} />
          </div>

          {loading ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando registros...</div>
          ) : filteredRecords.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>No hay registros aún en este módulo.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {filteredRecords.map((record) => (
                <div key={record.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--panel)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontWeight: 600 }}>{record.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{record.description || 'Sin descripción'}</div>
                      <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 4 }}>
                        {record.owner_email || 'sin responsable'} · {new Date(record.updated_at).toLocaleString('es-NI')}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Select
                        value={record.priority || 'media'}
                        onChange={(e) => updateRecord(record.id, { priority: e.target.value as 'baja' | 'media' | 'alta' })}
                        options={[
                          { value: 'baja', label: 'Baja' },
                          { value: 'media', label: 'Media' },
                          { value: 'alta', label: 'Alta' },
                        ]}
                      />
                      <Select
                        value={record.status}
                        onChange={(e) => updateRecord(record.id, { status: e.target.value as RecordStatus })}
                        options={[
                          { value: 'borrador', label: 'Borrador' },
                          { value: 'pendiente', label: 'Pendiente' },
                          { value: 'confirmado', label: 'Confirmado' },
                          { value: 'en_proceso', label: 'En proceso' },
                          { value: 'completado', label: 'Completado' },
                          { value: 'cancelado', label: 'Cancelado' },
                        ]}
                      />
                      <Button variant="danger" size="sm" onClick={() => removeRecord(record.id)}>
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
