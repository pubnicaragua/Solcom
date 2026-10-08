'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Copy,
  Clock3,
  Filter,
  Hand,
  PackageSearch,
  PlayCircle,
  RefreshCw,
  ScanLine,
  Smartphone,
  Timer,
  Truck,
  UserRound,
  Zap,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useUserRole } from '@/hooks/useUserRole';

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
  if (status === 'queued') return { action: 'claim', label: 'Tomar orden' };
  if (status === 'claimed') return { action: 'start', label: 'Iniciar alistamiento' };
  if (status === 'picking') return { action: 'ready', label: 'Marcar lista' };
  if (status === 'ready') return { action: 'complete', label: 'Completar entrega' };
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
  const { access: pickingAccess, loading: accessLoading } = useRoleAccess('alistamiento');
  const { loading: authLoading } = useUserRole();

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
  const [scannerLink, setScannerLink] = useState('');
  const [scannerQr, setScannerQr] = useState('');
  const [scannerLinkLoading, setScannerLinkLoading] = useState(false);

  const openScannerQr = useCallback(async (order: PickOrder) => {
    setScannerLinkLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/warehouse/picking/orders/${order.id}/scan-link`, {
        method: 'POST',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo generar el enlace del escáner.');
      const url = normalizeText(payload?.url);
      if (!url) throw new Error('El servidor no devolvió un enlace válido.');
      setScannerLink(url);
      setScannerQr(await QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#07111f', light: '#ffffff' },
      }));
    } catch (linkError: any) {
      setError(linkError?.message || 'No se pudo generar el QR del escáner.');
    } finally {
      setScannerLinkLoading(false);
    }
  }, []);

  const closeScannerQr = useCallback(() => {
    setScannerLink('');
    setScannerQr('');
  }, []);

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

  const kpiItems = [
    { label: 'En cola', value: effectiveSummary.queued, accent: 'var(--warning)', icon: <Clock3 size={18} /> },
    { label: 'En proceso', value: effectiveSummary.in_progress, accent: 'var(--info)', icon: <Activity size={18} /> },
    { label: 'Listas', value: effectiveSummary.ready, accent: 'var(--success)', icon: <CheckCircle2 size={18} /> },
    { label: 'p95 espera', value: `${p95Queue.toFixed(1)} min`, accent: 'var(--warning)', icon: <Timer size={18} /> },
    { label: 'Prom. alistamiento', value: `${avgPick.toFixed(1)} min`, accent: 'var(--info)', icon: <BarChart3 size={18} /> },
    { label: 'Throughput/h', value: throughput.toFixed(3), accent: 'var(--kpi-violet)', icon: <Zap size={18} /> },
  ];

  const columns = [
    { key: 'queued', title: 'En Cola', subtitle: 'FIFO + Urgente primero', accent: 'var(--warning)', rows: board.queued },
    { key: 'processing', title: 'En Proceso', subtitle: 'Tomadas y en alistamiento', accent: 'var(--info)', rows: board.processing },
    { key: 'ready', title: 'Listas', subtitle: 'Esperando despacho', accent: 'var(--success)', rows: board.ready },
  ];

  if (!accessLoading && !pickingAccess.can_view) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <AlertTriangle size={48} style={{ color: 'var(--brand-accent)' }} />
        <div style={{ fontSize: 18, fontWeight: 700 }}>Acceso Denegado</div>
        <p style={{ color: 'var(--muted)', textAlign: 'center', maxWidth: 400 }}>
          No tienes permisos para visualizar el módulo de Alistamiento de Bodega. 
          Contacta a un administrador para solicitar acceso.
        </p>
        <Link href="/">
          <Button variant="primary">Volver al Inicio</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="fase2-module-view alistamiento-design-page" style={{ display: 'grid', gap: 16 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="inventory-title-mark">
            <PackageSearch size={21} />
          </div>
          <div>
            <div className="h-title" style={{ fontSize: 'clamp(18px, 4vw, 24px)', lineHeight: 1.2 }}>
              Alistamiento de Bodega
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
              Cola operativa con control de toma, tiempos e insights en tiempo real
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/ventas" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="sm">Ver Ventas</Button>
          </Link>
          <Button variant={demoMode ? 'primary' : 'secondary'} size="sm" onClick={toggleDemoMode}>
            {demoMode ? 'Salir demo' : 'Cargar ejemplo'}
          </Button>
          <Button
            variant="secondary" size="sm"
            onClick={() => void loadData(false)}
            disabled={refreshing || loading || demoMode}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {/* ── Demo banner ── */}
      {demoMode && (
        <Card style={{ borderColor: 'color-mix(in srgb, var(--info) 40%, var(--border))', background: 'var(--info-surface)' }}>
          <div style={{ fontSize: 13, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>👁</span>
            Vista demo activa: estás viendo datos estáticos de ejemplo para presentar la UI de alistamiento.
          </div>
        </Card>
      )}

      {/* ── Filters Toolbar ── */}
      <div className="filters-toolbar">
        <div className="filters-toolbar-label">
          <Filter size={13} />
          <span>Filtros</span>
        </div>
        <div className="filters-sep" />
        <div className="filters-fields">
          <Select
            label="Bodega"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            options={[
              { value: '', label: 'Todas las bodegas' },
              ...warehouses.map((w) => ({
                value: w.id,
                label: w.code ? `${w.code} — ${w.name}` : w.name,
              })),
            ]}
          />
          <Select
            label="Estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
            onChange={(e) => setRange(e.target.value as '7d' | '30d')}
            options={[
              { value: '7d', label: 'Últimos 7 días' },
              { value: '30d', label: 'Últimos 30 días' },
            ]}
          />
          <Input
            label="Buscar"
            placeholder="Número OV o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filters-sep" />
        <button
          className={`mine-toggle ${mine ? 'mine-toggle--on' : ''}`}
          onClick={() => setMine((v) => !v)}
          type="button"
        >
          <UserRound size={13} />
          {mine ? 'Solo mis órdenes' : 'Ver todas'}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <Card style={{ borderColor: 'color-mix(in srgb, var(--danger) 40%, var(--border))', background: 'var(--danger-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: 'var(--text)' }}>
            <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0, color: 'var(--danger)' }} />
            <div style={{ fontSize: 13 }}>
              {error}
              <div style={{ marginTop: 5, color: 'var(--danger)', fontSize: 12 }}>
                Si el mensaje indica migración faltante, ejecuta <code>warehouse-picking-v1.sql</code> y activa <code>SALES_PICKING_FLOW_ENABLED=true</code>.
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── KPI Grid ── */}
      <div className="kpi-grid">
        {kpiItems.map((kpi) => (
          <div key={kpi.label} className="kpi-card inventory-kpi-card" style={{
            '--kpi-accent': kpi.accent,
            '--kpi-glow': `color-mix(in srgb, ${kpi.accent} 38%, transparent)`,
            borderColor: `color-mix(in srgb, ${kpi.accent} 42%, var(--border))`,
            background: `radial-gradient(ellipse at 0% 100%, color-mix(in srgb, ${kpi.accent} 24%, transparent) 0%, transparent 62%), linear-gradient(135deg, color-mix(in srgb, ${kpi.accent} 12%, var(--card)) 0%, var(--card) 56%, color-mix(in srgb, ${kpi.accent} 6%, var(--panel)) 100%)`,
            boxShadow: `0 2px 8px var(--shadow), inset 0 1px 0 color-mix(in srgb, ${kpi.accent} 16%, transparent)`,
          } as CSSProperties}>
            <div className="kpi-icon" style={{
              color: kpi.accent,
              background: `linear-gradient(135deg, color-mix(in srgb, ${kpi.accent} 24%, transparent), color-mix(in srgb, ${kpi.accent} 8%, transparent))`,
              border: `1px solid color-mix(in srgb, ${kpi.accent} 78%, transparent)`,
              boxShadow: `inset 0 0 12px color-mix(in srgb, ${kpi.accent} 12%, transparent), 0 0 16px color-mix(in srgb, ${kpi.accent} 16%, transparent)`,
            }}>
              {kpi.icon}
            </div>
            <div>
              <div className="kpi-label" style={{ color: kpi.accent }}>{kpi.label}</div>
              <div className="kpi-value" style={{ color: kpi.accent }}>{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Board + Detail Panel ── */}
      <div className="board-layout">

        {/* Kanban Board */}
        <div className="board-wrap">
          {loading ? (
            <div className="board-loading">
              <RefreshCw size={26} className="spin" style={{ opacity: 0.3 }} />
              <span>Cargando tablero de alistamiento...</span>
            </div>
          ) : (
            <div className="columns-grid">
              {columns.map((col) => (
                <div key={col.key} className="column-block" style={{ borderTopColor: col.accent }}>
                  <div className="column-header">
                    <div>
                      <div className="column-title">{col.title}</div>
                      <div className="column-subtitle">{col.subtitle}</div>
                    </div>
                    <span
                      className="column-count"
                      style={{
                        color: col.accent,
                        background: `color-mix(in srgb, ${col.accent} 15%, var(--card))`,
                        border: `1px solid color-mix(in srgb, ${col.accent} 42%, var(--border))`,
                      }}
                    >
                      {col.rows.length}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {col.rows.length === 0 ? (
                      <div className="empty-col">
                        <PackageSearch size={22} style={{ opacity: 0.25, margin: '0 auto 6px' }} />
                        Sin órdenes en este estado
                      </div>
                    ) : (
                      col.rows.map((order) => {
                        const action = actionForStatus(order.status);
                        const actionKey = action ? `${order.id}:${action.action}` : null;
                        const isActive = selectedOrderId === order.id;

                        return (
                          <button
                            key={order.id}
                            className={`pick-card${isActive ? ' pick-card--active' : ''}${order.priority === 'urgent' ? ' pick-card--urgent' : ''}`}
                            onClick={() => setSelectedOrderId(order.id)}
                            type="button"
                          >
                            {/* Row 1: OV number + priority badge */}
                            <div className="pc-top">
                              <span className="pc-order-num">
                                {order.sales_order_number || order.sales_order_id.slice(0, 8)}
                              </span>
                              <span className={`pri-badge ${order.priority === 'urgent' ? 'pri-urgent' : 'pri-normal'}`}>
                                {order.priority === 'urgent' && <AlertTriangle size={9} />}
                                {order.priority === 'urgent' ? 'Urgente' : 'Normal'}
                              </span>
                            </div>

                            {/* Row 2: Customer name */}
                            <div className="pc-customer">
                              {order.customer?.name || 'Cliente no disponible'}
                            </div>

                            {/* Row 3 & 4: Meta grid */}
                            <div className="pc-meta">
                              <span className="pc-meta-item">
                                <Clock3 size={11} />
                                {ageLabel(order.queued_at)}
                              </span>
                              <span className="pc-meta-item pc-amount">
                                {formatCurrency(order.sales_order_total || 0)}
                              </span>
                              <span className="pc-meta-item">
                                <UserRound size={11} />
                                {order.salesperson_name || 'Sin vendedor'}
                              </span>
                              <span className="pc-meta-item pc-status-lbl">
                                {statusLabel(order.status)}
                              </span>
                            </div>

                            {/* Row 5: Badges */}
                            <div className="pc-badges">
                              <span className={`dlv-badge ${order.delivery_requested ? 'dlv-yes' : 'dlv-no'}`}>
                                {order.delivery_requested ? <Truck size={10} /> : <PackageSearch size={10} />}
                                {order.delivery_requested ? 'Delivery' : 'En piso'}
                              </span>
                              {order.status === 'queued' && Number(order.queue_position || 0) > 0 && (
                                <span className="q-pos-badge">#{order.queue_position} en cola</span>
                              )}
                            </div>

                            {/* CTA */}
                            {action && (
                              <button
                                className={`pick-cta pick-cta--${action.action}`}
                                onClick={(e) => { e.stopPropagation(); void runAction(order, action.action); }}
                                disabled={demoMode || actionLoading === actionKey || !pickingAccess.can_edit}
                                type="button"
                              >
                                {actionLoading === actionKey
                                  ? <RefreshCw size={13} className="spin" />
                                  : actionIcon(action.action)}
                                {action.label}
                              </button>
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
        </div>

        {/* Detail Panel */}
        <Card style={{ padding: 16 }}>
          {!selectedOrder ? (
            <div className="detail-empty">
              <PackageSearch size={40} style={{ opacity: 0.15, marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                Ninguna orden seleccionada
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', opacity: 0.7, textAlign: 'center', lineHeight: 1.6 }}>
                Haz clic en cualquier tarjeta del tablero para ver el detalle completo y el historial de eventos.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>

              {/* Detail header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.01em' }}>
                    {selectedOrder.sales_order_number || selectedOrder.sales_order_id}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
                    {selectedOrder.customer?.name || 'Cliente no disponible'}
                  </div>
                </div>
                <span className={`pri-badge ${selectedOrder.priority === 'urgent' ? 'pri-urgent' : 'pri-normal'}`} style={{ marginTop: 4 }}>
                  {selectedOrder.priority === 'urgent' && <AlertTriangle size={10} />}
                  {selectedOrder.priority === 'urgent' ? 'Urgente' : 'Normal'}
                </span>
              </div>

              {['claimed', 'picking'].includes(selectedOrder.status) && (
                <button
                  type="button"
                  className="pick-cta pick-cta--start"
                  onClick={() => void openScannerQr(selectedOrder)}
                  disabled={demoMode || !pickingAccess.can_edit || scannerLinkLoading}
                  style={{ justifyContent: 'center', width: '100%' }}
                >
                  {scannerLinkLoading ? <RefreshCw size={15} className="spin" /> : <ScanLine size={15} />}
                  Mostrar QR para escáner móvil
                </button>
              )}

              {/* Detail fields */}
              <div className="detail-grid">
                {[
                  { label: 'Estado', value: statusLabel(selectedOrder.status) },
                  { label: 'Bodega', value: selectedOrder.warehouse?.code || selectedOrder.warehouse?.name || '—' },
                  { label: 'Vendedor', value: selectedOrder.salesperson_name || '—' },
                  { label: 'Asignado a', value: selectedOrder.assigned_user?.full_name || selectedOrder.assigned_user?.email || 'Sin asignar' },
                  { label: 'Total OV', value: formatCurrency(selectedOrder.sales_order_total || 0) },
                  { label: 'Espera promedio', value: `${avgQueue.toFixed(1)} min` },
                  { label: 'En cola desde', value: formatDateTime(selectedOrder.queued_at) },
                  { label: 'Lista desde', value: formatDateTime(selectedOrder.ready_at) },
                ].map(({ label, value }) => (
                  <div key={label} className="detail-field">
                    <div className="detail-lbl">{label}</div>
                    <div className="detail-val">{value}</div>
                  </div>
                ))}
              </div>

              {/* Items */}
              <div>
                <div className="section-title">Líneas de alistamiento</div>
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {selectedOrder.items.length === 0 ? (
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>No hay snapshot de líneas.</div>
                  ) : selectedOrder.items.map((item) => (
                    <div key={item.id} className="line-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4 }}>{item.description || 'Artículo'}</div>
                        <span className="qty-badge">×{normalizeNumber(item.quantity, 0)}</span>
                      </div>
                      {item.serials_required && (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', display: 'grid', gap: 2 }}>
                          <div>Solicitados: <span style={{ color: 'var(--info)' }}>{splitSerials(item.serial_numbers_requested).join(', ') || '—'}</span></div>
                          <div>Seleccionados: <span style={{ color: 'var(--success)' }}>{splitSerials(item.serial_numbers_selected).join(', ') || '—'}</span></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Events */}
              <div>
                <div className="section-title">Historial de eventos</div>
                <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                  {(selectedOrder.events || []).length === 0 ? (
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>Sin eventos registrados.</div>
                  ) : (selectedOrder.events || []).slice(0, 12).map((ev) => (
                    <div key={ev.id} className="event-row">
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{ev.event_type}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {ev.from_status || '—'} → {ev.to_status || '—'} · {formatDateTime(ev.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Recommendations ── */}
      {(effectiveInsights?.recommendations || []).length > 0 && (
        <Card>
          <div className="section-title" style={{ marginBottom: 10 }}>Recomendaciones operativas</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {(effectiveInsights?.recommendations || []).map((rec) => (
              <div key={rec.code} className={`recom recom--${rec.severity}`}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{rec.message}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {scannerLink && (
        <div className="scanner-qr-backdrop" role="presentation" onClick={closeScannerQr}>
          <div className="scanner-qr-modal" role="dialog" aria-modal="true" aria-label="Código QR para escáner móvil" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="scanner-qr-close" onClick={closeScannerQr} aria-label="Cerrar">×</button>
            <div className="scanner-qr-icon"><Smartphone size={23} /></div>
            <div>
              <div className="scanner-qr-title">Escanear desde el celular</div>
              <div className="scanner-qr-subtitle">
                Abre la cámara del celular y apunta a este QR. El teléfono abrirá el escáner de IMEI para esta orden.
              </div>
            </div>
            {scannerQr && <img className="scanner-qr-image" src={scannerQr} alt="Código QR para abrir el escáner móvil" />}
            <div className="scanner-qr-url">{scannerLink}</div>
            {scannerLink.includes('localhost') && (
              <div className="scanner-qr-warning">
                Este enlace usa localhost y no abrirá desde otro dispositivo. Para probar desde el celular usa el dominio desplegado en Vercel.
              </div>
            )}
            {(scannerLink.includes('192.168.') || scannerLink.includes('10.') || scannerLink.includes('172.16.') || scannerLink.includes('172.17.') || scannerLink.includes('172.18.') || scannerLink.includes('172.19.') || scannerLink.includes('172.2')) && (
              <div className="scanner-qr-warning">
                Este enlace usa la IP local. El celular debe estar conectado a la misma red Wi-Fi que esta computadora.
              </div>
            )}
            <div className="scanner-qr-actions">
              <button type="button" className="scanner-qr-secondary" onClick={() => void navigator.clipboard.writeText(scannerLink)}>
                <Copy size={16} /> Copiar enlace
              </button>
              <button type="button" className="scanner-qr-primary" onClick={() => window.open(scannerLink, '_blank', 'noopener,noreferrer')}>
                <ScanLine size={16} /> Abrir aquí
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .scanner-qr-backdrop { position: fixed; inset: 0; z-index: 1000; background: var(--overlay); backdrop-filter: blur(8px); display: grid; place-items: center; padding: 20px; }
        .scanner-qr-modal { width: min(100%,430px); position: relative; display: grid; justify-items: center; gap: 15px; padding: 28px; border-radius: 22px; background: var(--panel-elevated); border: 1px solid var(--border); box-shadow: 0 30px 90px var(--shadow); text-align: center; }
        .scanner-qr-close { position: absolute; top: 12px; right: 14px; width: 34px; height: 34px; border: 0; border-radius: 50%; background: var(--surface-hover); color: var(--text-secondary); font-size: 23px; cursor: pointer; }
        .scanner-qr-icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 15px; color: var(--info); background: var(--info-surface); border: 1px solid color-mix(in srgb, var(--info) 38%, var(--border)); }
        .scanner-qr-title { color: var(--text); font-size: 20px; font-weight: 800; }
        .scanner-qr-subtitle { margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.6; }
        .scanner-qr-image { width: min(100%,290px); aspect-ratio: 1; border-radius: 16px; background: white; padding: 8px; }
        .scanner-qr-url { width: 100%; padding: 10px 12px; overflow-wrap: anywhere; border-radius: 10px; background: var(--surface-hover); color: var(--muted); font-size: 10px; }
        .scanner-qr-warning { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--warning); background: var(--warning-surface); color: var(--warning); font-size: 11px; line-height: 1.5; }
        .scanner-qr-actions { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .scanner-qr-actions button { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 11px 12px; border-radius: 11px; font-weight: 700; cursor: pointer; }
        .scanner-qr-secondary { border: 1px solid var(--border); background: var(--surface-hover); color: var(--text-secondary); }
        .scanner-qr-primary { border: 1px solid color-mix(in srgb, var(--info) 65%, var(--border)); background: var(--info); color: var(--background); }

        /* ════════════════════════════════
           FILTERS TOOLBAR
        ════════════════════════════════ */
        .filters-toolbar {
          display: flex;
          align-items: flex-end;
          gap: 0;
          background: var(--card-surface-gradient);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 14px 18px;
          box-shadow: 0 3px 12px var(--shadow), inset 0 1px 0 color-mix(in srgb, #ffffff 4%, transparent);
          flex-wrap: wrap;
          gap: 0;
        }

        .filters-toolbar-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
          white-space: nowrap;
          padding-right: 0;
          align-self: flex-end;
          padding-bottom: 6px;
        }

        .filters-sep {
          width: 1px;
          height: 40px;
          background: var(--border);
          margin: 0 16px;
          flex-shrink: 0;
          align-self: flex-end;
        }

        .filters-fields {
          display: flex;
          gap: 10px;
          flex: 1;
          flex-wrap: wrap;
          align-items: flex-end;
          min-width: 0;
        }

        .filters-fields > * {
          flex: 1;
          min-width: 150px;
        }

        .mine-toggle {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 16px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--muted);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s ease;
          white-space: nowrap;
          align-self: flex-end;
        }

        .mine-toggle:hover {
          border-color: color-mix(in srgb, var(--info) 58%, var(--border));
          color: var(--info);
          background: var(--info-surface);
        }

        .mine-toggle--on {
          border-color: color-mix(in srgb, var(--success) 55%, var(--border));
          background: var(--success-surface);
          color: var(--success);
        }

        .mine-toggle--on:hover {
          border-color: color-mix(in srgb, var(--success) 75%, var(--border));
          background: color-mix(in srgb, var(--success) 16%, var(--card));
          color: var(--success);
        }

        /* ════════════════════════════════
           KPI GRID
        ════════════════════════════════ */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
          gap: 10px;
        }

        .kpi-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border: 1px solid;
          border-radius: 14px;
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
          cursor: default;
        }

        .kpi-icon {
          width: 46px;
          height: 46px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .kpi-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 5px;
        }

        .kpi-value {
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.01em;
        }

        /* ════════════════════════════════
           BOARD LAYOUT
        ════════════════════════════════ */
        .board-layout {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
          gap: 12px;
          align-items: start;
        }

        .board-wrap {
          background: var(--card-surface-gradient);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 14px;
          overflow-x: auto;
          box-shadow: 0 3px 12px var(--shadow), inset 0 1px 0 color-mix(in srgb, #ffffff 4%, transparent);
        }

        .board-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 56px 24px;
          color: var(--muted);
          font-size: 14px;
        }

        /* ════════════════════════════════
           KANBAN COLUMNS
        ════════════════════════════════ */
        .columns-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(220px, 1fr));
          gap: 10px;
          min-width: 0;
        }

        .column-block {
          border: 1px solid var(--border);
          border-top: 3px solid;
          border-radius: 14px;
          padding: 12px;
          background: var(--control-surface-gradient);
          box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 4%, transparent);
        }

        .column-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 12px;
          padding: 10px 11px;
          border: 1px solid var(--table-header-rule);
          border-radius: 10px;
          background: var(--table-header-bg);
        }

        .column-title {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        .column-subtitle {
          font-size: 10px;
          color: var(--muted);
          margin-top: 2px;
          letter-spacing: 0.02em;
        }

        .column-count {
          font-size: 13px;
          font-weight: 800;
          padding: 2px 10px;
          border-radius: 999px;
          line-height: 1.5;
          flex-shrink: 0;
        }

        /* ════════════════════════════════
           EMPTY STATE
        ════════════════════════════════ */
        .empty-col {
          border: 1px dashed var(--border);
          border-radius: 12px;
          padding: 24px 12px;
          font-size: 12px;
          color: var(--muted);
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1.5;
        }

        /* ════════════════════════════════
           PICK CARDS
        ════════════════════════════════ */
        .pick-card {
          border: 1px solid var(--border);
          border-radius: 13px;
          background: var(--card-surface-gradient);
          padding: 12px;
          width: 100%;
          text-align: left;
          cursor: pointer;
          transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
          color: inherit;
          display: block;
        }

        .pick-card:hover {
          border-color: color-mix(in srgb, var(--info) 50%, var(--border));
          transform: translateY(-2px);
          box-shadow: 0 6px 18px var(--shadow);
        }

        .pick-card--active {
          border-color: color-mix(in srgb, var(--success) 60%, var(--border)) !important;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--success) 18%, transparent), 0 6px 18px color-mix(in srgb, var(--success) 12%, transparent) !important;
        }

        .pick-card--urgent {
          border-left: 3px solid color-mix(in srgb, var(--warning) 72%, var(--border));
        }

        .pc-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 5px;
        }

        .pc-order-num {
          font-weight: 800;
          font-size: 14px;
          letter-spacing: 0.01em;
        }

        .pc-customer {
          font-size: 13px;
          font-weight: 500;
          color: var(--text);
          margin-bottom: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pc-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 8px;
          margin-bottom: 8px;
        }

        .pc-meta-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--muted);
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pc-amount {
          color: var(--info);
          font-weight: 600;
          justify-content: flex-end;
        }

        .pc-status-lbl {
          font-size: 10px;
          font-weight: 600;
          justify-content: flex-end;
          opacity: 0.75;
        }

        .pc-badges {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        /* ════════════════════════════════
           PRIORITY BADGES
        ════════════════════════════════ */
        .pri-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 700;
          border-radius: 999px;
          padding: 2px 9px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }

        .pri-urgent {
          color: var(--warning);
          background: var(--warning-surface);
          border: 1px solid color-mix(in srgb, var(--warning) 38%, var(--border));
        }

        .pri-normal {
          color: var(--info);
          background: var(--info-surface);
          border: 1px solid color-mix(in srgb, var(--info) 30%, var(--border));
        }

        /* ════════════════════════════════
           DELIVERY & QUEUE BADGES
        ════════════════════════════════ */
        .dlv-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
        }

        .dlv-no {
          color: var(--warning);
          background: var(--warning-surface);
          border: 1px solid color-mix(in srgb, var(--warning) 30%, var(--border));
        }

        .dlv-yes {
          color: var(--success);
          background: var(--success-surface);
          border: 1px solid color-mix(in srgb, var(--success) 30%, var(--border));
        }

        .q-pos-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          color: var(--warning);
          background: var(--warning-surface);
          border: 1px solid color-mix(in srgb, var(--warning) 34%, var(--border));
        }

        /* ════════════════════════════════
           CTA BUTTON (full-width inside card)
        ════════════════════════════════ */
        .pick-cta {
          width: 100%;
          margin-top: 10px;
          padding: 9px 12px;
          border-radius: 10px;
          border: 1px solid transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          transition: all 0.18s ease;
          text-transform: uppercase;
        }

        .pick-cta:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none !important;
        }

        .pick-cta--claim {
          background: var(--info-surface);
          border-color: color-mix(in srgb, var(--info) 40%, var(--border));
          color: var(--info);
        }
        .pick-cta--claim:hover:not(:disabled) {
          background: color-mix(in srgb, var(--info) 18%, var(--card));
          border-color: color-mix(in srgb, var(--info) 58%, var(--border));
          color: var(--info);
          transform: translateY(-1px);
        }

        .pick-cta--start {
          background: var(--warning-surface);
          border-color: color-mix(in srgb, var(--warning) 40%, var(--border));
          color: var(--warning);
        }
        .pick-cta--start:hover:not(:disabled) {
          background: color-mix(in srgb, var(--warning) 18%, var(--card));
          border-color: color-mix(in srgb, var(--warning) 58%, var(--border));
          color: var(--warning);
          transform: translateY(-1px);
        }

        .pick-cta--ready {
          background: var(--success-surface);
          border-color: color-mix(in srgb, var(--success) 40%, var(--border));
          color: var(--success);
        }
        .pick-cta--ready:hover:not(:disabled) {
          background: color-mix(in srgb, var(--success) 18%, var(--card));
          border-color: color-mix(in srgb, var(--success) 58%, var(--border));
          color: var(--success);
          transform: translateY(-1px);
        }

        .pick-cta--complete {
          background: var(--success-surface);
          border-color: color-mix(in srgb, var(--success) 40%, var(--border));
          color: var(--success);
        }
        .pick-cta--complete:hover:not(:disabled) {
          background: color-mix(in srgb, var(--success) 18%, var(--card));
          border-color: color-mix(in srgb, var(--success) 58%, var(--border));
          color: var(--success);
          transform: translateY(-1px);
        }

        /* ════════════════════════════════
           DETAIL PANEL
        ════════════════════════════════ */
        .detail-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 36px 20px;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0,1fr));
          gap: 8px;
        }

        .detail-field {
          background: var(--surface-hover);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 9px 11px;
        }

        .detail-lbl {
          color: var(--muted);
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }

        .detail-val {
          font-size: 13px;
          font-weight: 500;
          line-height: 1.4;
        }

        /* ════════════════════════════════
           SECTION TITLE
        ════════════════════════════════ */
        .section-title {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .section-title::before {
          content: '';
          display: block;
          width: 3px;
          height: 13px;
          border-radius: 2px;
          background: var(--brand-primary);
          flex-shrink: 0;
        }

        /* ════════════════════════════════
           LINE CARD & QUANTITY BADGE
        ════════════════════════════════ */
        .line-card {
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface-hover);
          padding: 10px;
        }

        .qty-badge {
          font-size: 11px;
          font-weight: 700;
          color: var(--info);
          background: var(--info-surface);
          border: 1px solid color-mix(in srgb, var(--info) 30%, var(--border));
          border-radius: 999px;
          padding: 2px 9px;
          white-space: nowrap;
          flex-shrink: 0;
          line-height: 1.6;
        }

        /* ════════════════════════════════
           EVENT ROW
        ════════════════════════════════ */
        .event-row {
          border-left: 2px solid var(--border);
          padding: 6px 10px;
          border-radius: 0 8px 8px 0;
          background: var(--surface-hover);
        }

        /* ════════════════════════════════
           RECOMMENDATIONS
        ════════════════════════════════ */
        .recom {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          line-height: 1.5;
        }

        .recom--low {
          background: var(--info-surface);
          border: 1px solid color-mix(in srgb, var(--info) 30%, var(--border));
          color: var(--info);
        }

        .recom--medium {
          background: var(--warning-surface);
          border: 1px solid color-mix(in srgb, var(--warning) 32%, var(--border));
          color: var(--warning);
        }

        .recom--high {
          background: var(--danger-surface);
          border: 1px solid color-mix(in srgb, var(--danger) 32%, var(--border));
          color: var(--danger);
        }

        /* ════════════════════════════════
           SPINNER
        ════════════════════════════════ */
        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* ════════════════════════════════
           RESPONSIVE
        ════════════════════════════════ */
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
          .filters-toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .filters-sep {
            width: 100%;
            height: 1px;
            margin: 8px 0;
          }
          .filters-fields {
            flex-direction: column;
          }
          .filters-fields > * {
            min-width: unset;
            flex: none;
          }
          .mine-toggle {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
