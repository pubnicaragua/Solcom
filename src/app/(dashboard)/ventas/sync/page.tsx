'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, RotateCcw, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';

type SyncIssueRow = {
    id: string;
    status?: string;
    sync_status?: string;
    sync_error_code?: string | null;
    sync_error_message?: string | null;
    sync_attempts?: number | null;
    last_sync_attempt_at?: string | null;
    invoice_number?: string | null;
    order_number?: string | null;
    quote_number?: string | null;
};

type DeleteSyncIssueRow = {
    id: string;
    document_type: 'sales_invoice' | 'sales_order';
    document_id: string;
    document_number?: string | null;
    requested_by?: string | null;
    requested_at?: string | null;
    zoho_result_status?: string;
    zoho_error_code?: string | null;
    zoho_error_message?: string | null;
};

type SyncStatusResponse = {
    queue?: {
        pending?: number;
        processing?: number;
        failed?: number;
        completed?: number;
    };
    sync_issues?: {
        invoices?: SyncIssueRow[];
        orders?: SyncIssueRow[];
        quotes?: SyncIssueRow[];
    };
    delete_sync_issues?: DeleteSyncIssueRow[];
};

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('es-NI', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function inferRetryAction(row: SyncIssueRow): 'sync_create' | 'sync_delete' {
    const message = String(row?.sync_error_message || '').toLowerCase();
    if (
        message.includes('no se pudo anular la factura en zoho') ||
        message.includes('no se pudo anular la ov en zoho') ||
        message.includes('void')
    ) {
        return 'sync_delete';
    }
    return 'sync_create';
}

export default function VentasSyncAdminPage() {
    const [loading, setLoading] = useState(true);
    const [retryingKey, setRetryingKey] = useState<string | null>(null);
    const [error, setError] = useState<string>('');
    const [notice, setNotice] = useState<string>('');
    const [data, setData] = useState<SyncStatusResponse>({});

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/ventas/sync/status', { cache: 'no-store' });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || `Error ${res.status} al cargar estado de sincronización`);
            }
            setData(payload || {});
        } catch (err: any) {
            setError(err?.message || 'No se pudo cargar el estado de sincronización');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const allSyncIssues = useMemo(() => {
        const invoices = (data.sync_issues?.invoices || []).map((row) => ({ ...row, document_type: 'sales_invoice' as const }));
        const orders = (data.sync_issues?.orders || []).map((row) => ({ ...row, document_type: 'sales_order' as const }));
        const quotes = (data.sync_issues?.quotes || []).map((row) => ({ ...row, document_type: 'sales_quote' as const }));
        return [...invoices, ...orders, ...quotes];
    }, [data.sync_issues]);

    const retryDocument = useCallback(async (params: {
        documentId: string;
        documentType: 'sales_invoice' | 'sales_order' | 'sales_quote';
        action: 'sync_create' | 'sync_delete';
    }) => {
        const { documentId, documentType, action } = params;
        const key = `${documentType}:${documentId}:${action}`;
        setRetryingKey(key);
        setNotice('');
        setError('');
        try {
            const res = await fetch(`/api/ventas/sync/retry/${encodeURIComponent(documentId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_type: documentType,
                    immediate: true,
                    action,
                }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || `Error ${res.status} al reintentar sincronización`);
            }
            setNotice(
                action === 'sync_delete'
                    ? 'Reintento de eliminación enviado correctamente.'
                    : 'Reintento de sincronización enviado correctamente.'
            );
            await fetchStatus();
        } catch (err: any) {
            setError(err?.message || 'No se pudo reintentar sincronización');
        } finally {
            setRetryingKey(null);
        }
    }, [fetchStatus]);

    return (
        <div style={{ color: 'var(--text)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Administración Sync Zoho</h1>
                    <p style={{ margin: '6px 0 0 0', color: 'var(--muted)', fontSize: 13 }}>
                        Monitorea errores y reintenta sincronizaciones de ventas.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link
                        href="/ventas"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255,255,255,0.04)',
                            color: 'var(--text)',
                            textDecoration: 'none',
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        <ArrowLeft size={14} />
                        Volver
                    </Link>
                    <button
                        onClick={fetchStatus}
                        disabled={loading}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px solid rgba(59,130,246,0.35)',
                            background: 'rgba(59,130,246,0.15)',
                            color: '#93C5FD',
                            cursor: loading ? 'wait' : 'pointer',
                            fontSize: 13,
                            fontWeight: 700,
                        }}
                    >
                        <RefreshCw size={14} />
                        Actualizar
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ marginBottom: 12, borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', padding: '10px 12px', fontSize: 13 }}>
                    {error}
                </div>
            )}
            {notice && (
                <div style={{ marginBottom: 12, borderRadius: 8, border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.12)', color: '#6EE7B7', padding: '10px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={16} />
                    {notice}
                </div>
            )}

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', marginBottom: 16 }}>
                {[
                    { label: 'Pendientes', value: data.queue?.pending || 0 },
                    { label: 'Procesando', value: data.queue?.processing || 0 },
                    { label: 'Fallidos', value: data.queue?.failed || 0 },
                    { label: 'Completados', value: data.queue?.completed || 0 },
                ].map((card) => (
                    <div key={card.label} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', padding: 12 }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{card.label}</div>
                        <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{card.value}</div>
                    </div>
                ))}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', padding: 12, marginBottom: 16 }}>
                <h2 style={{ margin: 0, marginBottom: 10, fontSize: 16 }}>Documentos con Sync Pendiente/Error</h2>
                {loading ? (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</div>
                ) : allSyncIssues.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Sin incidencias.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '8px 6px' }}>Tipo</th>
                                    <th style={{ padding: '8px 6px' }}>Documento</th>
                                    <th style={{ padding: '8px 6px' }}>Estado</th>
                                    <th style={{ padding: '8px 6px' }}>Sync</th>
                                    <th style={{ padding: '8px 6px' }}>Error</th>
                                    <th style={{ padding: '8px 6px' }}>Intentos</th>
                                    <th style={{ padding: '8px 6px' }}>Último intento</th>
                                    <th style={{ padding: '8px 6px' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allSyncIssues.map((row: any) => {
                                    const documentNumber = row.invoice_number || row.order_number || row.quote_number || row.id;
                                    const action = inferRetryAction(row);
                                    const retryKey = `${row.document_type}:${row.id}:${action}`;
                                    return (
                                        <tr key={`${row.document_type}:${row.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                            <td style={{ padding: '8px 6px' }}>{row.document_type}</td>
                                            <td style={{ padding: '8px 6px', fontWeight: 700 }}>{documentNumber}</td>
                                            <td style={{ padding: '8px 6px' }}>{row.status || '—'}</td>
                                            <td style={{ padding: '8px 6px' }}>{row.sync_status || '—'}</td>
                                            <td style={{ padding: '8px 6px', color: '#FCA5A5' }}>
                                                {row.sync_error_code || '—'}
                                                {row.sync_error_message ? ` · ${row.sync_error_message}` : ''}
                                            </td>
                                            <td style={{ padding: '8px 6px' }}>{row.sync_attempts ?? 0}</td>
                                            <td style={{ padding: '8px 6px' }}>{formatDateTime(row.last_sync_attempt_at)}</td>
                                            <td style={{ padding: '8px 6px' }}>
                                                <button
                                                    onClick={() => retryDocument({
                                                        documentId: row.id,
                                                        documentType: row.document_type,
                                                        action,
                                                    })}
                                                    disabled={retryingKey === retryKey}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        padding: '6px 10px',
                                                        borderRadius: 7,
                                                        border: '1px solid rgba(245,158,11,0.35)',
                                                        background: 'rgba(245,158,11,0.16)',
                                                        color: '#FBBF24',
                                                        cursor: retryingKey === retryKey ? 'wait' : 'pointer',
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    <RotateCcw size={12} />
                                                    Reintentar
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', padding: 12 }}>
                <h2 style={{ margin: 0, marginBottom: 10, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={16} style={{ color: '#F59E0B' }} />
                    Eliminaciones con fallo Zoho
                </h2>
                {loading ? (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</div>
                ) : (data.delete_sync_issues || []).length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Sin fallos pendientes de eliminación.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '8px 6px' }}>Tipo</th>
                                    <th style={{ padding: '8px 6px' }}>Documento</th>
                                    <th style={{ padding: '8px 6px' }}>Solicitado</th>
                                    <th style={{ padding: '8px 6px' }}>Error Zoho</th>
                                    <th style={{ padding: '8px 6px' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data.delete_sync_issues || []).map((row) => {
                                    const retryKey = `delete:${row.document_type}:${row.document_id}`;
                                    return (
                                        <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                            <td style={{ padding: '8px 6px' }}>{row.document_type}</td>
                                            <td style={{ padding: '8px 6px', fontWeight: 700 }}>{row.document_number || row.document_id}</td>
                                            <td style={{ padding: '8px 6px' }}>{formatDateTime(row.requested_at)}</td>
                                            <td style={{ padding: '8px 6px', color: '#FCA5A5' }}>
                                                {row.zoho_error_code || '—'}
                                                {row.zoho_error_message ? ` · ${row.zoho_error_message}` : ''}
                                            </td>
                                            <td style={{ padding: '8px 6px' }}>
                                                <button
                                                    onClick={() => retryDocument({
                                                        documentId: row.document_id,
                                                        documentType: row.document_type,
                                                        action: 'sync_delete',
                                                    })}
                                                    disabled={retryingKey === retryKey}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        padding: '6px 10px',
                                                        borderRadius: 7,
                                                        border: '1px solid rgba(239,68,68,0.35)',
                                                        background: 'rgba(239,68,68,0.16)',
                                                        color: '#FCA5A5',
                                                        cursor: retryingKey === retryKey ? 'wait' : 'pointer',
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    <RotateCcw size={12} />
                                                    Reintentar delete
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
