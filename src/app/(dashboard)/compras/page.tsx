'use client';

import { useState, useRef, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { RefreshCw, Send, TrendingUp, AlertCircle, ShoppingCart, Loader2, Database, UploadCloud, Flame } from 'lucide-react';
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

export default function ComprasRestockPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<RestockRow[] | null>(null);
  const [topSales, setTopSales] = useState<TopSaleRow[]>([]);
  const [totalUnidades, setTotalUnidades] = useState(0);
  const [totalDinero, setTotalDinero] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar ventas del día al montar la página
  useEffect(() => {
    fetch('/api/compras/ventas-hoy')
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data) {
          setTopSales(json.data);
        }
      })
      .catch(e => console.error("Error top sales:", e));
  }, []);

  const fetchLiveAnalytics = async () => {
    setIsProcessing(true);
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
      } else {
        alert("Error al obtener análisis: " + (json.error || 'Desconocido'));
      }
    } catch (error) {
      console.error("Error Fetch:", error);
      alert("Hubo un error de conexión al generar el análisis.");
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
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const targetSheetName = workbook.SheetNames.includes('Matriz') ? 'Matriz' : workbook.SheetNames[0];
        const sheet = workbook.Sheets[targetSheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        
        // El motor antiguo arroja { rows, total_unidades, total_dinero }
        const analisisAntiguo = processRestockExcel(jsonData);
        
        if (analisisAntiguo.rows.length === 0) {
           alert("El excel parece estar vacío o no coincide el formato.");
           setIsProcessing(false);
           return;
        }

        // Inyectamos a la DB local
        const res = await fetch('/api/compras/restock/seed', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ rows: analisisAntiguo.rows })
        });
        
        const json = await res.json();
        
        if (json.success) {
           alert("¡Listo! Historial inyectado. Ahora presiona Generar Análisis.");
        } else {
           alert("Fallo inyectando historial: " + json.error);
        }
        setIsProcessing(false);
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error(error);
      alert("Hubo un error inyectando.");
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShoppingCart size={26} color="#3b82f6" />
            Análisis de Restock (En Vivo)
          </h1>
          <p style={{ margin: '8px 0 0 0', color: 'var(--muted)', fontSize: 13, maxWidth: 650, lineHeight: 1.5 }}>
            El sistema calcula automáticamente el requerimiento de reposición de inventario usando el historial de las últimas 4 semanas directo de la base de datos mediante webhooks. Ya no es necesario procesar archivos de Excel manualmente.
          </p>
        </div>
      </div>

      {topSales.length > 0 && (
        <Card style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.05), rgba(0, 0, 0, 0))' }}>
           <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                 <Flame size={20} color="#ef4444" />
                 <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#e2e8f0' }}>Top 5 Ventas del Día</h3>
                 <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>(Basado en webhooks de facturas en tiempo real de hoy)</span>
              </div>
              <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
                {topSales.map((sale, idx) => (
                  <div key={idx} style={{ 
                    minWidth: 200, 
                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                    borderRadius: 12, 
                    padding: 16, 
                    background: 'rgba(0,0,0,0.2)' 
                  }}>
                     <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444', marginBottom: 4 }}>
                       {sale.sales_sum} uds.
                     </div>
                     <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                       {sale.name}
                     </div>
                     <div style={{ fontSize: 12, color: 'var(--muted)' }}>C$ {Math.round(sale.price * sale.sales_sum).toLocaleString('es-NI')} generados</div>
                  </div>
                ))}
              </div>
           </div>
        </Card>
      )}

      {!results && (
        <Card>
          <div 
            style={{ 
              padding: '80px 40px', 
              textAlign: 'center',
              borderRadius: 'clamp(8px, 12px, 20px)',
              background: 'transparent'
            }}
          >
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Database size={40} color="#3b82f6" />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>
              Las métricas están listas
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 450, margin: '0 auto 32px' }}>
              Haz clic en el botón de abajo para explorar la base de datos y generar tu reporte de restock sugerido al instante con los datos más recientes de Zoho.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <Button 
                variant="primary" 
                onClick={fetchLiveAnalytics} 
                disabled={isProcessing}
                style={{ fontSize: 16, padding: '12px 32px', height: 'auto', borderRadius: 100 }}
              >
                {isProcessing ? (
                  <><Loader2 size={20} className="animate-spin" style={{ marginRight: 8 }} /> Procesando base de datos...</>
                ) : (
                  <><RefreshCw size={20} style={{ marginRight: 8 }} /> Generar Análisis del Mes</>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20 }}>
            <Card>
               <div style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                     <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <TrendingUp size={20} color="#3b82f6" />
                     </div>
                     <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Total Restock Sugerido</span>
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: '#e2e8f0' }}>
                     {Math.round(totalUnidades).toLocaleString()} <span style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 500 }}>Unidades</span>
                  </div>
               </div>
            </Card>

            <Card>
               <div style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                     <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <Database size={20} color="#10b981" />
                     </div>
                     <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Presupuesto Estimado</span>
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: '#e2e8f0' }}>
                     C$ {Math.round(totalDinero).toLocaleString('es-NI')}
                  </div>
               </div>
            </Card>
          </div>

          <Card>
             <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Desglose de Reposición ({results.length} refs)
                </h3>
                <div style={{ display: 'flex', gap: 12 }}>
                    <Button variant="secondary" onClick={fetchLiveAnalytics}>
                       <RefreshCw size={14} style={{ marginRight: 6 }}/> Refrescar
                    </Button>
                   <Button variant="secondary" onClick={() => setResults(null)}>
                     Limpiar
                   </Button>
                   <Button variant="primary" style={{ gap: 8 }}>
                     <Send size={16} /> Enviar al Bot (Fase 3)
                   </Button>
                </div>
             </div>
             
             {(() => {
              const productosFiltrados = [...results]
                .sort((a, b) => b.restock_sugerido - a.restock_sugerido);
                
              return (
                <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                     <thead style={{ background: 'rgba(255,255,255,0.02)', position: 'sticky', top: 0, zIndex: 1, backdropFilter: 'blur(10px)' }}>
                        <tr>
                           <th style={{ padding: '14px 20px', color: 'var(--muted)', fontWeight: 600, width: '40%' }}>Producto</th>
                           <th style={{ padding: '14px 20px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>Ventas 4 Semanas</th>
                           <th style={{ padding: '14px 20px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>Restock Sugerido (Unids)</th>
                           <th style={{ padding: '14px 20px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>P.Unitario</th>
                           <th style={{ padding: '14px 20px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>Total C$</th>
                        </tr>
                     </thead>
                     <tbody>
                        {productosFiltrados.length === 0 ? (
                           <tr>
                              <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No hay productos que requieran restock según los promedios en vivo.</td>
                           </tr>
                        ) : productosFiltrados.map((r, idx) => (
                           <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                              <td style={{ padding: '14px 20px' }}>
                                <div style={{ color: '#e2e8f0', fontWeight: 500, marginBottom: 4 }}>{r.name}</div>
                                <div style={{ color: 'var(--muted)', fontSize: 12 }}>SKU: {r.sku} • Stock Actual: {r.stock_total}</div>
                              </td>
                              <td style={{ padding: '14px 20px', color: 'var(--muted)', textAlign: 'right' }}>
                                {r.sales_sum} uds
                              </td>
                              <td style={{ padding: '14px 20px', color: '#3b82f6', fontWeight: 600, textAlign: 'right' }}>
                                {Math.round(r.restock_sugerido)} unds
                              </td>
                              <td style={{ padding: '14px 20px', color: 'var(--muted)', textAlign: 'right' }}>
                                {r.price ? `C$ ${r.price.toLocaleString('es-NI')}` : '-'}
                              </td>
                              <td style={{ padding: '14px 20px', color: '#10b981', fontWeight: 600, textAlign: 'right' }}>
                                C$ {Math.round(r.presupuesto).toLocaleString('es-NI')}
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
              );
             })()}
          </Card>
        </div>
      )}

    </div>
  );
}
