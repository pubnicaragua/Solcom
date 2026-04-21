'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  AlertCircle,
  Database,
  Flame,
  Loader2,
  LineChart,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  UploadCloud,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { processRestockExcel } from '@/lib/restock-calculator';

interface RestockRow {
  item_id: string;
  sku: string;
  name: string;
  price: number;
  stock_total: number;
  sales_sum: number;
  weekly_avg: number;
  restock_sugerido: number;
  presupuesto: number;
}

interface TopSaleRow {
  item_id: string;
  sku: string;
  name: string;
  sales_sum: number;
  price: number;
}

interface PageNotice {
  type: 'error' | 'success' | 'info';
  text: string;
}

interface InsightTip {
  id: string;
  title: string;
  value: string;
  description: string;
}

export default function ComprasRestockPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<RestockRow[] | null>(null);
  const [topSales, setTopSales] = useState<TopSaleRow[]>([]);
  const [totalUnidades, setTotalUnidades] = useState(0);
  const [totalDinero, setTotalDinero] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyNeedsRestock, setOnlyNeedsRestock] = useState(true);
  const [mobileView, setMobileView] = useState(false);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [isGeneratePressed, setIsGeneratePressed] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (value: number) => `C$ ${Math.round(value).toLocaleString('es-NI')}`;

  useEffect(() => {
    const onResize = () => setMobileView(window.innerWidth < 980);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const fetchTopSales = () => {
      fetch('/api/compras/ventas-hoy')
        .then((r) => r.json())
        .then((json) => {
          if (json.success && json.data) {
            setTopSales(json.data);
          }
        })
        .catch((e) => {
          console.error('Error top sales:', e);
        });
    };

    // Cargar inmediatamente al montar
    fetchTopSales();

    // Auto-refresh cada 60 segundos
    const interval = setInterval(fetchTopSales, 60_000);
    return () => clearInterval(interval);
  }, []);

  const fetchLiveAnalytics = async () => {
    setIsProcessing(true);
    setNotice(null);

    try {
      const res = await fetch('/api/compras/restock?weeks=4');
      const json = await res.json();

      if (json.success && json.data) {
        setResults(json.data);

        let totalU = 0;
        let totalD = 0;
        json.data.forEach((r: RestockRow) => {
          totalU += Number(r.restock_sugerido);
          totalD += Number(r.presupuesto);
        });

        setTotalUnidades(totalU);
        setTotalDinero(totalD);
        setNotice({ type: 'success', text: `Analisis generado con ${json.data.length} referencias.` });
      } else {
        setNotice({ type: 'error', text: `Error al obtener analisis: ${json.error || 'Desconocido'}` });
      }
    } catch (error) {
      console.error('Error Fetch:', error);
      setNotice({ type: 'error', text: 'Hubo un error de conexion al generar el analisis.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSeedUpload = async (file: File) => {
    if (!file) return;

    setIsProcessing(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        setNotice(null);
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const targetSheetName = workbook.SheetNames.includes('Matriz') ? 'Matriz' : workbook.SheetNames[0];
        const sheet = workbook.Sheets[targetSheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const analisisAntiguo = processRestockExcel(jsonData);

        if (analisisAntiguo.rows.length === 0) {
          setNotice({ type: 'error', text: 'El Excel parece vacio o no coincide con el formato esperado.' });
          setIsProcessing(false);
          return;
        }

        const res = await fetch('/api/compras/restock/seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: analisisAntiguo.rows }),
        });

        const json = await res.json();

        if (json.success) {
          setNotice({ type: 'success', text: 'Historial inyectado correctamente. Ahora puedes generar el analisis.' });
        } else {
          setNotice({ type: 'error', text: `Fallo inyectando historial: ${json.error}` });
        }
        setIsProcessing(false);
      };

      reader.readAsBinaryString(file);
    } catch (error) {
      console.error(error);
      setNotice({ type: 'error', text: 'Hubo un error inyectando el historial.' });
      setIsProcessing(false);
    }
  };

  const filteredResults = useMemo(() => {
    if (!results) return [];

    return [...results]
      .filter((row) => (onlyNeedsRestock ? row.restock_sugerido > 0 : true))
      .filter((row) => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return true;
        return row.name.toLowerCase().includes(term) || row.sku.toLowerCase().includes(term);
      })
      .sort((a, b) => b.restock_sugerido - a.restock_sugerido);
  }, [results, onlyNeedsRestock, searchTerm]);

  const lowStockCount = useMemo(() => {
    if (!results) return 0;
    return results.filter((row) => row.stock_total <= row.weekly_avg).length;
  }, [results]);

  const insights = useMemo<InsightTip[]>(() => {
    const tips: InsightTip[] = [];

    if (topSales.length > 0) {
      const top = topSales[0];
      tips.push({
        id: 'top-sale',
        title: 'Producto con mayor salida hoy',
        value: `${top.sales_sum} uds`,
        description: `${top.name}. Conviene mantenerlo dentro del primer bloque de compra.`,
      });
    }

    if (results && results.length > 0) {
      const critical = results.filter((row) => row.stock_total <= row.weekly_avg && row.restock_sugerido > 0);
      if (critical.length > 0) {
        tips.push({
          id: 'critical',
          title: 'Riesgo de quiebre',
          value: `${critical.length} items`,
          description: 'Tienen cobertura menor a una semana; dejalos en prioridad alta.',
        });
      }

      const sortedByBudget = [...results].sort((a, b) => b.presupuesto - a.presupuesto);
      const top5Budget = sortedByBudget.slice(0, 5).reduce((sum, row) => sum + Number(row.presupuesto), 0);
      const budgetShare = totalDinero > 0 ? top5Budget / totalDinero : 0;
      if (budgetShare >= 0.45) {
        tips.push({
          id: 'budget-share',
          title: 'Concentracion de presupuesto',
          value: `${Math.round(budgetShare * 100)}%`,
          description: 'Se concentra en los 5 productos de mayor costo. Revisa volumen y margen.',
        });
      }

      const noRestockNeeded = results.filter((row) => row.restock_sugerido <= 0).length;
      if (noRestockNeeded > 0) {
        tips.push({
          id: 'restock-optimized',
          title: 'Items que no requieren compra',
          value: `${noRestockNeeded} refs`,
          description: 'Puedes pausar reposicion y mover presupuesto a referencias de mayor rotacion.',
        });
      }
    }

    return tips.slice(0, 4);
  }, [results, topSales, totalDinero]);

  const getPriorityMeta = (row: RestockRow) => {
    const weeklyAvg = row.weekly_avg > 0 ? row.weekly_avg : 1;
    const coverageWeeks = row.stock_total / weeklyAvg;

    if (coverageWeeks <= 0.8 || row.restock_sugerido >= weeklyAvg * 2) {
      return {
        label: 'Alta',
        color: '#fecaca',
        bg: 'rgba(239,68,68,0.18)',
        border: 'rgba(239,68,68,0.35)',
      };
    }

    if (coverageWeeks <= 1.6 || row.restock_sugerido > 0) {
      return {
        label: 'Media',
        color: '#fde68a',
        bg: 'rgba(245,158,11,0.16)',
        border: 'rgba(245,158,11,0.32)',
      };
    }

    return {
      label: 'Baja',
      color: '#bbf7d0',
      bg: 'rgba(16,185,129,0.16)',
      border: 'rgba(16,185,129,0.32)',
    };
  };

  const noticePalette: Record<PageNotice['type'], { bg: string; color: string; border: string }> = {
    error: { bg: 'rgba(239, 68, 68, 0.14)', color: '#fecaca', border: 'rgba(239, 68, 68, 0.28)' },
    success: { bg: 'rgba(16, 185, 129, 0.14)', color: '#bbf7d0', border: 'rgba(16, 185, 129, 0.28)' },
    info: { bg: 'rgba(59, 130, 246, 0.14)', color: '#bfdbfe', border: 'rgba(59, 130, 246, 0.28)' },
  };

  const shellStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: mobileView ? '1fr' : '320px 1fr',
    gap: 18,
    paddingBottom: 40,
  };

  const primaryActionButtonStyle: React.CSSProperties = {
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: 12,
    fontWeight: 700,
    border: '1px solid rgba(96,165,250,0.55)',
    background: isProcessing
      ? 'linear-gradient(135deg, rgba(37,99,235,0.85), rgba(29,78,216,0.9))'
      : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    boxShadow: isGeneratePressed
      ? '0 6px 18px rgba(37,99,235,0.35)'
      : '0 12px 28px rgba(37,99,235,0.35)',
    transform: isGeneratePressed ? 'scale(0.98)' : 'scale(1)',
    transition: 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 200ms cubic-bezier(0.23, 1, 0.32, 1)',
  };

  const iconStyle: React.CSSProperties = {
    display: 'block',
    flexShrink: 0,
  };

  const buttonContentStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    lineHeight: 1,
  };

  return (
    <div style={shellStyle}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleSeedUpload(file);
        }}
      />

      <Card
        style={{
          position: mobileView ? 'static' : 'sticky',
          top: 88,
          alignSelf: 'start',
          border: '1px solid rgba(255,255,255,0.08)',
          background:
            'radial-gradient(circle at top left, rgba(37, 99, 235, 0.2), rgba(15, 23, 42, 0.98) 45%), linear-gradient(180deg, #0b1220, #080d17)',
        }}
      >
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: 'rgba(59,130,246,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShoppingCart size={18} color="#93c5fd" />
              </div>
              <span style={{ color: '#bfdbfe', fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>PANEL DE COMPRAS</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2, color: '#f8fafc', fontWeight: 800 }}>Restock inteligente</h1>
            <p style={{ margin: '9px 0 0 0', color: '#94a3b8', fontSize: 13, lineHeight: 1.55 }}>
              Genera una propuesta de compra clara y priorizada usando las ultimas 4 semanas de ventas.
            </p>
          </div>

          <div
            style={{
              border: '1px solid rgba(148,163,184,0.2)',
              background: 'rgba(15,23,42,0.65)',
              borderRadius: 14,
              padding: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Unidades sugeridas</div>
              <div style={{ color: '#f8fafc', fontSize: 22, fontWeight: 800 }}>{Math.round(totalUnidades).toLocaleString()}</div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Presupuesto</div>
              <div style={{ color: '#86efac', fontSize: 22, fontWeight: 800 }}>{formatCurrency(totalDinero)}</div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Refs visibles</div>
              <div style={{ color: '#f8fafc', fontSize: 20, fontWeight: 700 }}>{filteredResults.length}</div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Stock critico</div>
              <div style={{ color: '#fca5a5', fontSize: 20, fontWeight: 700 }}>{lowStockCount}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <Button
              variant="primary"
              onClick={fetchLiveAnalytics}
              disabled={isProcessing}
              onMouseDown={() => setIsGeneratePressed(true)}
              onMouseUp={() => setIsGeneratePressed(false)}
              onMouseLeave={() => setIsGeneratePressed(false)}
              onBlur={() => setIsGeneratePressed(false)}
              style={primaryActionButtonStyle}
            >
              {isProcessing ? (
                <span style={buttonContentStyle}>
                  <Loader2 size={16} className="animate-spin" style={iconStyle} />
                  Procesando analisis...
                </span>
              ) : (
                <span style={buttonContentStyle}>
                  <RefreshCw size={16} style={iconStyle} />
                  Generar analisis en vivo
                </span>
              )}
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isProcessing} style={{ justifyContent: 'center' }}>
              <UploadCloud size={15} style={{ marginRight: 6 }} /> Cargar historial Excel
            </Button>
          </div>

          <div
            style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(15,23,42,0.55)',
              padding: '10px 12px',
              color: '#94a3b8',
              fontSize: 12,
            }}
          >
            Consejo: usa el filtro de reposicion y ordena por prioridad para mandar compras mas rapido.
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {notice && (
          <div
            style={{
              border: `1px solid ${noticePalette[notice.type].border}`,
              background: noticePalette[notice.type].bg,
              color: noticePalette[notice.type].color,
              borderRadius: 12,
              padding: '11px 14px',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={15} />
            {notice.text}
          </div>
        )}

        {topSales.length > 0 && (
          <Card
            style={{
              border: '1px solid rgba(239,68,68,0.22)',
              background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.28), rgba(9, 9, 11, 0.88) 52%)',
            }}
          >
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Flame size={18} color="#f87171" />
                <h3 style={{ margin: 0, color: '#fecaca', fontSize: 14, fontWeight: 700 }}>Top ventas del dia</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: mobileView ? '1fr' : 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
                {topSales.slice(0, 5).map((sale, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: '1px solid rgba(248,113,113,0.28)',
                      borderRadius: 12,
                      padding: 12,
                      background: 'rgba(127,29,29,0.25)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ color: '#fda4af', fontSize: 11, fontWeight: 700 }}>#{idx + 1}</span>
                      <span style={{ color: '#fecaca', fontSize: 12, fontWeight: 700 }}>{sale.sales_sum} uds</span>
                    </div>
                    <div style={{ color: '#fff1f2', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sale.name}
                    </div>
                    <div style={{ color: '#fda4af', fontSize: 12, marginTop: 4 }}>{formatCurrency(sale.price * sale.sales_sum)}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {insights.length > 0 && (
          <Card style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <LineChart size={16} color="#93c5fd" />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Radar de compra</h3>
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 10, gridTemplateColumns: mobileView ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
              {insights.map((tip) => (
                <div
                  key={tip.id}
                  style={{
                    borderRadius: 12,
                    padding: '12px 13px',
                    border: '1px solid rgba(148,163,184,0.22)',
                    background: 'linear-gradient(180deg, rgba(15,23,42,0.75), rgba(15,23,42,0.45))',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 650 }}>{tip.title}</div>
                    <div style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{tip.value}</div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>{tip.description}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {!results && (
          <Card
            style={{
              border: '1px dashed rgba(148,163,184,0.3)',
              background: 'linear-gradient(160deg, rgba(15,23,42,0.95), rgba(3,7,18,0.98))',
            }}
          >
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 999,
                  background: 'rgba(59,130,246,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 18px',
                }}
              >
                <Database size={34} color="#60a5fa" />
              </div>
              <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 21, fontWeight: 700 }}>Genera tu propuesta de compra</h3>
              <p style={{ margin: '10px auto 0 auto', maxWidth: 520, color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
                Carga historial en Excel o usa datos en vivo de Zoho para ver prioridades, presupuesto y productos con mayor urgencia.
              </p>
              <div style={{ marginTop: 18 }}>
                <Button
                  variant="primary"
                  onClick={fetchLiveAnalytics}
                  disabled={isProcessing}
                  style={{ ...primaryActionButtonStyle, minHeight: 44, paddingInline: 20 }}
                >
                  {isProcessing ? (
                    <span style={buttonContentStyle}>
                      <Loader2 size={16} className="animate-spin" style={iconStyle} />
                      Procesando analisis...
                    </span>
                  ) : (
                    <span style={buttonContentStyle}>
                      <RefreshCw size={16} style={iconStyle} />
                      Generar analisis en vivo
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {results && (
          <Card style={{ border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div
              style={{
                padding: '16px 18px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'grid',
                gridTemplateColumns: mobileView ? '1fr' : '1fr auto',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: mobileView ? '1fr' : '1fr auto', gap: 10, alignItems: 'center' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 10,
                    padding: '10px 12px',
                  }}
                >
                  <Search size={15} color="#94a3b8" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre o SKU"
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text)',
                      outline: 'none',
                      fontSize: 13,
                    }}
                  />
                </div>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    color: '#94a3b8',
                    fontSize: 13,
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    width: 'fit-content',
                  }}
                >
                  <SlidersHorizontal size={14} />
                  <input type="checkbox" checked={onlyNeedsRestock} onChange={(e) => setOnlyNeedsRestock(e.target.checked)} />
                  Solo reposicion
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={fetchLiveAnalytics}>
                  <RefreshCw size={14} style={{ marginRight: 6 }} /> Refrescar
                </Button>
                <Button variant="secondary" onClick={() => setResults(null)}>
                  Limpiar
                </Button>
                <Button variant="primary" style={{ gap: 8 }}>
                  <Send size={15} /> Enviar al bot
                </Button>
              </div>
            </div>

            {!mobileView ? (
              <div style={{ overflowX: 'auto', maxHeight: 620, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead style={{ background: 'rgba(255,255,255,0.02)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: '14px 18px', color: 'var(--muted)', fontWeight: 600 }}>Producto</th>
                      <th style={{ padding: '14px 18px', color: 'var(--muted)', fontWeight: 600, textAlign: 'center' }}>Prioridad</th>
                      <th style={{ padding: '14px 18px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>Ventas</th>
                      <th style={{ padding: '14px 18px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>Sugerido</th>
                      <th style={{ padding: '14px 18px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>P. Unitario</th>
                      <th style={{ padding: '14px 18px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 34, textAlign: 'center', color: 'var(--muted)' }}>
                          No hay resultados con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredResults.map((row, idx) => (
                        (() => {
                          const priority = getPriorityMeta(row);
                          const isHovered = hoveredItemId === row.item_id;
                          return (
                        <tr
                          key={idx}
                          onMouseEnter={() => setHoveredItemId(row.item_id)}
                          onMouseLeave={() => setHoveredItemId(null)}
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            background: isHovered ? 'rgba(59,130,246,0.08)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                            transition: 'background-color 180ms cubic-bezier(0.23, 1, 0.32, 1)',
                          }}
                        >
                          <td style={{ padding: '13px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={{
                                  minWidth: 24,
                                  height: 24,
                                  borderRadius: 999,
                                  background: 'rgba(59,130,246,0.18)',
                                  border: '1px solid rgba(59,130,246,0.28)',
                                  color: '#bfdbfe',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                #{idx + 1}
                              </span>
                              <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{row.name}</div>
                            </div>
                            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>
                              SKU: {row.sku} | Stock actual: {row.stock_total}
                            </div>
                          </td>
                          <td style={{ padding: '13px 18px', textAlign: 'center' }}>
                            <span
                              style={{
                                color: priority.color,
                                background: priority.bg,
                                border: `1px solid ${priority.border}`,
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontWeight: 700,
                                fontSize: 12,
                              }}
                            >
                              {priority.label}
                            </span>
                          </td>
                          <td style={{ padding: '13px 18px', color: '#cbd5e1', textAlign: 'right' }}>{row.sales_sum} uds</td>
                          <td style={{ padding: '13px 18px', textAlign: 'right' }}>
                            <span
                              style={{
                                color: '#93c5fd',
                                background: 'rgba(59,130,246,0.14)',
                                border: '1px solid rgba(59,130,246,0.25)',
                                padding: '4px 8px',
                                borderRadius: 999,
                                fontWeight: 700,
                              }}
                            >
                              {Math.round(row.restock_sugerido)} uds
                            </span>
                          </td>
                          <td style={{ padding: '13px 18px', color: '#cbd5e1', textAlign: 'right' }}>
                            {row.price ? formatCurrency(row.price) : '-'}
                          </td>
                          <td style={{ padding: '13px 18px', color: '#86efac', fontWeight: 700, textAlign: 'right' }}>
                            {formatCurrency(row.presupuesto)}
                          </td>
                        </tr>
                          );
                        })()
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10, padding: 12 }}>
                {filteredResults.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>No hay resultados con los filtros aplicados.</div>
                ) : (
                  filteredResults.map((row, idx) => (
                    <div
                      key={idx}
                      style={{
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 12,
                        padding: 12,
                        background: 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>{row.name}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>SKU: {row.sku}</div>
                      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                        <MiniStat label="Ventas" value={`${row.sales_sum} uds`} icon={<TrendingUp size={13} color="#93c5fd" />} />
                        <MiniStat label="Stock" value={`${row.stock_total}`} icon={<Database size={13} color="#cbd5e1" />} />
                        <MiniStat label="Sugerido" value={`${Math.round(row.restock_sugerido)} uds`} icon={<ShoppingCart size={13} color="#93c5fd" />} />
                        <MiniStat label="Total" value={formatCurrency(row.presupuesto)} icon={<Flame size={13} color="#86efac" />} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: '8px 9px',
        background: 'rgba(15,23,42,0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, color: '#94a3b8', fontSize: 11 }}>
        {icon}
        {label}
      </div>
      <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
