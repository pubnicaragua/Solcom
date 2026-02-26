'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  RefreshCw,
  CheckCircle,
  Clock,
  Edit3,
  Trash2,
  ArrowRightLeft,
  ArrowLeft,
} from 'lucide-react';
import QuoteForm from '@/components/ventas/QuoteForm';

type QuoteStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'vencida' | 'convertida';

interface Quote {
  id: string;
  quote_number: string;
  customer_id: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null; ruc: string | null } | null;
  date: string;
  valid_until: string | null;
  status: QuoteStatus;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  notes: string | null;
  template_key: string | null;
  converted_invoice_id: string | null;
  created_at: string;
}

interface QuoteDetail extends Quote {
  warehouse_id: string | null;
  items: Array<{
    item_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    discount_percent: number;
  }>;
}

const STATUS_TABS: Array<{ key: 'todas' | QuoteStatus; label: string }> = [
  { key: 'todas', label: 'Todas' },
  { key: 'borrador', label: 'Borrador' },
  { key: 'enviada', label: 'Enviadas' },
  { key: 'aceptada', label: 'Aceptadas' },
  { key: 'rechazada', label: 'Rechazadas' },
  { key: 'vencida', label: 'Vencidas' },
  { key: 'convertida', label: 'Convertidas' },
];

const statusConfig: Record<QuoteStatus, { bg: string; text: string; label: string }> = {
  borrador: { bg: 'rgba(107,114,128,0.15)', text: '#9CA3AF', label: 'Borrador' },
  enviada: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA', label: 'Enviada' },
  aceptada: { bg: 'rgba(16,185,129,0.15)', text: '#34D399', label: 'Aceptada' },
  rechazada: { bg: 'rgba(239,68,68,0.15)', text: '#F87171', label: 'Rechazada' },
  vencida: { bg: 'rgba(245,158,11,0.15)', text: '#FBBF24', label: 'Vencida' },
  convertida: { bg: 'rgba(168,85,247,0.18)', text: '#C084FC', label: 'Convertida' },
};

export default function CotizacionesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'todas' | QuoteStatus>('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState('');

  const [kpis, setKpis] = useState({
    totalCotizado: 0,
    enviadas: 0,
    aceptadas: 0,
    convertidas: 0,
  });

  const [showForm, setShowForm] = useState(false);
  const [editQuote, setEditQuote] = useState<QuoteDetail | null>(null);

  useEffect(() => {
    void fetchQuotes();
  }, [activeTab, searchTerm, fromDate, toDate, page]);

  useEffect(() => {
    void fetchKpis();
  }, []);

  async function fetchQuotes() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (activeTab !== 'todas') params.set('status', activeTab);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      params.set('page', String(page));
      params.set('per_page', '15');

      const response = await fetch(`/api/ventas/quotes?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'No se pudieron cargar cotizaciones.');

      setQuotes(Array.isArray(data.quotes) ? data.quotes : []);
      setTotalPages(Math.max(1, Number(data.total_pages || 1)));
      setTotalCount(Math.max(0, Number(data.total || 0)));
    } catch (err: any) {
      setQuotes([]);
      setError(err?.message || 'No se pudieron cargar cotizaciones.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchKpis() {
    try {
      const response = await fetch('/api/ventas/quotes?per_page=999', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'No se pudieron cargar métricas.');

      const all: Quote[] = Array.isArray(data.quotes) ? data.quotes : [];
      setKpis({
        totalCotizado: all.reduce((sum, quote) => sum + Number(quote.total || 0), 0),
        enviadas: all.filter((quote) => quote.status === 'enviada').length,
        aceptadas: all.filter((quote) => quote.status === 'aceptada').length,
        convertidas: all.filter((quote) => quote.status === 'convertida').length,
      });
    } catch {
      setKpis({ totalCotizado: 0, enviadas: 0, aceptadas: 0, convertidas: 0 });
    }
  }

  function refreshAll() {
    void fetchQuotes();
    void fetchKpis();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta cotización?')) return;

    try {
      const response = await fetch(`/api/ventas/quotes/${id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'No se pudo eliminar la cotización.');
      refreshAll();
    } catch (err: any) {
      alert(err?.message || 'No se pudo eliminar la cotización.');
    }
  }

  async function handleConvert(id: string) {
    if (!confirm('¿Convertir esta cotización a factura borrador?')) return;

    try {
      const response = await fetch(`/api/ventas/quotes/${id}/convert`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'No se pudo convertir la cotización.');
      refreshAll();
      alert(`Cotización convertida correctamente. Factura creada: ${data?.invoice_number || 'N/A'}`);
    } catch (err: any) {
      alert(err?.message || 'No se pudo convertir la cotización.');
    }
  }

  async function handleEdit(id: string) {
    try {
      const response = await fetch(`/api/ventas/quotes/${id}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.quote) {
        throw new Error(data?.error || 'No se pudo abrir la cotización.');
      }

      setEditQuote(data.quote as QuoteDetail);
      setShowForm(true);
    } catch (err: any) {
      alert(err?.message || 'No se pudo abrir la cotización.');
    }
  }

  async function updateStatus(id: string, status: QuoteStatus) {
    try {
      const response = await fetch(`/api/ventas/quotes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'No se pudo actualizar estado.');
      refreshAll();
    } catch (err: any) {
      alert(err?.message || 'No se pudo actualizar estado.');
    }
  }

  const kpiCards = [
    {
      label: 'Total Cotizado',
      value: `$${kpis.totalCotizado.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      icon: FileText,
      color: '#3B82F6',
      bg: 'rgba(59,130,246,0.08)',
    },
    {
      label: 'Enviadas',
      value: String(kpis.enviadas),
      icon: Clock,
      color: '#60A5FA',
      bg: 'rgba(59,130,246,0.08)',
    },
    {
      label: 'Aceptadas',
      value: String(kpis.aceptadas),
      icon: CheckCircle,
      color: '#10B981',
      bg: 'rgba(16,185,129,0.08)',
    },
    {
      label: 'Convertidas',
      value: String(kpis.convertidas),
      icon: ArrowRightLeft,
      color: '#A855F7',
      bg: 'rgba(168,85,247,0.1)',
    },
  ];

  return (
    <div style={{ color: 'var(--text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ marginBottom: 8 }}>
            <Link href="/ventas" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              <ArrowLeft size={14} /> Volver a Facturación
            </Link>
          </div>
          <h1 className="h-title" style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={24} style={{ color: '#3B82F6' }} />
            Cotizaciones
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>
            Crea cotizaciones, da seguimiento y conviértelas a factura.
          </p>
        </div>

        <button
          onClick={() => {
            setEditQuote(null);
            setShowForm(true);
          }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '11px 20px', background: '#3B82F6', color: 'white',
            border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Plus size={17} /> Nueva Cotización
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        {kpiCards.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <div
              key={index}
              style={{
                background: 'var(--card)',
                padding: 18,
                borderRadius: 12,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: kpi.bg,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={18} style={{ color: kpi.color }} />
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>{kpi.label}</div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{kpi.value}</div>
            </div>
          );
        })}
      </div>

      <div style={{
        display: 'flex', gap: 4, marginBottom: 16,
        background: 'var(--card)', padding: 4, borderRadius: 12,
        border: '1px solid var(--border)', overflowX: 'auto',
      }}>
        {STATUS_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setPage(1);
              }}
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '10px 15px',
                cursor: 'pointer',
                background: isActive ? '#3B82F6' : 'transparent',
                color: isActive ? 'white' : 'var(--muted)',
                fontSize: 13,
                fontWeight: isActive ? 700 : 600,
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{
        background: 'var(--card)', padding: '14px 16px', borderRadius: 12,
        marginBottom: 16, border: '1px solid var(--border)',
        display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 260px' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>Buscar</label>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }} />
            <input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Número de cotización o nota..."
              style={{
                width: '100%', padding: '9px 12px 9px 32px',
                borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--background)', color: 'var(--text)',
              }}
            />
          </div>
        </div>

        <div style={{ flex: '0 0 160px' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>Desde</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text)' }}
          />
        </div>

        <div style={{ flex: '0 0 160px' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>Hasta</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text)' }}
          />
        </div>

        <button
          onClick={refreshAll}
          style={{
            padding: '9px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--muted)',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div style={{
          marginBottom: 14,
          border: '1px solid rgba(239,68,68,0.45)',
          background: 'rgba(127,29,29,0.3)',
          color: '#FCA5A5',
          borderRadius: 10,
          padding: '10px 12px',
          fontSize: 13,
          fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '110px 1.2fr 150px 120px 140px 220px',
          padding: '13px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.03)',
        }}>
          {['Fecha', 'Cliente', 'Número', 'Estado', 'Total', 'Acciones'].map((header, index) => (
            <div
              key={header}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                textAlign: index === 4 ? 'right' : 'left',
              }}
            >
              {header}
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 56, textAlign: 'center', color: 'var(--muted)' }}>
            <RefreshCw size={22} style={{ marginBottom: 10, animation: 'spin 1s linear infinite' }} />
            <div>Cargando cotizaciones...</div>
          </div>
        ) : quotes.length === 0 ? (
          <div style={{ padding: 56, textAlign: 'center' }}>
            <FileText size={48} style={{ color: 'var(--border)', marginBottom: 12 }} />
            <div style={{ color: 'var(--muted)', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              No hay cotizaciones
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Crea la primera cotización para iniciar el flujo.</div>
          </div>
        ) : (
          quotes.map((quote, index) => {
            const sc = statusConfig[quote.status] || statusConfig.borrador;
            return (
              <div
                key={quote.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 1.2fr 150px 120px 140px 220px',
                  padding: '13px 16px',
                  borderBottom: index < quotes.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {new Date(quote.date).toLocaleDateString('es-NI', { month: 'short', day: 'numeric', year: '2-digit' })}
                </div>

                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{quote.customer?.name || 'Sin cliente'}</div>
                  {quote.valid_until && (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Válida hasta {new Date(quote.valid_until).toLocaleDateString('es-NI')}</div>
                  )}
                </div>

                <div style={{ fontSize: 13, fontWeight: 700, color: '#60A5FA' }}>{quote.quote_number}</div>

                <div>
                  <select
                    value={quote.status}
                    onChange={(e) => updateStatus(quote.id, e.target.value as QuoteStatus)}
                    disabled={quote.status === 'convertida'}
                    style={{
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: sc.bg,
                      color: sc.text,
                      padding: '5px 8px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: quote.status === 'convertida' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <option value="borrador">Borrador</option>
                    <option value="enviada">Enviada</option>
                    <option value="aceptada">Aceptada</option>
                    <option value="rechazada">Rechazada</option>
                    <option value="vencida">Vencida</option>
                    {quote.status === 'convertida' && <option value="convertida">Convertida</option>}
                  </select>
                </div>

                <div style={{ fontSize: 16, fontWeight: 800, textAlign: 'right' }}>
                  ${Number(quote.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button
                    onClick={() => handleEdit(quote.id)}
                    title="Editar"
                    style={{
                      width: 32, height: 32, borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'var(--muted)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Edit3 size={14} />
                  </button>

                  <button
                    onClick={() => handleConvert(quote.id)}
                    disabled={quote.status === 'convertida'}
                    title={quote.status === 'convertida' ? 'Ya convertida' : 'Convertir a factura'}
                    style={{
                      width: 32, height: 32, borderRadius: 7,
                      border: '1px solid rgba(168,85,247,0.5)',
                      background: quote.status === 'convertida' ? 'rgba(168,85,247,0.1)' : 'rgba(168,85,247,0.2)',
                      color: '#C084FC',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      cursor: quote.status === 'convertida' ? 'not-allowed' : 'pointer',
                      opacity: quote.status === 'convertida' ? 0.65 : 1,
                    }}
                  >
                    <ArrowRightLeft size={14} />
                  </button>

                  <button
                    onClick={() => handleDelete(quote.id)}
                    disabled={quote.status === 'convertida'}
                    title={quote.status === 'convertida' ? 'No se puede eliminar convertida' : 'Eliminar'}
                    style={{
                      width: 32, height: 32, borderRadius: 7,
                      border: '1px solid rgba(239,68,68,0.35)',
                      background: 'rgba(239,68,68,0.12)',
                      color: '#F87171',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      cursor: quote.status === 'convertida' ? 'not-allowed' : 'pointer',
                      opacity: quote.status === 'convertida' ? 0.5 : 1,
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div style={{
          marginTop: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'var(--muted)',
          fontSize: 13,
        }}>
          <div>Mostrando {quotes.length} de {totalCount} cotizaciones</div>
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
              style={{
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: page === 1 ? 'var(--border)' : 'var(--text)',
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Anterior
            </button>

            <span>{page} / {totalPages}</span>

            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
              style={{
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: page === totalPages ? 'var(--border)' : 'var(--text)',
                cursor: page === totalPages ? 'not-allowed' : 'pointer',
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      <QuoteForm
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditQuote(null);
        }}
        onSaved={refreshAll}
        editQuote={editQuote}
      />
    </div>
  );
}
