'use client';

import { useEffect, useState } from 'react';
import {
    ClipboardList, Search, RefreshCw, Eye, Trash2,
    CheckCircle, ArrowRightLeft, Pencil,
    ChevronLeft, ChevronRight, Calendar, Loader2,
} from 'lucide-react';
import SalesOrderPreview from './SalesOrderPreview';
import SalesOrderForm from './SalesOrderForm';

type OrderStatus = 'borrador' | 'confirmada' | 'convertida' | 'cancelada';

interface SalesOrder {
    id: string;
    order_number: string;
    customer_id: string | null;
    customer: { id: string; name: string; email: string | null; phone: string | null; ruc: string | null } | null;
    date: string;
    expected_delivery_date: string | null;
    status: OrderStatus;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    discount_amount: number;
    total: number;
    notes: string | null;
    salesperson_name: string | null;
    converted_invoice_id: string | null;
    zoho_salesorder_id: string | null;
    created_at: string;
}

const STATUS_TABS: Array<{ key: 'todas' | OrderStatus; label: string }> = [
    { key: 'todas', label: 'Todas' },
    { key: 'borrador', label: 'Borrador' },
    { key: 'confirmada', label: 'Confirmadas' },
    { key: 'convertida', label: 'Convertidas' },
    { key: 'cancelada', label: 'Canceladas' },
];

const statusConfig: Record<OrderStatus, { bg: string; text: string; label: string }> = {
    borrador: { bg: 'rgba(107,114,128,0.15)', text: '#9CA3AF', label: 'Borrador' },
    confirmada: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA', label: 'Confirmada' },
    convertida: { bg: 'rgba(168,85,247,0.18)', text: '#C084FC', label: 'Convertida' },
    cancelada: { bg: 'rgba(239,68,68,0.15)', text: '#F87171', label: 'Cancelada' },
};

interface SalesOrderListProps {
    onStartInvoiceFromOrder?: (orderId: string) => Promise<void> | void;
    openEditOrderId?: string | null;
    onOpenEditOrderHandled?: () => void;
}

export default function SalesOrderList({
    onStartInvoiceFromOrder,
    openEditOrderId = null,
    onOpenEditOrderHandled,
}: SalesOrderListProps) {
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'todas' | OrderStatus>('todas');
    const [searchTerm, setSearchTerm] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const [kpis, setKpis] = useState({
        totalOV: 0,
        confirmadas: 0,
        pendientes: 0,
        convertidas: 0,
    });

    const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);
    const [editOrderId, setEditOrderId] = useState<string | null>(null);

    useEffect(() => {
        void fetchOrders();
    }, [activeTab, searchTerm, fromDate, toDate, page]);

    useEffect(() => {
        void fetchKPIs();
    }, []);

    useEffect(() => {
        const forcedOrderId = String(openEditOrderId || '').trim();
        if (!forcedOrderId) return;
        setEditOrderId(forcedOrderId);
        onOpenEditOrderHandled?.();
    }, [openEditOrderId, onOpenEditOrderHandled]);

    async function fetchOrders() {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (activeTab !== 'todas') params.set('status', activeTab);
            if (searchTerm.trim()) params.set('search', searchTerm.trim());
            if (fromDate) params.set('from_date', fromDate);
            if (toDate) params.set('to_date', toDate);
            params.set('page', String(page));
            params.set('per_page', '20');

            const res = await fetch(`/api/ventas/sales-orders?${params.toString()}`, { cache: 'no-store' });
            const data = await res.json();

            if (!res.ok) throw new Error(data?.error || 'Error al cargar órdenes');

            setOrders(data.orders || []);
            setTotalCount(data.total || 0);
            setTotalPages(data.total_pages || 1);
        } catch (err: any) {
            setError(err?.message || 'Error al cargar órdenes de venta');
        } finally {
            setLoading(false);
        }
    }

    async function fetchKPIs() {
        try {
            const res = await fetch('/api/ventas/sales-orders?per_page=1', { cache: 'no-store' });
            const data = await res.json();

            // Fetch all statuses for KPI counts
            const [borradorRes, confirmadaRes, convertidaRes] = await Promise.all([
                fetch('/api/ventas/sales-orders?status=borrador&per_page=1', { cache: 'no-store' }),
                fetch('/api/ventas/sales-orders?status=confirmada&per_page=1', { cache: 'no-store' }),
                fetch('/api/ventas/sales-orders?status=convertida&per_page=1', { cache: 'no-store' }),
            ]);

            const [borradorData, confirmadaData, convertidaData] = await Promise.all([
                borradorRes.json(),
                confirmadaRes.json(),
                convertidaRes.json(),
            ]);

            setKpis({
                totalOV: data.total || 0,
                confirmadas: confirmadaData.total || 0,
                pendientes: borradorData.total || 0,
                convertidas: convertidaData.total || 0,
            });
        } catch {
            // KPIs are secondary
        }
    }

    async function handleConfirm(orderId: string) {
        setActionLoading(orderId);
        try {
            const res = await fetch(`/api/ventas/sales-orders/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'confirmada' }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data?.error || 'Error al confirmar');
            }
            await fetchOrders();
            await fetchKPIs();
        } catch (err: any) {
            setError(err?.message || 'Error al confirmar orden');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleConvert(orderId: string) {
        setActionLoading(orderId);
        try {
            if (onStartInvoiceFromOrder) {
                await onStartInvoiceFromOrder(orderId);
                return;
            }
            const res = await fetch(`/api/ventas/sales-orders/${orderId}/convert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data?.error || 'Error al convertir');
            }
            await fetchOrders();
            await fetchKPIs();
        } catch (err: any) {
            setError(err?.message || 'Error al preparar factura desde la orden');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleDelete(orderId: string) {
        if (!confirm('¿Eliminar esta orden de venta?')) return;
        setActionLoading(orderId);
        try {
            const res = await fetch(`/api/ventas/sales-orders/${orderId}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data?.error || 'Error al eliminar');
            }
            await fetchOrders();
            await fetchKPIs();
        } catch (err: any) {
            setError(err?.message || 'Error al eliminar orden');
        } finally {
            setActionLoading(null);
        }
    }

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('es-NI', {
            style: 'currency',
            currency: 'NIO',
            minimumFractionDigits: 2,
        }).format(amount);

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-NI', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        } catch {
            return dateStr;
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {[
                    { label: 'Total OV', value: kpis.totalOV, color: '#A78BFA', bg: 'rgba(139,92,246,0.12)' },
                    { label: 'Confirmadas', value: kpis.confirmadas, color: '#60A5FA', bg: 'rgba(59,130,246,0.12)' },
                    { label: 'Pendientes', value: kpis.pendientes, color: '#FBBF24', bg: 'rgba(245,158,11,0.12)' },
                    { label: 'Convertidas', value: kpis.convertidas, color: '#C084FC', bg: 'rgba(168,85,247,0.12)' },
                ].map((kpi) => (
                    <div
                        key={kpi.label}
                        style={{
                            padding: '16px 18px',
                            borderRadius: 12,
                            background: kpi.bg,
                            border: `1px solid ${kpi.color}33`,
                        }}
                    >
                        <div style={{ fontSize: 12, fontWeight: 600, color: kpi.color, marginBottom: 4 }}>
                            {kpi.label}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text, #e2e8f0)' }}>
                            {kpi.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
            }}>
                <div style={{ position: 'relative', flex: '1 1 200px' }}>
                    <Search size={14} style={{
                        position: 'absolute',
                        left: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--muted)',
                        pointerEvents: 'none',
                    }} />
                    <input
                        type="text"
                        placeholder="Buscar por número o notas..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                        style={{
                            width: '100%',
                            padding: '8px 10px 8px 32px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.04)',
                            color: 'var(--text)',
                            fontSize: 13,
                            outline: 'none',
                        }}
                    />
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Calendar size={13} style={{ color: 'var(--muted)' }} />
                    <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                        style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--text)', fontSize: 12 }}
                    />
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                    <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                        style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--text)', fontSize: 12 }}
                    />
                </div>
                <button
                    onClick={() => { fetchOrders(); fetchKPIs(); }}
                    style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                    }}
                >
                    <RefreshCw size={13} />
                    Refrescar
                </button>
            </div>

            {/* Status Tabs */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {STATUS_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => { setActiveTab(tab.key); setPage(1); }}
                        style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: `1px solid ${activeTab === tab.key ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                            background: activeTab === tab.key ? 'rgba(139,92,246,0.15)' : 'transparent',
                            color: activeTab === tab.key ? '#A78BFA' : 'var(--muted)',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Error */}
            {error && (
                <div style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(239,68,68,0.4)',
                    background: 'rgba(127,29,29,0.3)',
                    color: '#FCA5A5',
                    fontSize: 13,
                }}>
                    {error}
                    <button onClick={() => setError('')} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#FCA5A5', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>
                        Cerrar
                    </button>
                </div>
            )}

            {/* Table */}
            <div style={{
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.06)',
                overflow: 'hidden',
            }}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
                        Cargando órdenes...
                    </div>
                ) : orders.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                        <ClipboardList size={32} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
                        <div style={{ fontSize: 14, fontWeight: 600 }}>Sin órdenes de venta</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Crea una orden desde el carrito de inventario.</div>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    {['#', 'Fecha', 'Cliente', 'Estado', 'Total', 'Acciones'].map((h) => (
                                        <th key={h} style={{
                                            padding: '10px 14px',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: 'var(--muted)',
                                            textAlign: 'left',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                        }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order) => {
                                    const sc = statusConfig[order.status as OrderStatus] || statusConfig.borrador;
                                    const isLoading = actionLoading === order.id;
                                    return (
                                        <tr key={order.id} style={{
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            transition: 'background 0.1s',
                                        }}
                                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                                    {order.order_number}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                                    {formatDate(order.date)}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                                                    {order.customer?.name || '—'}
                                                </div>
                                                {order.customer?.ruc && (
                                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{order.customer.ruc}</div>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '3px 10px',
                                                    borderRadius: 6,
                                                    background: sc.bg,
                                                    color: sc.text,
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                }}>
                                                    {sc.label}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                                    {formatCurrency(order.total)}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                    <button
                                                        onClick={() => setPreviewOrderId(order.id)}
                                                        title="Ver detalle"
                                                        style={{
                                                            padding: '5px 8px',
                                                            borderRadius: 6,
                                                            border: '1px solid rgba(255,255,255,0.08)',
                                                            background: 'rgba(255,255,255,0.04)',
                                                            color: 'var(--muted)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 3,
                                                            fontSize: 11,
                                                        }}
                                                    >
                                                        <Eye size={12} />
                                                    </button>

                                                    {order.status === 'borrador' && (
                                                        <button
                                                            onClick={() => handleConfirm(order.id)}
                                                            disabled={isLoading}
                                                            title="Confirmar"
                                                            style={{
                                                                padding: '5px 8px',
                                                                borderRadius: 6,
                                                                border: '1px solid rgba(59,130,246,0.3)',
                                                                background: 'rgba(59,130,246,0.1)',
                                                                color: '#60A5FA',
                                                                cursor: isLoading ? 'wait' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 3,
                                                                fontSize: 11,
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {isLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={12} />}
                                                            Confirmar
                                                        </button>
                                                    )}

                                                    {order.status === 'confirmada' && (
                                                        <button
                                                            onClick={() => handleConvert(order.id)}
                                                            disabled={isLoading}
                                                            title="Preparar factura"
                                                            style={{
                                                                padding: '5px 8px',
                                                                borderRadius: 6,
                                                                border: '1px solid rgba(168,85,247,0.3)',
                                                                background: 'rgba(168,85,247,0.1)',
                                                                color: '#C084FC',
                                                                cursor: isLoading ? 'wait' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 3,
                                                                fontSize: 11,
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {isLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRightLeft size={12} />}
                                                            A Factura
                                                        </button>
                                                    )}

                                                    {(order.status === 'borrador' || order.status === 'confirmada') && (
                                                        <button
                                                            onClick={() => setEditOrderId(order.id)}
                                                            disabled={isLoading}
                                                            title="Editar"
                                                            style={{
                                                                padding: '5px 8px',
                                                                borderRadius: 6,
                                                                border: '1px solid rgba(245,158,11,0.3)',
                                                                background: 'rgba(245,158,11,0.1)',
                                                                color: '#FBBF24',
                                                                cursor: isLoading ? 'wait' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 3,
                                                                fontSize: 11,
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            <Pencil size={12} />
                                                            Editar
                                                        </button>
                                                    )}

                                                    {(order.status === 'borrador' || order.status === 'confirmada') && (
                                                        <button
                                                            onClick={() => handleDelete(order.id)}
                                                            disabled={isLoading}
                                                            title="Eliminar"
                                                            style={{
                                                                padding: '5px 8px',
                                                                borderRadius: 6,
                                                                border: '1px solid rgba(239,68,68,0.2)',
                                                                background: 'rgba(239,68,68,0.08)',
                                                                color: '#F87171',
                                                                cursor: isLoading ? 'wait' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                fontSize: 11,
                                                            }}
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {totalCount} orden{totalCount !== 1 ? 'es' : ''} total
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page <= 1}
                            style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.04)',
                                color: page <= 1 ? 'rgba(255,255,255,0.2)' : 'var(--text)',
                                cursor: page <= 1 ? 'default' : 'pointer',
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(Math.min(totalPages, page + 1))}
                            disabled={page >= totalPages}
                            style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.04)',
                                color: page >= totalPages ? 'rgba(255,255,255,0.2)' : 'var(--text)',
                                cursor: page >= totalPages ? 'default' : 'pointer',
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            <SalesOrderPreview
                isOpen={!!previewOrderId}
                orderId={previewOrderId}
                onClose={() => setPreviewOrderId(null)}
                onConvert={(id) => {
                    setPreviewOrderId(null);
                    void handleConvert(id);
                }}
                onEdit={(id) => {
                    setPreviewOrderId(null);
                    setEditOrderId(id);
                }}
                onStatusChange={() => {
                    void fetchOrders();
                    void fetchKPIs();
                }}
            />

            <SalesOrderForm
                isOpen={!!editOrderId}
                orderId={editOrderId}
                onClose={() => setEditOrderId(null)}
                onSaved={() => {
                    void fetchOrders();
                    void fetchKPIs();
                }}
            />
        </div>
    );
}
