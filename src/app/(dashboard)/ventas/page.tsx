'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText, Plus, Search, Filter, DollarSign, Clock,
  CheckCircle, AlertTriangle, XCircle, Eye, Trash2,
  ChevronLeft, ChevronRight, Calendar, RefreshCw,
} from 'lucide-react';
import InvoiceForm from '@/components/ventas/InvoiceForm';
import InvoicePreview from '@/components/ventas/InvoicePreview';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null; ruc: string | null } | null;
  date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_TABS = [
  { key: 'todas', label: 'Todas', icon: FileText },
  { key: 'borrador', label: 'Borrador', icon: FileText },
  { key: 'enviada', label: 'Enviadas', icon: Clock },
  { key: 'pagada', label: 'Pagadas', icon: CheckCircle },
  { key: 'vencida', label: 'Vencidas', icon: AlertTriangle },
  { key: 'cancelada', label: 'Canceladas', icon: XCircle },
];

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  borrador: { bg: 'rgba(107,114,128,0.15)', text: '#9CA3AF', label: 'Borrador' },
  enviada: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA', label: 'Enviada' },
  pagada: { bg: 'rgba(16,185,129,0.15)', text: '#34D399', label: 'Pagada' },
  vencida: { bg: 'rgba(245,158,11,0.15)', text: '#FBBF24', label: 'Vencida' },
  cancelada: { bg: 'rgba(239,68,68,0.15)', text: '#F87171', label: 'Cancelada' },
};

export default function FacturacionPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // KPIs
  const [kpis, setKpis] = useState({ total: 0, pagadas: 0, pendientes: 0, vencidas: 0 });

  // Modals
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchInvoices();
  }, [activeTab, searchTerm, fromDate, toDate, page]);

  useEffect(() => {
    fetchKpis();
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== 'todas') params.set('status', activeTab);
      if (searchTerm) params.set('search', searchTerm);
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      params.set('page', String(page));
      params.set('per_page', '15');

      const res = await fetch(`/api/ventas/invoices?${params.toString()}`);
      const data = await res.json();

      setInvoices(data.invoices || []);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.total || 0);
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchKpis = async () => {
    try {
      // Fetch all to compute KPIs
      const res = await fetch('/api/ventas/invoices?per_page=999');
      const data = await res.json();
      const all: Invoice[] = data.invoices || [];

      setKpis({
        total: all.reduce((s, inv) => s + Number(inv.total), 0),
        pagadas: all.filter(inv => inv.status === 'pagada').reduce((s, inv) => s + Number(inv.total), 0),
        pendientes: all.filter(inv => inv.status === 'enviada').reduce((s, inv) => s + Number(inv.total), 0),
        vencidas: all.filter(inv => inv.status === 'vencida').length,
      });
    } catch (err) {
      console.error('Error fetching KPIs:', err);
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm('¿Eliminar esta factura en borrador?')) return;
    try {
      const res = await fetch(`/api/ventas/invoices/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchInvoices();
        fetchKpis();
      } else {
        const data = await res.json();
        alert(data.error || 'Error al eliminar');
      }
    } catch (err) {
      alert('Error al eliminar');
    }
  };

  const refreshAll = () => {
    fetchInvoices();
    fetchKpis();
  };

  const kpiCards = [
    {
      label: 'Facturado Total',
      value: `$${kpis.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: '#DC2626',
      bg: 'rgba(220,38,38,0.08)',
    },
    {
      label: 'Cobrado',
      value: `$${kpis.pagadas.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      icon: CheckCircle,
      color: '#10B981',
      bg: 'rgba(16,185,129,0.08)',
    },
    {
      label: 'Pendiente Cobro',
      value: `$${kpis.pendientes.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      icon: Clock,
      color: '#3B82F6',
      bg: 'rgba(59,130,246,0.08)',
    },
    {
      label: 'Vencidas',
      value: String(kpis.vencidas),
      icon: AlertTriangle,
      color: '#F59E0B',
      bg: 'rgba(245,158,11,0.08)',
    },
  ];

  return (
    <div style={{ color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="h-title" style={{ fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={24} style={{ color: 'var(--brand-primary)' }} />
            Facturación
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
            Gestiona tus facturas y cobros
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/ventas/cotizaciones"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '12px 20px', background: 'rgba(59,130,246,0.18)', color: '#93C5FD',
              border: '1px solid rgba(59,130,246,0.4)', borderRadius: '10px', fontSize: '14px', fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            <FileText size={16} />
            Cotizaciones
          </Link>

          <button
            onClick={() => setShowInvoiceForm(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 24px', background: 'var(--brand-primary)', color: 'white',
              border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 4px 14px rgba(220,38,38,0.3)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(220,38,38,0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(220,38,38,0.3)';
            }}
          >
            <Plus size={18} />
            Nueva Factura
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {kpiCards.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={i} style={{
              background: 'var(--card)', padding: '20px', borderRadius: '12px',
              border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} style={{ color: kpi.color }} />
                </div>
                <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>{kpi.label}</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text)' }}>{kpi.value}</div>
            </div>
          );
        })}
      </div>

      {/* Status Tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '20px',
        background: 'var(--card)', padding: '4px', borderRadius: '12px',
        border: '1px solid var(--border)', overflowX: 'auto',
      }}>
        {STATUS_TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 18px', border: 'none', borderRadius: '8px',
                background: isActive ? 'var(--brand-primary)' : 'transparent',
                color: isActive ? 'white' : 'var(--muted)',
                fontSize: '13px', fontWeight: isActive ? 700 : 500,
                cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filters Bar */}
      <div style={{
        background: 'var(--card)', padding: '16px 20px', borderRadius: '12px',
        marginBottom: '20px', border: '1px solid var(--border)',
        display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 250px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px' }}>
            Buscar
          </label>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--muted)' }} />
            <input
              type="text" value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Número de factura..."
              style={{
                width: '100%', padding: '9px 12px 9px 32px',
                background: 'var(--background)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px',
              }}
            />
          </div>
        </div>
        <div style={{ flex: '0 0 160px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px' }}>
            Desde
          </label>
          <input
            type="date" value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            style={{
              width: '100%', padding: '9px 12px',
              background: 'var(--background)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px',
            }}
          />
        </div>
        <div style={{ flex: '0 0 160px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px' }}>
            Hasta
          </label>
          <input
            type="date" value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            style={{
              width: '100%', padding: '9px 12px',
              background: 'var(--background)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px',
            }}
          />
        </div>
        <button
          onClick={refreshAll}
          title="Actualizar"
          style={{
            padding: '9px 12px', background: 'var(--background)',
            border: '1px solid var(--border)', borderRadius: '8px',
            cursor: 'pointer', color: 'var(--muted)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Invoices Table */}
      <div style={{
        background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '100px 1.2fr 130px 100px 130px 80px',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          {['Fecha', 'Cliente', 'Número', 'Estado', 'Total', ''].map((h, i) => (
            <div key={i} style={{
              fontSize: '11px', fontWeight: 700, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.5px',
              textAlign: i === 4 ? 'right' : 'left',
            }}>
              {h}
            </div>
          ))}
        </div>

        {/* Table body */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
            <div>Cargando facturas...</div>
          </div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <FileText size={48} style={{ color: 'var(--border)', marginBottom: '16px' }} />
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>
              No hay facturas
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '20px' }}>
              Crea tu primera factura para comenzar
            </div>
            <button
              onClick={() => setShowInvoiceForm(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px', background: 'var(--brand-primary)', color: 'white',
                border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={16} />
              Nueva Factura
            </button>
          </div>
        ) : (
          invoices.map((inv, i) => {
            const sc = statusConfig[inv.status] || statusConfig.borrador;
            return (
              <div
                key={inv.id}
                onClick={() => { setPreviewInvoiceId(inv.id); setShowPreview(true); }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 1.2fr 130px 100px 130px 80px',
                  padding: '14px 20px',
                  borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  {new Date(inv.date).toLocaleDateString('es-NI', { month: 'short', day: 'numeric', year: '2-digit' })}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                    {inv.customer?.name || 'Sin cliente'}
                  </div>
                  {inv.customer?.email && (
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{inv.customer.email}</div>
                  )}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-primary)' }}>
                  {inv.invoice_number}
                </div>
                <div>
                  <span style={{
                    fontSize: '11px', padding: '4px 10px', borderRadius: '20px',
                    fontWeight: 700, background: sc.bg, color: sc.text,
                    textTransform: 'capitalize',
                  }}>
                    {sc.label}
                  </span>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>
                  ${Number(inv.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setPreviewInvoiceId(inv.id); setShowPreview(true); }}
                    title="Ver"
                    style={{
                      padding: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                      borderRadius: '6px', cursor: 'pointer', color: 'var(--muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Eye size={14} />
                  </button>
                  {inv.status === 'borrador' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteInvoice(inv.id); }}
                      title="Eliminar"
                      style={{
                        padding: '6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: '6px', cursor: 'pointer', color: '#F87171',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '16px', padding: '0 4px',
        }}>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
            Mostrando {invoices.length} de {totalCount} facturas
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              style={{
                padding: '8px 12px', background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: '8px', cursor: page === 1 ? 'default' : 'pointer',
                color: page === 1 ? 'var(--border)' : 'var(--text)',
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px',
              }}
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <span style={{ fontSize: '13px', color: 'var(--muted)', padding: '0 8px' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              style={{
                padding: '8px 12px', background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: '8px', cursor: page === totalPages ? 'default' : 'pointer',
                color: page === totalPages ? 'var(--border)' : 'var(--text)',
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px',
              }}
            >
              Siguiente
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <InvoiceForm
        isOpen={showInvoiceForm}
        onClose={() => setShowInvoiceForm(false)}
        onSaved={refreshAll}
      />

      <InvoicePreview
        isOpen={showPreview}
        invoiceId={previewInvoiceId}
        onClose={() => { setShowPreview(false); setPreviewInvoiceId(null); }}
        onStatusChange={refreshAll}
      />
    </div>
  );
}
