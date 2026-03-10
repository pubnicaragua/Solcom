'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Hand,
  PackageSearch,
  PlayCircle,
  RefreshCw,
  Truck,
  UserRound,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

type PickStatus =
  | 'queued'
  | 'claimed'
  | 'picking'
  | 'ready'
  | 'completed_floor'
  | 'completed_dispatch'
  | 'cancelled';

type PickAction = 'claim' | 'start' | 'ready' | 'complete';

type PickItem = {
  id: string;
  description: string;
  quantity: number;
  serials_required: boolean;
  serial_numbers_requested: string | null;
  serial_numbers_selected: string | null;
};

type PickEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_user_id: string | null;
  created_at: string;
};

type PickOrder = {
  id: string;
  row_version: number | null;
  sales_order_id: string;
  sales_order_number: string | null;
  sales_order_status: string | null;
  sales_order_total: number;
  sales_order_date: string | null;
  expected_delivery_date: string | null;
  customer: { id: string; name: string } | null;
  warehouse: { id: string; code: string; name: string } | null;
  salesperson_name: string | null;
  delivery_requested: boolean;
  priority: 'urgent' | 'normal';
  status: PickStatus;
  status_label: string;
  queue_position: number | null;
  queued_at: string | null;
  claimed_at: string | null;
  started_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  assigned_user_id: string | null;
  assigned_user: { id: string; full_name: string | null; email: string | null } | null;
  items: PickItem[];
  events?: PickEvent[];
};

type PickSummary = {
  queued: number;
  in_progress: number;
  ready: number;
  completed: number;
};

type InsightsResponse = {
  totals?: {
    active_backlog?: number;
    throughput_per_hour?: number;
  };
  timings?: {
    avg_queue_wait_min?: number;
    p95_queue_wait_min?: number;
    avg_pick_time_min?: number;
  };
  recommendations?: Array<{
    code: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
  }>;
};

type WarehouseOption = {
  id: string;
  code: string;
  name: string;
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitSerials(serials: string | null | undefined): string[] {
  if (!serials) return [];
  return String(serials)
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function statusLabel(status: PickStatus): string {
  if (status === 'queued') return 'En cola';
  if (status === 'claimed') return 'Tomada';
  if (status === 'picking') return 'En proceso';
  if (status === 'ready') return 'Lista';
  if (status === 'completed_floor') return 'Completada piso';
  if (status === 'completed_dispatch') return 'Completada despacho';
  return 'Cancelada';
}

function actionForStatus(status: PickStatus): { action: PickAction; label: string } | null {
  if (status === 'queued') return { action: 'claim', label: 'Tomar' };
  if (status === 'claimed') return { action: 'start', label: 'Iniciar' };
  if (status === 'picking') return { action: 'ready', label: 'Marcar lista' };
  if (status === 'ready') return { action: 'complete', label: 'Completar' };
  return null;
}

function ageLabel(from: string | null | undefined): string {
  const timestamp = normalizeText(from);
  if (!timestamp) return 'Sin marca';
  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) return 'Sin marca';

  const diffMin = Math.max(0, Math.floor((Date.now() - value) / 60000));
  if (diffMin < 60) return `${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  if (hours < 24) return `${hours} h ${minutes} min`;
  const days = Math.floor(hours / 24);
  return `${days} d ${hours % 24} h`;
}

function formatDateTime(value: string | null | undefined): string {
  const text = normalizeText(value);
  if (!text) return '—';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('es-NI', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
  }).format(normalizeNumber(value, 0));
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

function summarizePickOrders(rows: PickOrder[]): PickSummary {
  return {
    queued: rows.filter((row) => row.status === 'queued').length,
    in_progress: rows.filter((row) => row.status === 'claimed' || row.status === 'picking').length,
    ready: rows.filter((row) => row.status === 'ready').length,
    completed: rows.filter((row) => row.status === 'completed_floor' || row.status === 'completed_dispatch').length,
  };
}

const DEMO_PICK_ORDERS: PickOrder[] = [
  {
    id: 'demo-pick-1',
    row_version: 1,
    sales_order_id: 'demo-so-1',
    sales_order_number: 'OV-SC-00981',
    sales_order_status: 'confirmada',
    sales_order_total: 3250,
    sales_order_date: new Date().toISOString().slice(0, 10),
    expected_delivery_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    customer: { id: 'demo-cust-1', name: 'Inversiones Centro S.A.' },
    warehouse: { id: 'demo-wh-1', code: 'SC', name: 'SC — SC' },
    salesperson_name: 'Luis Artola',
    delivery_requested: false,
    priority: 'urgent',
    status: 'queued',
    status_label: statusLabel('queued'),
    queue_position: 1,
    queued_at: isoMinutesAgo(18),
    claimed_at: null,
    started_at: null,
    ready_at: null,
    completed_at: null,
    assigned_user_id: null,
    assigned_user: null,
    items: [
      {
        id: 'demo-item-1',
        description: 'Test prueba de velocidad — GENERAL (GENERAL)',
        quantity: 2,
        serials_required: true,
        serial_numbers_requested: '51541, 51542',
        serial_numbers_selected: null,
      },
      {
        id: 'demo-item-2',
        description: 'Router empresarial AX3000',
        quantity: 1,
        serials_required: false,
        serial_numbers_requested: null,
        serial_numbers_selected: null,
      },
    ],
    events: [
      {
        id: 'demo-ev-1',
        event_type: 'pick_order_created',
        from_status: null,
        to_status: 'queued',
        actor_user_id: 'demo-user-ventas',
        created_at: isoMinutesAgo(19),
      },
    ],
  },
  {
    id: 'demo-pick-2',
    row_version: 4,
    sales_order_id: 'demo-so-2',
    sales_order_number: 'OV-MS-00412',
    sales_order_status: 'confirmada',
    sales_order_total: 1580,
    sales_order_date: new Date().toISOString().slice(0, 10),
    expected_delivery_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    customer: { id: 'demo-cust-2', name: 'Comercial Delta' },
    warehouse: { id: 'demo-wh-2', code: 'MS', name: 'MS — MS' },
    salesperson_name: 'Andrea López',
    delivery_requested: true,
    priority: 'normal',
    status: 'picking',
    status_label: statusLabel('picking'),
    queue_position: null,
    queued_at: isoMinutesAgo(42),
    claimed_at: isoMinutesAgo(30),
    started_at: isoMinutesAgo(24),
    ready_at: null,
    completed_at: null,
    assigned_user_id: 'demo-picker-1',
    assigned_user: { id: 'demo-picker-1', full_name: 'Carlos Bodega', email: 'carlos@demo.local' },
    items: [
      {
        id: 'demo-item-3',
        description: 'Switch 24 puertos PoE',
        quantity: 1,
        serials_required: true,
        serial_numbers_requested: 'POE-8821',
        serial_numbers_selected: 'POE-8821',
      },
      {
        id: 'demo-item-4',
        description: 'Patch panel CAT6',
        quantity: 3,
        serials_required: false,
        serial_numbers_requested: null,
        serial_numbers_selected: null,
      },
    ],
    events: [
      {
        id: 'demo-ev-2',
        event_type: 'pick_order_claim',
        from_status: 'queued',
        to_status: 'claimed',
        actor_user_id: 'demo-picker-1',
        created_at: isoMinutesAgo(30),
      },
      {
        id: 'demo-ev-3',
        event_type: 'pick_order_start',
        from_status: 'claimed',
        to_status: 'picking',
        actor_user_id: 'demo-picker-1',
        created_at: isoMinutesAgo(24),
      },
    ],
  },
  {
    id: 'demo-pick-3',
    row_version: 6,
    sales_order_id: 'demo-so-3',
    sales_order_number: 'OV-SC-00979',
    sales_order_status: 'confirmada',
    sales_order_total: 980,
    sales_order_date: new Date().toISOString().slice(0, 10),
    expected_delivery_date: new Date().toISOString().slice(0, 10),
    customer: { id: 'demo-cust-3', name: 'Octopus Technology' },
    warehouse: { id: 'demo-wh-1', code: 'SC', name: 'SC — SC' },
    salesperson_name: 'Luis Artola',
    delivery_requested: false,
    priority: 'urgent',
    status: 'ready',
    status_label: statusLabel('ready'),
    queue_position: null,
    queued_at: isoMinutesAgo(61),
    claimed_at: isoMinutesAgo(54),
    started_at: isoMinutesAgo(50),
    ready_at: isoMinutesAgo(7),
    completed_at: null,
    assigned_user_id: 'demo-picker-2',
    assigned_user: { id: 'demo-picker-2', full_name: 'Martha Operaciones', email: 'martha@demo.local' },
    items: [
      {
        id: 'demo-item-5',
        description: 'UPS 2000VA',
        quantity: 1,
        serials_required: true,
        serial_numbers_requested: 'UPS-30011',
        serial_numbers_selected: 'UPS-30011',
      },
    ],
    events: [
      {
        id: 'demo-ev-4',
        event_type: 'pick_order_ready',
        from_status: 'picking',
        to_status: 'ready',
        actor_user_id: 'demo-picker-2',
        created_at: isoMinutesAgo(7),
      },
    ],
  },
];

const DEMO_INSIGHTS: InsightsResponse = {
  totals: {
    active_backlog: 3,
    throughput_per_hour: 0.31,
  },
  timings: {
    avg_queue_wait_min: 15.6,
    p95_queue_wait_min: 34.2,
    avg_pick_time_min: 22.8,
  },
  recommendations: [
    {
      code: 'BACKLOG_HIGH',
      severity: 'medium',
      message: 'Ejemplo: el backlog supera la capacidad de la siguiente hora. Considera reforzar bodega SC.',
    },
    {
      code: 'PICKER_SATURATION',
      severity: 'low',
      message: 'Ejemplo: un usuario concentra la mayoría de órdenes activas. Distribuye carga para bajar el tiempo de lista.',
    },
  ],
};

export default function PickingBoardPage() {
  const [warehouseId, setWarehouseId] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [range, setRange] = useState<'7d' | '30d'>('7d');
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [orders, setOrders] = useState<PickOrder[]>([]);
  const [summary, setSummary] = useState<PickSummary>({ queued: 0, in_progress: 0, ready: 0, completed: 0 });
  const [insights, setInsights] = useState<InsightsResponse | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [demoMode, setDemoMode] = useState(false);

  const loadWarehouses = useCallback(async () => {
    try {
      const res = await fetch('/api/warehouses', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      setWarehouses(
        data.map((row: any) => ({
          id: normalizeText(row?.id),
          code: normalizeText(row?.code),
          name: normalizeText(row?.name),
        })).filter((row: WarehouseOption) => row.id)
      );
    } catch {
      // non blocking
    }
  }, []);

  const loadData = useCallback(async (withLoading = true) => {
    if (demoMode) return;

    if (withLoading) setLoading(true);
    else setRefreshing(true);

    try {
      setError('');
      const params = new URLSearchParams();
      if (warehouseId) params.set('warehouse_id', warehouseId);
      if (mine) params.set('mine', 'true');
      if (search.trim()) params.set('search', search.trim());
      params.set('include_events', 'true');
      params.set('per_page', '120');

      if (statusFilter === 'active') {
        params.set('status', 'queued,claimed,picking,ready');
      } else if (statusFilter === 'in_progress') {
        params.set('status', 'claimed,picking');
      } else if (statusFilter === 'completed') {
        params.set('status', 'completed_floor,completed_dispatch');
      } else if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const [ordersRes, insightsRes] = await Promise.all([
        fetch(`/api/warehouse/picking/orders?${params.toString()}`, { cache: 'no-store' }),
        fetch(`/api/warehouse/picking/insights?${new URLSearchParams({
          ...(warehouseId ? { warehouse_id: warehouseId } : {}),
          range,
        }).toString()}`, { cache: 'no-store' }),
      ]);

      const ordersJson = await ordersRes.json().catch(() => null);
      if (!ordersRes.ok) {
        throw new Error(ordersJson?.error || 'No se pudo cargar el tablero de alistamiento.');
      }

      const nextRows: PickOrder[] = Array.isArray(ordersJson?.rows) ? ordersJson.rows : [];
      setOrders(nextRows);
      setSummary(ordersJson?.summary || { queued: 0, in_progress: 0, ready: 0, completed: 0 });

      if (nextRows.length === 0) {
        setSelectedOrderId(null);
      } else {
        const selectedStillExists = nextRows.some((row) => row.id === selectedOrderId);
        if (!selectedStillExists) {
          setSelectedOrderId(nextRows[0].id);
        }
      }

      if (insightsRes.ok) {
        const insightsJson = await insightsRes.json().catch(() => null);
        setInsights(insightsJson || null);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudo cargar alistamiento.');
      setOrders([]);
      setSummary({ queued: 0, in_progress: 0, ready: 0, completed: 0 });
      setInsights(null);
      setSelectedOrderId(null);
    } finally {
      if (withLoading) setLoading(false);
      else setRefreshing(false);
    }
  }, [warehouseId, mine, range, search, selectedOrderId, statusFilter, demoMode]);

  useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  useEffect(() => {
    if (demoMode) return;
    const timer = setInterval(() => {
      void loadData(false);
    }, 20000);
    return () => clearInterval(timer);
  }, [loadData, demoMode]);

  const effectiveOrders = useMemo(
    () => (demoMode ? DEMO_PICK_ORDERS : orders),
    [demoMode, orders]
  );

  const effectiveSummary = useMemo(
    () => (demoMode ? summarizePickOrders(effectiveOrders) : summary),
    [demoMode, effectiveOrders, summary]
  );

  const effectiveInsights = useMemo(
    () => (demoMode ? DEMO_INSIGHTS : insights),
    [demoMode, insights]
  );

  const selectedOrder = useMemo(
    () => effectiveOrders.find((order) => order.id === selectedOrderId) || null,
    [effectiveOrders, selectedOrderId]
  );

  const board = useMemo(() => ({
    queued: effectiveOrders.filter((order) => order.status === 'queued'),
    processing: effectiveOrders.filter((order) => order.status === 'claimed' || order.status === 'picking'),
    ready: effectiveOrders.filter((order) => order.status === 'ready'),
  }), [effectiveOrders]);

  const p95Queue = normalizeNumber(effectiveInsights?.timings?.p95_queue_wait_min, 0);
  const avgQueue = normalizeNumber(effectiveInsights?.timings?.avg_queue_wait_min, 0);
  const avgPick = normalizeNumber(effectiveInsights?.timings?.avg_pick_time_min, 0);
  const throughput = normalizeNumber(effectiveInsights?.totals?.throughput_per_hour, 0);

  async function runAction(order: PickOrder, action: PickAction) {
    if (demoMode) {
      setError('Modo demo activo: las acciones no se ejecutan en backend.');
      return;
    }

    const endpoint = `/api/warehouse/picking/orders/${order.id}/${action}`;
    setActionLoading(`${order.id}:${action}`);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row_version: order.row_version }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo actualizar la orden de alistamiento.');
      }

      await loadData(false);
    } catch (actionError: any) {
      setError(actionError?.message || 'No se pudo ejecutar la acción.');
    } finally {
      setActionLoading(null);
    }
  }

  const actionIcon = (action: PickAction) => {
    if (action === 'claim') return <Hand size={14} />;
    if (action === 'start') return <PlayCircle size={14} />;
    if (action === 'ready') return <CheckCircle2 size={14} />;
    return <CheckCircle2 size={14} />;
  };

  function toggleDemoMode() {
    const nextMode = !demoMode;
    setDemoMode(nextMode);
    setError('');
    if (nextMode) {
      setSelectedOrderId(DEMO_PICK_ORDERS[0]?.id || null);
      return;
    }
    setSelectedOrderId(null);
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="h-title" style={{ fontSize: 'clamp(18px, 4vw, 24px)' }}>Alistamiento de Bodega</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Cola operativa por bodega con control de toma, tiempos e insights.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/ventas" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="sm">Ver Ventas</Button>
          </Link>
          <Button
            variant={demoMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={toggleDemoMode}
          >
            {demoMode ? 'Salir demo' : 'Cargar ejemplo'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadData(false)}
            disabled={refreshing || loading || demoMode}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {demoMode && (
        <Card style={{ borderColor: 'rgba(56,189,248,0.45)', background: 'rgba(8,47,73,0.45)' }}>
          <div style={{ fontSize: 13, color: '#bae6fd' }}>
            Vista demo activa: estás viendo datos estáticos de ejemplo para presentar la UI de alistamiento.
          </div>
        </Card>
      )}

      <Card>
        <div className="filters-grid">
          <Select
            label="Bodega"
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
            options={[
              { value: '', label: 'Todas las bodegas' },
              ...warehouses.map((warehouse) => ({
                value: warehouse.id,
                label: warehouse.code ? `${warehouse.code} — ${warehouse.name}` : warehouse.name,
              })),
            ]}
          />

          <Select
            label="Estado"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={[
              { value: 'active', label: 'Activas' },
              { value: 'all', label: 'Todas' },
              { value: 'queued', label: 'En cola' },
              { value: 'in_progress', label: 'En proceso' },
              { value: 'ready', label: 'Listas' },
              { value: 'completed', label: 'Completadas' },
              { value: 'cancelled', label: 'Canceladas' },
            ]}
          />

          <Select
            label="Rango Insights"
            value={range}
            onChange={(event) => setRange(event.target.value as '7d' | '30d')}
            options={[
              { value: '7d', label: 'Últimos 7 días' },
              { value: '30d', label: 'Últimos 30 días' },
            ]}
          />

          <Input
            label="Buscar"
            placeholder="OV o cliente"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button
              variant={mine ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setMine((value) => !value)}
            >
              <UserRound size={14} />
              {mine ? 'Solo mis órdenes' : 'Ver todas'}
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <Card style={{ borderColor: 'rgba(239,68,68,0.45)', background: 'rgba(127,29,29,0.28)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#fecaca' }}>
            <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 13 }}>
              {error}
              <div style={{ marginTop: 4, color: '#fca5a5' }}>
                Si el mensaje indica migración faltante, ejecuta `warehouse-picking-v1.sql` y activa `SALES_PICKING_FLOW_ENABLED=true`.
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="kpi-grid">
        {[
          { label: 'En cola', value: effectiveSummary.queued, accent: '#fbbf24' },
          { label: 'En proceso', value: effectiveSummary.in_progress, accent: '#60a5fa' },
          { label: 'Listas', value: effectiveSummary.ready, accent: '#34d399' },
          { label: 'p95 espera', value: `${p95Queue.toFixed(1)} min`, accent: '#f97316' },
          { label: 'Prom. alistamiento', value: `${avgPick.toFixed(1)} min`, accent: '#22d3ee' },
          { label: 'Throughput/h', value: throughput.toFixed(3), accent: '#a78bfa' },
        ].map((kpi) => (
          <Card key={kpi.label} style={{ padding: 12, borderColor: `${kpi.accent}55` }}>
            <div style={{ fontSize: 11, color: kpi.accent, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {kpi.label}
            </div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>
              {kpi.value}
            </div>
          </Card>
        ))}
      </div>

      <div className="board-layout">
        <Card style={{ padding: 12 }}>
          {loading ? (
            <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Cargando tablero de alistamiento...</div>
          ) : (
            <div className="columns-grid">
              {[
                { key: 'queued', title: 'En cola (FIFO + urgente)', rows: board.queued },
                { key: 'processing', title: 'Tomadas / En proceso', rows: board.processing },
                { key: 'ready', title: 'Listas', rows: board.ready },
              ].map((column) => (
                <div key={column.key} className="column-block">
                  <div className="column-title">
                    <span>{column.title}</span>
                    <span style={{ color: 'var(--muted)' }}>{column.rows.length}</span>
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {column.rows.length === 0 ? (
                      <div className="empty-col">Sin órdenes</div>
                    ) : (
                      column.rows.map((order) => {
                        const action = actionForStatus(order.status);
                        const actionKey = action ? `${order.id}:${action.action}` : null;
                        const deliveryBadge = order.delivery_requested ? 'Delivery' : 'Cliente en piso';

                        return (
                          <button
                            key={order.id}
                            className={`pick-card ${selectedOrderId === order.id ? 'pick-card--active' : ''}`}
                            onClick={() => setSelectedOrderId(order.id)}
                            type="button"
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>
                                {order.sales_order_number || order.sales_order_id.slice(0, 8)}
                              </div>
                              <div className={`priority-badge ${order.priority === 'urgent' ? 'priority-urgent' : 'priority-normal'}`}>
                                {order.priority === 'urgent' ? 'Urgente' : 'Normal'}
                              </div>
                            </div>

                            <div style={{ fontSize: 12, marginTop: 6 }}>{order.customer?.name || 'Cliente no disponible'}</div>

                            <div className="meta-row">
                              <span><Clock3 size={12} /> {ageLabel(order.queued_at)}</span>
                              <span>{formatCurrency(order.sales_order_total || 0)}</span>
                            </div>

                            <div className="meta-row" style={{ marginTop: 4 }}>
                              <span><UserRound size={12} /> {order.salesperson_name || 'Sin vendedor'}</span>
                              <span>{statusLabel(order.status)}</span>
                            </div>

                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                              <span className={`delivery-badge ${order.delivery_requested ? 'delivery-yes' : 'delivery-no'}`}>
                                {order.delivery_requested ? <Truck size={12} /> : <PackageSearch size={12} />}
                                {deliveryBadge}
                              </span>
                              {order.status === 'queued' && Number(order.queue_position || 0) > 0 && (
                                <span className="queue-badge">#{order.queue_position}</span>
                              )}
                            </div>

                            {action && (
                              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void runAction(order, action.action);
                                  }}
                                  disabled={demoMode || actionLoading === actionKey}
                                >
                                  {actionLoading === actionKey ? <RefreshCw size={13} className="spin" /> : actionIcon(action.action)}
                                  {action.label}
                                </Button>
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card style={{ padding: 12 }}>
          {!selectedOrder ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>
              Selecciona una orden para ver el detalle y el historial de eventos.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  {selectedOrder.sales_order_number || selectedOrder.sales_order_id}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {selectedOrder.customer?.name || 'Cliente no disponible'}
                </div>
              </div>

              <div className="detail-grid">
                <div>
                  <div className="detail-label">Estado</div>
                  <div>{statusLabel(selectedOrder.status)}</div>
                </div>
                <div>
                  <div className="detail-label">Bodega</div>
                  <div>{selectedOrder.warehouse?.code || selectedOrder.warehouse?.name || '—'}</div>
                </div>
                <div>
                  <div className="detail-label">Vendedor</div>
                  <div>{selectedOrder.salesperson_name || '—'}</div>
                </div>
                <div>
                  <div className="detail-label">Asignado a</div>
                  <div>{selectedOrder.assigned_user?.full_name || selectedOrder.assigned_user?.email || 'Sin asignar'}</div>
                </div>
                <div>
                  <div className="detail-label">Total OV</div>
                  <div>{formatCurrency(selectedOrder.sales_order_total || 0)}</div>
                </div>
                <div>
                  <div className="detail-label">Espera promedio</div>
                  <div>{avgQueue.toFixed(1)} min</div>
                </div>
                <div>
                  <div className="detail-label">En cola desde</div>
                  <div>{formatDateTime(selectedOrder.queued_at)}</div>
                </div>
                <div>
                  <div className="detail-label">Lista desde</div>
                  <div>{formatDateTime(selectedOrder.ready_at)}</div>
                </div>
              </div>

              <div>
                <div className="section-title">Líneas de alistamiento</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {(selectedOrder.items || []).map((item) => (
                    <div key={item.id} className="line-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.description || 'Artículo'}</div>
                        <div style={{ fontSize: 12, color: '#93c5fd' }}>Cant: {normalizeNumber(item.quantity, 0)}</div>
                      </div>

                      {item.serials_required && (
                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
                          <div>Solicitados: {splitSerials(item.serial_numbers_requested).join(', ') || '—'}</div>
                          <div>Seleccionados: {splitSerials(item.serial_numbers_selected).join(', ') || '—'}</div>
                        </div>
                      )}
                    </div>
                  ))}

                  {selectedOrder.items.length === 0 && (
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>No hay snapshot de líneas.</div>
                  )}
                </div>
              </div>

              <div>
                <div className="section-title">Historial de eventos</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {(selectedOrder.events || []).slice(0, 12).map((event) => (
                    <div key={event.id} className="event-row">
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{event.event_type}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {event.from_status || '—'} → {event.to_status || '—'} · {formatDateTime(event.created_at)}
                      </div>
                    </div>
                  ))}

                  {(selectedOrder.events || []).length === 0 && (
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>Sin eventos registrados.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {(effectiveInsights?.recommendations || []).length > 0 && (
        <Card>
          <div className="section-title" style={{ marginBottom: 8 }}>Recomendaciones operativas</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {(effectiveInsights?.recommendations || []).map((recommendation) => (
              <div key={recommendation.code} className={`recommendation recommendation-${recommendation.severity}`}>
                <AlertTriangle size={14} />
                <span>{recommendation.message}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <style jsx>{`
        .filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
          align-items: end;
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
        }

        .board-layout {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
          gap: 10px;
          align-items: start;
        }

        .columns-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(220px, 1fr));
          gap: 10px;
        }

        .column-block {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.02);
        }

        .column-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .empty-col {
          border: 1px dashed rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          padding: 12px;
          font-size: 12px;
          color: var(--muted);
          text-align: center;
        }

        .pick-card {
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          background: rgba(10, 19, 37, 0.7);
          padding: 10px;
          width: 100%;
          text-align: left;
          cursor: pointer;
          transition: border-color 0.18s ease, transform 0.18s ease;
          color: inherit;
        }

        .pick-card:hover {
          border-color: rgba(96, 165, 250, 0.6);
          transform: translateY(-1px);
        }

        .pick-card--active {
          border-color: rgba(52, 211, 153, 0.7);
          box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.3) inset;
        }

        .priority-badge {
          font-size: 10px;
          font-weight: 700;
          border-radius: 999px;
          padding: 2px 8px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .priority-urgent {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.16);
        }

        .priority-normal {
          color: #93c5fd;
          background: rgba(59, 130, 246, 0.16);
        }

        .delivery-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
        }

        .delivery-no {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.15);
        }

        .delivery-yes {
          color: #22d3ee;
          background: rgba(34, 211, 238, 0.12);
        }

        .queue-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 7px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          color: #fde68a;
          background: rgba(245, 158, 11, 0.2);
        }

        .meta-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          align-items: center;
          font-size: 11px;
          color: var(--muted);
          margin-top: 6px;
        }

        .meta-row span {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          font-size: 13px;
        }

        .detail-label {
          color: var(--muted);
          font-size: 11px;
          margin-bottom: 2px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .section-title {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .line-card {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.02);
          padding: 8px;
        }

        .event-row {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.02);
          padding: 8px;
        }

        .recommendation {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
        }

        .recommendation-low {
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .recommendation-medium {
          background: rgba(245, 158, 11, 0.14);
          border: 1px solid rgba(245, 158, 11, 0.32);
        }

        .recommendation-high {
          background: rgba(239, 68, 68, 0.14);
          border: 1px solid rgba(239, 68, 68, 0.34);
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 1280px) {
          .board-layout {
            grid-template-columns: minmax(0, 1fr);
          }

          .columns-grid {
            grid-template-columns: repeat(2, minmax(220px, 1fr));
          }
        }

        @media (max-width: 840px) {
          .columns-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .detail-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
