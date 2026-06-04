'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  SlidersHorizontal,
  TrendingDown,
  UploadCloud,
  Wallet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { processRestockExcel } from '@/lib/restock-calculator';
import AIAssistant from '@/components/compras/AIAssistant';

interface RestockRow {
  item_id: string;
  sku: string;
  name: string;
  marca?: string | null;
  category?: string | null;
  color?: string | null;
  price: number;
  stock_total: number;
  sales_sum: number;
  weekly_avg: number;
  restock_sugerido: number;
  presupuesto: number;
}

interface PageNotice {
  type: 'error' | 'success' | 'info';
  text: string;
}

export default function ComprasRestockPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<RestockRow[] | null>(null);
  const [totalUnidades, setTotalUnidades] = useState(0);
  const [totalDinero, setTotalDinero] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [onlyNeedsRestock, setOnlyNeedsRestock] = useState(true);
  const [mobileView, setMobileView] = useState(false);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [isGeneratePressed, setIsGeneratePressed] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [aiOpenSignal, setAiOpenSignal] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (value: number) => `C$ ${Math.round(value).toLocaleString('es-NI')}`;

  useEffect(() => {
    const onResize = () => setMobileView(window.innerWidth < 980);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const fetchLiveAnalytics = async () => {
    setIsProcessing(true);
    setNotice(null);

    try {
      const res = await fetch('/api/compras/restock?weeks=4&max_pages=20&per_page=200', { cache: 'no-store' });
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
        setNotice({ type: 'success', text: `Análisis generado con ${json.data.length} referencias.` });
      } else {
        setNotice({ type: 'error', text: `Error al obtener análisis: ${json.error || 'Desconocido'}` });
      }
    } catch (error) {
      console.error('Error Fetch:', error);
      setNotice({ type: 'error', text: 'Hubo un error de conexión al generar el análisis.' });
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
          setNotice({ type: 'error', text: 'El Excel parece vacío o no coincide con el formato esperado.' });
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
          setNotice({ type: 'success', text: 'Historial inyectado correctamente. Ahora puedes generar el análisis.' });
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

  const brandOptions = useMemo(() => {
    if (!results) return [];
    const values = new Set<string>();
    results.forEach((row) => {
      const value = String(row.marca || '').trim();
      if (value) values.add(value);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'es'));
  }, [results]);

  const categoryOptions = useMemo(() => {
    if (!results) return [];
    const values = new Set<string>();
    results.forEach((row) => {
      const value = String(row.category || '').trim();
      if (value) values.add(value);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'es'));
  }, [results]);

  useEffect(() => {
    if (selectedBrand !== 'all' && !brandOptions.includes(selectedBrand)) {
      setSelectedBrand('all');
    }
  }, [brandOptions, selectedBrand]);

  useEffect(() => {
    if (selectedCategory !== 'all' && !categoryOptions.includes(selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categoryOptions, selectedCategory]);

  const filteredResults = useMemo(() => {
    if (!results) return [];

    return [...results]
      .filter((row) => (onlyNeedsRestock ? row.restock_sugerido > 0 : true))
      .filter((row) => (selectedBrand === 'all' ? true : String(row.marca || '').trim() === selectedBrand))
      .filter((row) => (selectedCategory === 'all' ? true : String(row.category || '').trim() === selectedCategory))
      .filter((row) => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return true;
        return row.name.toLowerCase().includes(term)
          || row.sku.toLowerCase().includes(term)
          || String(row.marca || '').toLowerCase().includes(term)
          || String(row.category || '').toLowerCase().includes(term)
          || String(row.color || '').toLowerCase().includes(term);
      })
      .sort((a, b) => b.restock_sugerido - a.restock_sugerido);
  }, [results, onlyNeedsRestock, selectedBrand, selectedCategory, searchTerm]);

  // Derived metrics for the dashboard
  const kpis = useMemo(() => {
    if (!results) return { critical: 0, healthy: 0, overstocked: 0, budgetCritical: 0 };
    
    let critical = 0;
    let healthy = 0;
    let overstocked = 0;
    let budgetCritical = 0;

    results.forEach((row) => {
      const weeklyAvg = row.weekly_avg > 0 ? row.weekly_avg : 0.1; // avoid div by 0
      const weeksCoverage = row.stock_total / weeklyAvg;

      if (row.stock_total === 0 && row.weekly_avg > 0) {
        critical++;
        budgetCritical += row.presupuesto;
      } else if (weeksCoverage <= 1.5) {
        critical++;
        budgetCritical += row.presupuesto;
      } else if (weeksCoverage > 1.5 && weeksCoverage <= 4) {
        healthy++;
      } else if (weeksCoverage > 4) {
        overstocked++;
      }
    });

    return { critical, healthy, overstocked, budgetCritical };
  }, [results]);

  const getCoverageStatus = (row: RestockRow) => {
    const weeklyAvg = row.weekly_avg > 0 ? row.weekly_avg : 0.1;
    const coverageWeeks = row.stock_total / weeklyAvg;

    if (row.stock_total === 0 && row.weekly_avg > 0) {
      return { label: 'Agotado', color: '#ef4444', icon: AlertCircle, bg: 'rgba(239,68,68,0.1)' };
    }
    if (coverageWeeks <= 1.5) {
      return { label: 'Crítico', color: '#f59e0b', icon: AlertTriangle, bg: 'rgba(245,158,11,0.1)' };
    }
    if (coverageWeeks <= 4) {
      return { label: 'Sano', color: '#10b981', icon: CheckCircle2, bg: 'rgba(16,185,129,0.1)' };
    }
    return { label: 'Exceso', color: '#3b82f6', icon: TrendingDown, bg: 'rgba(59,130,246,0.1)' };
  };

  const noticePalette: Record<PageNotice['type'], { bg: string; color: string; border: string }> = {
    error: { bg: 'rgba(239, 68, 68, 0.14)', color: '#fecaca', border: 'rgba(239, 68, 68, 0.28)' },
    success: { bg: 'rgba(16, 185, 129, 0.14)', color: '#bbf7d0', border: 'rgba(16, 185, 129, 0.28)' },
    info: { bg: 'rgba(59, 130, 246, 0.14)', color: '#bfdbfe', border: 'rgba(59, 130, 246, 0.28)' },
  };

  const shellStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
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
    transition: 'all 200ms ease',
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

      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#f8fafc', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'rgba(59,130,246,0.2)', padding: 8, borderRadius: 12 }}>
              <ShoppingCart size={24} color="#60a5fa" />
            </div>
            Estrategia de Compras
          </h1>
          <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: 14 }}>
            Análisis de cobertura de inventario basado en ventas reales.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
            <UploadCloud size={16} style={{ marginRight: 6 }} /> Subir Historial
          </Button>
          <Button
            variant="primary"
            onClick={fetchLiveAnalytics}
            disabled={isProcessing}
            style={primaryActionButtonStyle}
            onMouseDown={() => setIsGeneratePressed(true)}
            onMouseUp={() => setIsGeneratePressed(false)}
            onMouseLeave={() => setIsGeneratePressed(false)}
          >
            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span style={{ marginLeft: 8 }}>Actualizar Análisis</span>
          </Button>
        </div>
      </div>

      {notice && (
        <div
          style={{
            border: `1px solid ${noticePalette[notice.type].border}`,
            background: noticePalette[notice.type].bg,
            color: noticePalette[notice.type].color,
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AlertCircle size={18} />
          {notice.text}
        </div>
      )}

      {/* DASHBOARD KPIs */}
      {results && (
        <div style={{ display: 'grid', gridTemplateColumns: mobileView ? '1fr' : 'repeat(4, 1fr)', gap: 16 }}>
          <Card style={{ padding: 20, border: '1px solid rgba(59,130,246,0.2)', background: 'rgba(15,23,42,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ background: 'rgba(59,130,246,0.1)', padding: 8, borderRadius: 8 }}><Wallet size={20} color="#60a5fa" /></div>
              <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Presupuesto Sugerido</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc' }}>{formatCurrency(totalDinero)}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Para reponer {Math.round(totalUnidades)} unidades</div>
          </Card>

          <Card style={{ padding: 20, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(15,23,42,0.6)' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ background: 'rgba(239,68,68,0.1)', padding: 8, borderRadius: 8 }}><AlertTriangle size={20} color="#f87171" /></div>
              <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Ítems Críticos</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#fca5a5' }}>{kpis.critical}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Riesgo inminente de quiebre</div>
          </Card>

          <Card style={{ padding: 20, border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(15,23,42,0.6)' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ background: 'rgba(16,185,129,0.1)', padding: 8, borderRadius: 8 }}><CheckCircle2 size={20} color="#34d399" /></div>
              <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Ítems Sanos</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#6ee7b7' }}>{kpis.healthy}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Cobertura adecuada (1.5 - 4 sem.)</div>
          </Card>

           <Card style={{ padding: 20, border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(15,23,42,0.6)' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ background: 'rgba(99,102,241,0.1)', padding: 8, borderRadius: 8 }}><TrendingDown size={20} color="#818cf8" /></div>
              <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Sobre-Stock</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#a5b4fc' }}>{kpis.overstocked}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Más de 4 semanas de cobertura</div>
          </Card>
        </div>
      )}

      {/* TABLE SECTION */}
      {results ? (
        <Card style={{ border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: 16,
              background: 'rgba(15,23,42,0.4)',
            }}
          >
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '8px 14px',
                  flex: mobileView ? 1 : '0 1 300px',
                }}
              >
                <Search size={16} color="#94a3b8" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar producto o SKU..."
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: '#f8fafc',
                    outline: 'none',
                    fontSize: 14,
                  }}
                />
              </div>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  color: '#e2e8f0',
                  fontSize: 14,
                  padding: '8px 12px',
                  minWidth: 170,
                }}
              >
                <option value="all">Todas las marcas</option>
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  color: '#e2e8f0',
                  fontSize: 14,
                  padding: '8px 12px',
                  minWidth: 190,
                }}
              >
                <option value="all">Todas las categorias</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#e2e8f0',
                  fontSize: 14,
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  background: onlyNeedsRestock ? 'rgba(59,130,246,0.1)' : 'transparent',
                }}
              >
                <SlidersHorizontal size={16} color={onlyNeedsRestock ? '#60a5fa' : '#94a3b8'} />
                <input type="checkbox" checked={onlyNeedsRestock} onChange={(e) => setOnlyNeedsRestock(e.target.checked)} style={{ display: 'none' }} />
                Mostrar solo requeridos
              </label>
            </div>
            
            <Button variant="primary" style={{ gap: 8, background: '#4f46e5', border: 'none' }} onClick={() => setAiOpenSignal((prev) => prev + 1)}>
              <Send size={16} /> Compartir con IA
            </Button>
          </div>

          {/* Table */}
          {!mobileView ? (
            <div style={{ overflowX: 'auto', maxHeight: 600 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
                <thead style={{ background: 'rgba(15,23,42,0.9)', position: 'sticky', top: 0, zIndex: 1, backdropFilter: 'blur(8px)' }}>
                  <tr>
                    <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Producto</th>
                    <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Estado</th>
                    <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Ventas (4 sem)</th>
                    <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Stock Actual</th>
                    <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Sugerido</th>
                    <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Inversión</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                        No hay productos que coincidan con los filtros.
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((row) => {
                      const status = getCoverageStatus(row);
                      const StatusIcon = status.icon;
                      const isHovered = hoveredItemId === row.item_id;

                      return (
                        <tr
                          key={row.item_id}
                          onMouseEnter={() => setHoveredItemId(row.item_id)}
                          onMouseLeave={() => setHoveredItemId(null)}
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                            background: isHovered ? 'rgba(255,255,255,0.02)' : 'transparent',
                            transition: 'background-color 150ms ease',
                          }}
                        >
                          <td style={{ padding: '14px 20px' }}>
                            <div style={{ color: '#f8fafc', fontWeight: 600, marginBottom: 4 }}>{row.name}</div>
                            <div style={{ color: '#64748b', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span>SKU: {row.sku}</span>
                              {row.color && row.color !== 'Sin color' && (
                                <span style={{ border: '1px solid rgba(148,163,184,0.35)', borderRadius: 999, padding: '2px 8px', color: '#cbd5e1' }}>
                                  Color: {row.color}
                                </span>
                              )}
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                              {row.marca || 'Sin marca'} · {row.category || 'Sin categoria'}
                            </div>
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                color: status.color,
                                background: status.bg,
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              <StatusIcon size={14} />
                              {status.label}
                            </span>
                          </td>
                          <td style={{ padding: '14px 20px', textAlign: 'right', color: '#cbd5e1' }}>
                            {row.sales_sum} <span style={{ color: '#64748b', fontSize: 12 }}>uds</span>
                          </td>
                          <td style={{ padding: '14px 20px', textAlign: 'right', color: '#cbd5e1' }}>
                            {row.stock_total} <span style={{ color: '#64748b', fontSize: 12 }}>uds</span>
                          </td>
                          <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                            {row.restock_sugerido > 0 ? (
                               <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: 15 }}>
                                +{Math.round(row.restock_sugerido)}
                               </span>
                            ) : (
                                <span style={{ color: '#64748b' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '14px 20px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                            {row.presupuesto > 0 ? formatCurrency(row.presupuesto) : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
             <div style={{ display: 'grid', gap: 12, padding: 16 }}>
                {filteredResults.map((row) => {
                  const status = getCoverageStatus(row);
                  const StatusIcon = status.icon;
                  return (
                    <div key={row.item_id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, background: 'rgba(0,0,0,0.2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                         <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: 15, paddingRight: 10 }}>{row.name}</div>
                         <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: status.color, background: status.bg, padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                            <StatusIcon size={12} /> {status.label}
                          </span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>SKU: {row.sku}</span>
                        {row.color && row.color !== 'Sin color' && (
                          <span style={{ border: '1px solid rgba(148,163,184,0.35)', borderRadius: 999, padding: '2px 8px', color: '#cbd5e1' }}>
                            Color: {row.color}
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 16 }}>
                        {row.marca || 'Sin marca'} · {row.category || 'Sin categoria'}
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                           <div style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>Stock Actual</div>
                           <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{row.stock_total} uds</div>
                        </div>
                         <div>
                           <div style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>Sugerido Comprar</div>
                           <div style={{ color: '#60a5fa', fontWeight: 700 }}>+{Math.round(row.restock_sugerido)} uds</div>
                        </div>
                         <div>
                           <div style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>Ventas (4 sem)</div>
                           <div style={{ color: '#cbd5e1', fontWeight: 600 }}>{row.sales_sum} uds</div>
                        </div>
                        <div>
                           <div style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>Inversión</div>
                           <div style={{ color: '#10b981', fontWeight: 600 }}>{formatCurrency(row.presupuesto)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
             </div>
          )}
        </Card>
      ) : (
        <Card
          style={{
            border: '1px dashed rgba(148,163,184,0.2)',
            background: 'rgba(15,23,42,0.4)',
          }}
        >
          <div style={{ padding: '80px 24px', textAlign: 'center' }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 999,
                background: 'rgba(59,130,246,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <Database size={36} color="#60a5fa" />
            </div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 24, fontWeight: 700 }}>Analiza tu inventario</h3>
            <p style={{ margin: '12px auto 0 auto', maxWidth: 500, color: '#94a3b8', fontSize: 15, lineHeight: 1.6 }}>
              Presiona el botón de <strong>Actualizar Análisis</strong> para calcular las necesidades de compra basadas en tus ventas recientes y el stock actual.
            </p>
          </div>
        </Card>
      )}

      {/* AI Assistant Chatbot */}
      <AIAssistant restockData={results || []} topSales={[]} openSignal={aiOpenSignal} />
    </div>
  );
}
