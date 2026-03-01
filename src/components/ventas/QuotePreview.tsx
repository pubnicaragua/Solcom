'use client';

import { useState, useEffect } from 'react';
import {
    X, Download, FileText, Mail, Phone,
    Hash, Calendar, Package, Printer,
} from 'lucide-react';

interface QuotePreviewProps {
    isOpen: boolean;
    quoteId: string | null;
    onClose: () => void;
}

export default function QuotePreview({ isOpen, quoteId, onClose }: QuotePreviewProps) {
    const [quote, setQuote] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && quoteId) {
            fetchQuote();
        }
    }, [isOpen, quoteId]);

    const fetchQuote = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/ventas/quotes/${quoteId}`);
            const data = await res.json();
            if (data.quote) setQuote(data.quote);
        } catch (err) {
            console.error('Error fetching quote:', err);
        } finally {
            setLoading(false);
        }
    };

    const exportPDF = async () => {
        if (!quote) return;
        try {
            const jsPDF = (await import('jspdf')).default;
            const doc = new jsPDF();

            // Header
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('COTIZACIÓN', 20, 25);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text('Solis Comercial Nicaragua', 20, 35);
            doc.text('Managua, Nicaragua', 20, 40);

            // Quote info
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'bold');
            doc.text(`No: ${quote.quote_number}`, 140, 25);
            doc.setFont('helvetica', 'normal');
            doc.text(`Fecha: ${new Date(quote.date).toLocaleDateString('es-NI')}`, 140, 32);
            if (quote.valid_until) {
                doc.text(`Válida hasta: ${new Date(quote.valid_until).toLocaleDateString('es-NI')}`, 140, 39);
            }
            doc.text(`Estado: ${quote.status.toUpperCase()}`, 140, 46);

            if (quote.source === 'inventory_cart') {
                doc.setFontSize(8);
                doc.setTextColor(16, 185, 129);
                doc.text('Generada desde inventario', 140, 52);
                doc.setTextColor(0, 0, 0);
            }

            // Customer
            let customerEndY = 58;
            if (quote.customer) {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.text('COTIZAR A:', 20, 58);
                doc.setFont('helvetica', 'normal');
                doc.text(quote.customer.name, 20, 65);
                customerEndY = 65;
                if (quote.customer.email) { customerEndY += 6; doc.text(quote.customer.email, 20, customerEndY); }
                if (quote.customer.phone) { customerEndY += 6; doc.text(quote.customer.phone, 20, customerEndY); }
                if (quote.customer.ruc) { customerEndY += 6; doc.text(`RUC: ${quote.customer.ruc}`, 20, customerEndY); }
            }

            // Table header
            const tableTop = Math.max(customerEndY + 18, 98);
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
            (quote.items || []).forEach((item: any, i: number) => {
                if (y > 270) {
                    doc.addPage();
                    y = 20;
                }
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
            doc.text(`$${Number(quote.subtotal).toFixed(2)}`, 170, y);
            y += 7;
            doc.text(`IVA (${Number(quote.tax_rate)}%):`, 130, y);
            doc.text(`$${Number(quote.tax_amount).toFixed(2)}`, 170, y);
            if (Number(quote.discount_amount) > 0) {
                y += 7;
                doc.text('Descuento:', 130, y);
                doc.text(`-$${Number(quote.discount_amount).toFixed(2)}`, 170, y);
            }
            y += 10;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('TOTAL:', 130, y);
            doc.text(`$${Number(quote.total).toFixed(2)}`, 165, y);

            // Notes
            if (quote.notes) {
                y += 16;
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.text('Notas:', 20, y);
                doc.setFont('helvetica', 'normal');
                const noteLines = doc.splitTextToSize(quote.notes, 160);
                doc.text(noteLines, 20, y + 6);
            }

            // Footer
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text('Esta cotización no constituye una factura — Solis Comercial Nicaragua', 20, 280);

            doc.save(`${quote.quote_number}.pdf`);
        } catch (err) {
            console.error('Error generating PDF:', err);
            alert('Error al generar el PDF');
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (!isOpen) return null;

    const statusColors: Record<string, { bg: string; text: string }> = {
        borrador: { bg: 'rgba(107,114,128,0.15)', text: '#9CA3AF' },
        enviada: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA' },
        aceptada: { bg: 'rgba(16,185,129,0.15)', text: '#34D399' },
        rechazada: { bg: 'rgba(239,68,68,0.15)', text: '#F87171' },
        vencida: { bg: 'rgba(245,158,11,0.15)', text: '#FBBF24' },
        convertida: { bg: 'rgba(168,85,247,0.15)', text: '#C084FC' },
    };

    const sc = statusColors[quote?.status] || statusColors.borrador;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start',
            justifyContent: 'center', zIndex: 2000, padding: '30px 20px',
            overflowY: 'auto', backdropFilter: 'blur(4px)',
        }}>
            <div
                className="quote-preview-card"
                style={{
                    background: 'var(--card)', borderRadius: '16px', maxWidth: '800px',
                    width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                    border: '1px solid var(--border)',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 24px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <FileText size={20} style={{ color: '#60A5FA' }} />
                        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                            {quote?.quote_number || 'Cargando...'}
                        </h2>
                        {quote && (
                            <span style={{
                                fontSize: '12px', padding: '4px 12px', borderRadius: '20px',
                                fontWeight: 600, background: sc.bg, color: sc.text,
                                textTransform: 'capitalize',
                            }}>
                                {quote.status}
                            </span>
                        )}
                        {quote?.source === 'inventory_cart' && (
                            <span style={{
                                fontSize: '11px', padding: '3px 10px', borderRadius: '20px',
                                fontWeight: 700, background: 'rgba(16,185,129,0.12)', color: '#34d399',
                            }}>
                                📦 Desde inventario
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {quote && (
                            <>
                                <button
                                    onClick={handlePrint}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 16px', background: 'rgba(255,255,255,0.06)',
                                        color: 'var(--text)', border: '1px solid var(--border)',
                                        borderRadius: '8px', fontSize: '13px',
                                        fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    <Printer size={16} />
                                    Imprimir
                                </button>
                                <button
                                    onClick={exportPDF}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 16px', background: '#3B82F6', color: 'white',
                                        border: 'none', borderRadius: '8px', fontSize: '13px',
                                        fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    <Download size={16} />
                                    PDF
                                </button>
                            </>
                        )}
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px' }}>
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
                        Cargando cotización...
                    </div>
                ) : quote ? (
                    <div style={{ padding: '24px' }}>
                        {/* Quote header info */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
                            {/* Customer */}
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                                    Cotizar a
                                </div>
                                {quote.customer ? (
                                    <div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
                                            {quote.customer.name}
                                        </div>
                                        {quote.customer.email && (
                                            <div style={{ fontSize: '13px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                <Mail size={12} /> {quote.customer.email}
                                            </div>
                                        )}
                                        {quote.customer.phone && (
                                            <div style={{ fontSize: '13px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                <Phone size={12} /> {quote.customer.phone}
                                            </div>
                                        )}
                                        {quote.customer.ruc && (
                                            <div style={{ fontSize: '13px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Hash size={12} /> RUC: {quote.customer.ruc}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic' }}>
                                        Sin cliente asignado
                                    </div>
                                )}
                            </div>

                            {/* Quote details */}
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                                    Detalles
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px' }}>
                                    <Calendar size={12} style={{ display: 'inline', marginRight: '6px' }} />
                                    Fecha: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{new Date(quote.date).toLocaleDateString('es-NI')}</span>
                                </div>
                                {quote.valid_until && (
                                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px' }}>
                                        <Calendar size={12} style={{ display: 'inline', marginRight: '6px' }} />
                                        Válida hasta: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{new Date(quote.valid_until).toLocaleDateString('es-NI')}</span>
                                    </div>
                                )}
                                {quote.warehouse && (
                                    <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                                        <Package size={12} style={{ display: 'inline', marginRight: '6px' }} />
                                        Bodega: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quote.warehouse.code} — {quote.warehouse.name}</span>
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

                            {(quote.items || []).map((item: any, i: number) => (
                                <div
                                    key={item.id || i}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '40px 2fr 70px 110px 70px 110px',
                                        padding: '12px 16px',
                                        borderBottom: i < (quote.items?.length || 0) - 1 ? '1px solid var(--border)' : 'none',
                                        fontSize: '13px',
                                    }}
                                >
                                    <div style={{ color: 'var(--muted)' }}>{i + 1}</div>
                                    <div style={{ color: 'var(--text)', fontWeight: 500 }}>{item.description}</div>
                                    <div style={{ textAlign: 'right', color: 'var(--text)' }}>{item.quantity}</div>
                                    <div style={{ textAlign: 'right', color: Number(item.unit_price) === 0 ? 'var(--muted)' : 'var(--text)' }}>
                                        {Number(item.unit_price) === 0 ? 'Pendiente' : `$${Number(item.unit_price).toFixed(2)}`}
                                    </div>
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
                                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>${Number(quote.subtotal).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                                    <span style={{ color: 'var(--muted)' }}>IVA ({Number(quote.tax_rate)}%)</span>
                                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>${Number(quote.tax_amount).toFixed(2)}</span>
                                </div>
                                {Number(quote.discount_amount) > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                                        <span style={{ color: 'var(--muted)' }}>Descuento</span>
                                        <span style={{ color: '#FBBF24', fontWeight: 600 }}>-${Number(quote.discount_amount).toFixed(2)}</span>
                                    </div>
                                )}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    paddingTop: '14px', borderTop: '2px solid var(--border)',
                                }}>
                                    <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>Total</span>
                                    <span style={{ fontSize: '24px', fontWeight: 800, color: '#60A5FA' }}>
                                        ${Number(quote.total).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        {quote.notes && (
                            <div style={{
                                marginTop: '24px', padding: '16px', background: 'var(--background)',
                                borderRadius: '8px', border: '1px solid var(--border)',
                            }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                                    Notas
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
                                    {quote.notes}
                                </div>
                            </div>
                        )}

                        {/* Footer disclaimer */}
                        <div style={{
                            marginTop: '20px', textAlign: 'center', fontSize: '11px',
                            color: 'var(--muted)', fontStyle: 'italic',
                        }}>
                            Esta cotización no constituye una factura fiscal.
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
                        Cotización no encontrada
                    </div>
                )}
            </div>

            {/* Print styles */}
            <style jsx>{`
                @media print {
                    .quote-preview-card {
                        box-shadow: none !important;
                        border: none !important;
                        max-width: 100% !important;
                    }
                }
            `}</style>
        </div>
    );
}
