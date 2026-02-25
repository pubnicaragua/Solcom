'use client';

import { useState, useEffect } from 'react';
import {
    X, Download, CheckCircle, FileText, Mail, Phone,
    MapPin, Calendar, Hash, Printer,
} from 'lucide-react';

interface InvoicePreviewProps {
    isOpen: boolean;
    invoiceId: string | null;
    onClose: () => void;
    onStatusChange: () => void;
}

export default function InvoicePreview({ isOpen, invoiceId, onClose, onStatusChange }: InvoicePreviewProps) {
    const [invoice, setInvoice] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [statusError, setStatusError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && invoiceId) {
            fetchInvoice();
        }
    }, [isOpen, invoiceId]);

    const fetchInvoice = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/ventas/invoices/${invoiceId}`);
            const data = await res.json();
            if (data.invoice) setInvoice(data.invoice);
        } catch (err) {
            console.error('Error fetching invoice:', err);
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (status: string) => {
        setUpdatingStatus(true);
        setStatusError(null);
        try {
            const res = await fetch(`/api/ventas/invoices/${invoiceId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || 'No se pudo actualizar el estado de la factura.');
            }

            fetchInvoice();
            onStatusChange();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo actualizar el estado de la factura.';
            setStatusError(message);
            console.error('Error updating status:', err);
        } finally {
            setUpdatingStatus(false);
        }
    };

    const exportPDF = async () => {
        if (!invoice) return;
        try {
            const jsPDF = (await import('jspdf')).default;
            const doc = new jsPDF();

            // Header
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('FACTURA', 20, 25);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text('Solis Comercial Nicaragua', 20, 35);
            doc.text('Managua, Nicaragua', 20, 40);

            // Invoice info
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'bold');
            doc.text(`No: ${invoice.invoice_number}`, 140, 25);
            doc.setFont('helvetica', 'normal');
            doc.text(`Fecha: ${new Date(invoice.date).toLocaleDateString('es-NI')}`, 140, 32);
            if (invoice.due_date) {
                doc.text(`Vence: ${new Date(invoice.due_date).toLocaleDateString('es-NI')}`, 140, 39);
            }
            doc.text(`Estado: ${invoice.status.toUpperCase()}`, 140, 46);

            // Customer
            if (invoice.customer) {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.text('FACTURAR A:', 20, 58);
                doc.setFont('helvetica', 'normal');
                doc.text(invoice.customer.name, 20, 65);
                if (invoice.customer.email) doc.text(invoice.customer.email, 20, 71);
                if (invoice.customer.phone) doc.text(invoice.customer.phone, 20, 77);
                if (invoice.customer.ruc) doc.text(`RUC: ${invoice.customer.ruc}`, 20, 83);
            }

            // Table header
            const tableTop = 98;
            doc.setFillColor(30, 41, 59);
            doc.rect(20, tableTop - 6, 170, 10, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('#', 24, tableTop);
            doc.text('Descripción', 32, tableTop);
            doc.text('Cant.', 110, tableTop);
            doc.text('P. Unit.', 128, tableTop);
            doc.text('Desc.', 152, tableTop);
            doc.text('Subtotal', 170, tableTop);

            // Items
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            let y = tableTop + 10;
            (invoice.items || []).forEach((item: any, i: number) => {
                doc.text(String(i + 1), 24, y);
                doc.text(item.description?.substring(0, 40) || '', 32, y);
                doc.text(String(item.quantity), 112, y);
                doc.text(`$${Number(item.unit_price).toFixed(2)}`, 128, y);
                doc.text(`${Number(item.discount_percent)}%`, 154, y);
                doc.text(`$${Number(item.subtotal).toFixed(2)}`, 170, y);
                y += 8;
            });

            // Totals
            y += 8;
            doc.setDrawColor(200, 200, 200);
            doc.line(120, y - 4, 190, y - 4);

            doc.setFont('helvetica', 'normal');
            doc.text('Subtotal:', 130, y);
            doc.text(`$${Number(invoice.subtotal).toFixed(2)}`, 170, y);
            y += 7;
            doc.text(`IVA (${Number(invoice.tax_rate)}%):`, 130, y);
            doc.text(`$${Number(invoice.tax_amount).toFixed(2)}`, 170, y);
            if (Number(invoice.discount_amount) > 0) {
                y += 7;
                doc.text('Descuento:', 130, y);
                doc.text(`-$${Number(invoice.discount_amount).toFixed(2)}`, 170, y);
            }
            y += 10;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('TOTAL:', 130, y);
            doc.text(`$${Number(invoice.total).toFixed(2)}`, 165, y);

            // Notes
            if (invoice.notes) {
                y += 16;
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.text('Notas:', 20, y);
                doc.setFont('helvetica', 'normal');
                doc.text(invoice.notes, 20, y + 6);
            }

            // Footer
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text('Gracias por su compra — Solis Comercial Nicaragua', 20, 280);

            doc.save(`${invoice.invoice_number}.pdf`);
        } catch (err) {
            console.error('Error generating PDF:', err);
            alert('Error al generar el PDF');
        }
    };

    if (!isOpen) return null;

    const statusColors: Record<string, { bg: string; text: string }> = {
        borrador: { bg: 'rgba(107,114,128,0.15)', text: '#9CA3AF' },
        enviada: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA' },
        pagada: { bg: 'rgba(16,185,129,0.15)', text: '#34D399' },
        vencida: { bg: 'rgba(245,158,11,0.15)', text: '#FBBF24' },
        cancelada: { bg: 'rgba(239,68,68,0.15)', text: '#F87171' },
    };

    const sc = statusColors[invoice?.status] || statusColors.borrador;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start',
            justifyContent: 'center', zIndex: 2000, padding: '30px 20px',
            overflowY: 'auto', backdropFilter: 'blur(4px)',
        }}>
            <div style={{
                background: 'var(--card)', borderRadius: '16px', maxWidth: '800px',
                width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                border: '1px solid var(--border)',
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 24px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FileText size={20} style={{ color: 'var(--brand-primary)' }} />
                        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                            {invoice?.invoice_number || 'Cargando...'}
                        </h2>
                        {invoice && (
                            <span style={{
                                fontSize: '12px', padding: '4px 12px', borderRadius: '20px',
                                fontWeight: 600, background: sc.bg, color: sc.text,
                                textTransform: 'capitalize',
                            }}>
                                {invoice.status}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {invoice && invoice.status !== 'pagada' && invoice.status !== 'cancelada' && (
                            <button
                                onClick={() => updateStatus('pagada')}
                                disabled={updatingStatus}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 16px', background: '#059669', color: 'white',
                                    border: 'none', borderRadius: '8px', fontSize: '13px',
                                    fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                <CheckCircle size={16} />
                                Marcar Pagada
                            </button>
                        )}
                        {invoice && (
                            <button
                                onClick={exportPDF}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 16px', background: 'var(--brand-primary)', color: 'white',
                                    border: 'none', borderRadius: '8px', fontSize: '13px',
                                    fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                <Download size={16} />
                                PDF
                            </button>
                        )}
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px' }}>
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
                        Cargando factura...
                    </div>
                ) : invoice ? (
                    <div style={{ padding: '24px' }}>
                        {statusError && (
                            <div style={{
                                marginBottom: '16px',
                                padding: '10px 12px',
                                borderRadius: '10px',
                                border: '1px solid rgba(239, 68, 68, 0.5)',
                                background: 'rgba(127, 29, 29, 0.28)',
                                color: '#FCA5A5',
                                fontSize: '13px',
                                fontWeight: 600,
                            }}>
                                {statusError}
                            </div>
                        )}

                        {/* Invoice header info */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
                            {/* Customer */}
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                                    Facturar a
                                </div>
                                {invoice.customer ? (
                                    <div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
                                            {invoice.customer.name}
                                        </div>
                                        {invoice.customer.email && (
                                            <div style={{ fontSize: '13px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                <Mail size={12} /> {invoice.customer.email}
                                            </div>
                                        )}
                                        {invoice.customer.phone && (
                                            <div style={{ fontSize: '13px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                <Phone size={12} /> {invoice.customer.phone}
                                            </div>
                                        )}
                                        {invoice.customer.ruc && (
                                            <div style={{ fontSize: '13px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Hash size={12} /> RUC: {invoice.customer.ruc}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic' }}>
                                        Sin cliente asignado
                                    </div>
                                )}
                            </div>

                            {/* Invoice details */}
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                                    Detalles
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px' }}>
                                    <Calendar size={12} style={{ display: 'inline', marginRight: '6px' }} />
                                    Fecha: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{new Date(invoice.date).toLocaleDateString('es-NI')}</span>
                                </div>
                                {invoice.due_date && (
                                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px' }}>
                                        <Calendar size={12} style={{ display: 'inline', marginRight: '6px' }} />
                                        Vence: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{new Date(invoice.due_date).toLocaleDateString('es-NI')}</span>
                                    </div>
                                )}
                                {invoice.payment_method && (
                                    <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                                        Método: <span style={{ color: 'var(--text)', fontWeight: 600, textTransform: 'capitalize' }}>{invoice.payment_method}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Items table */}
                        <div style={{
                            border: '1px solid var(--border)', borderRadius: '12px',
                            overflow: 'hidden', marginBottom: '20px',
                        }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '40px 2fr 70px 110px 70px 110px',
                                padding: '12px 16px', background: 'rgba(255,255,255,0.03)',
                                borderBottom: '1px solid var(--border)',
                            }}>
                                {['#', 'Descripción', 'Cant.', 'P. Unit.', 'Desc.', 'Subtotal'].map((h, i) => (
                                    <div key={i} style={{
                                        fontSize: '11px', fontWeight: 700, color: 'var(--muted)',
                                        textTransform: 'uppercase', letterSpacing: '0.5px',
                                        textAlign: i >= 2 ? 'right' : 'left',
                                    }}>
                                        {h}
                                    </div>
                                ))}
                            </div>

                            {(invoice.items || []).map((item: any, i: number) => (
                                <div
                                    key={item.id}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '40px 2fr 70px 110px 70px 110px',
                                        padding: '12px 16px',
                                        borderBottom: i < (invoice.items?.length || 0) - 1 ? '1px solid var(--border)' : 'none',
                                        fontSize: '13px',
                                    }}
                                >
                                    <div style={{ color: 'var(--muted)' }}>{i + 1}</div>
                                    <div style={{ color: 'var(--text)', fontWeight: 500 }}>{item.description}</div>
                                    <div style={{ textAlign: 'right', color: 'var(--text)' }}>{item.quantity}</div>
                                    <div style={{ textAlign: 'right', color: 'var(--text)' }}>${Number(item.unit_price).toFixed(2)}</div>
                                    <div style={{ textAlign: 'right', color: item.discount_percent > 0 ? '#FBBF24' : 'var(--muted)' }}>
                                        {item.discount_percent > 0 ? `${item.discount_percent}%` : '—'}
                                    </div>
                                    <div style={{ textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>
                                        ${Number(item.subtotal).toFixed(2)}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Totals */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <div style={{ width: '320px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                                    <span style={{ color: 'var(--muted)' }}>Subtotal</span>
                                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>${Number(invoice.subtotal).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                                    <span style={{ color: 'var(--muted)' }}>IVA ({Number(invoice.tax_rate)}%)</span>
                                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>${Number(invoice.tax_amount).toFixed(2)}</span>
                                </div>
                                {Number(invoice.discount_amount) > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                                        <span style={{ color: 'var(--muted)' }}>Descuento</span>
                                        <span style={{ color: '#FBBF24', fontWeight: 600 }}>-${Number(invoice.discount_amount).toFixed(2)}</span>
                                    </div>
                                )}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    paddingTop: '14px', borderTop: '2px solid var(--border)',
                                }}>
                                    <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>Total</span>
                                    <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--brand-primary)' }}>
                                        ${Number(invoice.total).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        {invoice.notes && (
                            <div style={{
                                marginTop: '24px', padding: '16px', background: 'var(--background)',
                                borderRadius: '8px', border: '1px solid var(--border)',
                            }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                                    Notas
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
                                    {invoice.notes}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
                        Factura no encontrada
                    </div>
                )}
            </div>
        </div>
    );
}
