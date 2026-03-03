'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    X, Loader2, User, Mail, Phone, Hash, Calendar,
    Warehouse, CheckCircle, XCircle, ArrowRightLeft, Pencil,
} from 'lucide-react';

type OrderStatus = 'borrador' | 'confirmada' | 'convertida' | 'cancelada';

interface SalesOrderItem {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    discount_percent: number;
    subtotal: number;
}

interface SalesOrderDetail {
    id: string;
    order_number: string;
    reference_number: string | null;
    payment_terms: string | null;
    delivery_method: string | null;
    shipping_zone: string | null;
    salesperson_id: string | null;
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
    zoho_salesorder_id: string | null;
    converted_invoice_id: string | null;
    customer: { name: string; email: string | null; phone: string | null; ruc: string | null; address?: string | null } | null;
    warehouse: { code: string; name: string } | null;
    items: SalesOrderItem[];
}

interface SalesOrderPreviewProps {
    isOpen: boolean;
    orderId: string | null;
    onClose: () => void;
    onConvert: (orderId: string) => void | Promise<void>;
    onEdit?: (orderId: string) => void;
    onStatusChange?: () => void;
}

const statusStyles: Record<OrderStatus, { label: string; text: string; bg: string }> = {
    borrador: { label: 'Borrador', text: '#9CA3AF', bg: 'rgba(107,114,128,0.18)' },
    confirmada: { label: 'Confirmada', text: '#60A5FA', bg: 'rgba(59,130,246,0.18)' },
    convertida: { label: 'Convertida', text: '#C084FC', bg: 'rgba(168,85,247,0.22)' },
    cancelada: { label: 'Cancelada', text: '#F87171', bg: 'rgba(239,68,68,0.18)' },
};

export default function SalesOrderPreview({
    isOpen,
    orderId,
    onClose,
    onConvert,
    onEdit,
    onStatusChange,
}: SalesOrderPreviewProps) {
    const [order, setOrder] = useState<SalesOrderDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<null | 'confirm' | 'cancel' | 'convert'>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && orderId) {
            void fetchOrder(orderId);
        } else {
            setOrder(null);
            setError('');
        }
    }, [isOpen, orderId]);

    async function fetchOrder(id: string) {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/ventas/sales-orders/${id}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'No se pudo cargar la orden');
            }
            setOrder(data.order || null);
        } catch (err: any) {
            setError(err?.message || 'No se pudo cargar la orden');
            setOrder(null);
        } finally {
            setLoading(false);
        }
    }

    async function updateStatus(nextStatus: OrderStatus) {
        if (!orderId) return;
        setActionLoading(nextStatus === 'confirmada' ? 'confirm' : 'cancel');
        setError('');
        try {
            const res = await fetch(`/api/ventas/sales-orders/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || 'No se pudo actualizar el estado');
            }

            await fetchOrder(orderId);
            onStatusChange?.();
        } catch (err: any) {
            setError(err?.message || 'No se pudo actualizar el estado de la orden');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleConvert() {
        if (!order?.id) return;
        setActionLoading('convert');
        setError('');
        try {
            await onConvert(order.id);
            onStatusChange?.();
        } catch (err: any) {
            setError(err?.message || 'No se pudo convertir la orden');
        } finally {
            setActionLoading(null);
        }
    }

    const statusStyle = useMemo(() => {
        if (!order?.status) return statusStyles.borrador;
        return statusStyles[order.status] || statusStyles.borrador;
    }, [order?.status]);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('es-NI', {
            style: 'currency',
            currency: 'NIO',
            minimumFractionDigits: 2,
        }).format(Number(amount || 0));

    const formatDate = (date: string | null) => {
        if (!date) return 'No definida';
        try {
            return new Date(`${date}T00:00:00`).toLocaleDateString('es-NI', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        } catch {
            return date;
        }
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.62)',
                backdropFilter: 'blur(3px)',
                zIndex: 2100,
                padding: '24px 16px',
                overflowY: 'auto',
            }}
        >
            <div
                style={{
                    maxWidth: 920,
                    margin: '0 auto',
                    background: 'var(--card)',
                    borderRadius: 14,
                    border: '1px solid var(--border)',
                    boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
                            {order?.order_number || 'Orden de venta'}
                        </div>
                        {order && (
                            <span
                                style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    padding: '4px 10px',
                                    borderRadius: 999,
                                    color: statusStyle.text,
                                    background: statusStyle.bg,
                                }}
                            >
                                {statusStyle.label}
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {order && order.status !== 'convertida' && order.status !== 'cancelada' && (
                            <button
                                type="button"
                                onClick={() => onEdit?.(order.id)}
                                disabled={actionLoading !== null}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(245,158,11,0.35)',
                                    background: 'rgba(245,158,11,0.12)',
                                    color: '#FBBF24',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: actionLoading ? 'default' : 'pointer',
                                }}
                            >
                                <Pencil size={14} />
                                Editar
                            </button>
                        )}

                        {order?.status === 'borrador' && (
                            <button
                                type="button"
                                onClick={() => void updateStatus('confirmada')}
                                disabled={actionLoading !== null}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(59,130,246,0.4)',
                                    background: 'rgba(59,130,246,0.12)',
                                    color: '#60A5FA',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: actionLoading ? 'default' : 'pointer',
                                }}
                            >
                                {actionLoading === 'confirm' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
                                Confirmar
                            </button>
                        )}

                        {order?.status === 'confirmada' && (
                            <button
                                type="button"
                                onClick={() => void handleConvert()}
                                disabled={actionLoading !== null}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(168,85,247,0.45)',
                                    background: 'rgba(168,85,247,0.16)',
                                    color: '#C084FC',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: actionLoading ? 'default' : 'pointer',
                                }}
                            >
                                {actionLoading === 'convert' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRightLeft size={14} />}
                                Convertir a factura
                            </button>
                        )}

                        {(order?.status === 'borrador' || order?.status === 'confirmada') && (
                            <button
                                type="button"
                                onClick={() => void updateStatus('cancelada')}
                                disabled={actionLoading !== null}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(239,68,68,0.35)',
                                    background: 'rgba(239,68,68,0.12)',
                                    color: '#F87171',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: actionLoading ? 'default' : 'pointer',
                                }}
                            >
                                {actionLoading === 'cancel' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={14} />}
                                Cancelar
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                padding: 2,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            aria-label="Cerrar"
                        >
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: 36, textAlign: 'center', color: 'var(--muted)' }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                        Cargando orden de venta...
                    </div>
                ) : !order ? (
                    <div style={{ padding: 36, textAlign: 'center', color: '#FCA5A5' }}>
                        {error || 'No se encontró la orden de venta.'}
                    </div>
                ) : (
                    <div style={{ padding: 18 }}>
                        {error && (
                            <div
                                style={{
                                    marginBottom: 12,
                                    padding: '10px 12px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(239,68,68,0.4)',
                                    background: 'rgba(127,29,29,0.3)',
                                    color: '#FCA5A5',
                                    fontSize: 12,
                                    fontWeight: 700,
                                }}
                            >
                                {error}
                            </div>
                        )}

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                gap: 12,
                                marginBottom: 14,
                            }}
                        >
                            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
                                    Cliente
                                </div>
                                {order.customer ? (
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                                            <User size={13} />
                                            <span>{order.customer.name}</span>
                                        </div>
                                        {order.customer.email && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                                                <Mail size={12} />
                                                <span>{order.customer.email}</span>
                                            </div>
                                        )}
                                        {order.customer.phone && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                                                <Phone size={12} />
                                                <span>{order.customer.phone}</span>
                                            </div>
                                        )}
                                        {order.customer.ruc && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                                                <Hash size={12} />
                                                <span>RUC: {order.customer.ruc}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sin cliente asignado</div>
                                )}
                            </div>

                            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
                                    Información de orden
                                </div>
                                <div style={{ display: 'grid', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                        <Calendar size={12} style={{ color: 'var(--muted)' }} />
                                        <span>Fecha: {formatDate(order.date)}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                        <Calendar size={12} style={{ color: 'var(--muted)' }} />
                                        <span>Entrega: {formatDate(order.expected_delivery_date)}</span>
                                    </div>
                                    {order.reference_number && (
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            Referencia: {order.reference_number}
                                        </div>
                                    )}
                                    {order.payment_terms && (
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            Términos: {order.payment_terms}
                                        </div>
                                    )}
                                    {order.delivery_method && (
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            Método entrega: {order.delivery_method}
                                        </div>
                                    )}
                                    {order.shipping_zone && (
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            Zona envío: {order.shipping_zone}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                        <Warehouse size={12} style={{ color: 'var(--muted)' }} />
                                        <span>
                                            Bodega: {order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : 'Sin bodega'}
                                        </span>
                                    </div>
                                    {order.salesperson_name && (
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            Vendedor: {order.salesperson_name}
                                        </div>
                                    )}
                                    {order.salesperson_id && (
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            Vendedor ID: {order.salesperson_id}
                                        </div>
                                    )}
                                    {order.zoho_salesorder_id && (
                                        <div style={{ fontSize: 12, color: '#C084FC' }}>
                                            Zoho Sales Order: {order.zoho_salesorder_id}
                                        </div>
                                    )}
                                    {order.converted_invoice_id && (
                                        <div style={{ fontSize: 12, color: '#93C5FD' }}>
                                            Factura destino: {order.converted_invoice_id}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1.8fr 110px 120px 100px 130px',
                                    padding: '10px 12px',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderBottom: '1px solid var(--border)',
                                    fontSize: 11,
                                    color: 'var(--muted)',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                }}
                            >
                                <div>Descripción</div>
                                <div style={{ textAlign: 'right' }}>Cantidad</div>
                                <div style={{ textAlign: 'right' }}>P. Unitario</div>
                                <div style={{ textAlign: 'right' }}>Desc.</div>
                                <div style={{ textAlign: 'right' }}>Subtotal</div>
                            </div>
                            {(order.items || []).map((item) => (
                                <div
                                    key={item.id}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1.8fr 110px 120px 100px 130px',
                                        padding: '10px 12px',
                                        borderBottom: '1px solid var(--border)',
                                        fontSize: 12,
                                        alignItems: 'center',
                                    }}
                                >
                                    <div style={{ color: 'var(--text)', fontWeight: 600 }}>{item.description || 'Articulo'}</div>
                                    <div style={{ textAlign: 'right', color: 'var(--muted)' }}>{Number(item.quantity || 0).toFixed(2)}</div>
                                    <div style={{ textAlign: 'right', color: 'var(--muted)' }}>{formatCurrency(item.unit_price)}</div>
                                    <div style={{ textAlign: 'right', color: 'var(--muted)' }}>{Number(item.discount_percent || 0).toFixed(0)}%</div>
                                    <div style={{ textAlign: 'right', color: 'var(--text)', fontWeight: 700 }}>{formatCurrency(item.subtotal)}</div>
                                </div>
                            ))}
                            {(order.items || []).length === 0 && (
                                <div style={{ padding: 18, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                                    Sin lineas de detalle.
                                </div>
                            )}
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gap: 4,
                                justifyContent: 'end',
                                fontSize: 12,
                                color: 'var(--muted)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
                                <span>Subtotal:</span>
                                <span>{formatCurrency(order.subtotal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
                                <span>IVA ({Number(order.tax_rate || 0).toFixed(0)}%):</span>
                                <span>{formatCurrency(order.tax_amount)}</span>
                            </div>
                            {Number(order.discount_amount || 0) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
                                    <span>Descuento:</span>
                                    <span>-{formatCurrency(order.discount_amount)}</span>
                                </div>
                            )}
                            <div
                                style={{
                                    marginTop: 4,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 24,
                                    fontSize: 16,
                                    color: 'var(--text)',
                                    fontWeight: 800,
                                }}
                            >
                                <span>Total:</span>
                                <span>{formatCurrency(order.total)}</span>
                            </div>
                        </div>

                        {order.notes && (
                            <div
                                style={{
                                    marginTop: 12,
                                    padding: '10px 12px',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'rgba(255,255,255,0.02)',
                                    fontSize: 12,
                                    color: 'var(--muted)',
                                }}
                            >
                                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>
                                    Notas
                                </div>
                                {order.notes}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
