'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  SlidersHorizontal,
  TrendingDown,
  Wallet
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import AIAssistant from '@/components/compras/AIAssistant';

interface RestockRow {
  item_id: string;
  sku: string;
  name: string;
  marca?: string | null;
  category?: string | null;
  color?: string | null;
  state?: string | null;
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
  const getClosedMonthReportRange = () => {
    const now = new Date();
    const dateStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const dateEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const formatYmd = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      dateStart: formatYmd(dateStart),
      dateEnd: formatYmd(dateEnd),
    };
  };

  const initialRange = getClosedMonthReportRange();
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<RestockRow[] | null>(null);
  const [totalUnidades, setTotalUnidades] = useState(0);
  const [totalDinero, setTotalDinero] = useState(0);
  const [dateStart, setDateStart] = useState(initialRange.dateStart);
  const [dateEnd, setDateEnd] = useState(initialRange.dateEnd);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [onlyNeedsRestock, setOnlyNeedsRestock] = useState(true);
  const [mobileView, setMobileView] = useState(false);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [isGeneratePressed, setIsGeneratePressed] = useState(false);
  const [activeView, setActiveView] = useState<'compras' | 'ventas'>('compras');
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [aiOpenSignal, setAiOpenSignal] = useState(0);

  const formatCurrency = (value: number) => `C$ ${Math.round(value).toLocaleString('es-NI')}`;

  const getRangeDays = (start: string, end: string) => {
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    const diffMs = endDate.getTime() - startDate.getTime();
    return Math.ceil(diffMs / 86_400_000);
  };

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
      const rangeDays = getRangeDays(dateStart, dateEnd);
      if (!dateStart || !dateEnd || rangeDays <= 0) {
        setNotice({ type: 'error', text: 'Selecciona un rango de fechas valido.' });
        setIsProcessing(false);
        return;
      }

      if (rangeDays > 42) {
        setNotice({ type: 'error', text: 'El rango maximo permitido es de 6 semanas.' });
        setIsProcessing(false);
        return;
      }

      const weeks = Math.max(0.1, rangeDays / 7);
      const params = new URLSearchParams({
        date_start: dateStart,
        date_end: dateEnd,
        weeks: String(weeks),
        max_pages: '20',
        per_page: '200',
      });
      const res = await fetch(`/api/compras/restock?${params.toString()}`, { cache: 'no-store' });
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
      .sort((a, b) => activeView === 'compras' ? b.restock_sugerido - a.restock_sugerido : b.sales_sum - a.sales_sum);
  }, [results, onlyNeedsRestock, selectedBrand, selectedCategory, searchTerm, activeView]);

  const handleExportExcel = async () => {
    if (!filteredResults || filteredResults.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Solis Comercial ERP';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Estrategia de Compras');

      // Detect standard keys to exclude from dynamic weekly columns
      const excludeKeys = [
        'item_id', 'sku', 'name', 'marca', 'category', 'color', 'state',
        'location_name', 'price', 'stock_total', 'sales_sum', 'weekly_avg',
        'restock_sugerido', 'presupuesto', 'producto', 'restock_promedio_unid',
        'restock_promedio_dinero', 'precio_unitario', 'stockActual',
        'CATEGORIA', 'CATEGORÍA', 'categoria',
        'Nombre del artículo', 'Nombre del articulo', 'Nombre',
        'item_CF_COLOR',
        'Suma de cantidad de existencias finales', 'existencias_finales',
        'Suma de RE-STOCK EN BASE PROMEDIO'
      ];

      // Identify dynamic keys (e.g. weekly data from uploaded Excel) present in results
      const firstRow = filteredResults[0];
      const dynamicKeys = Object.keys(firstRow).filter(
        (key) => !excludeKeys.includes(key)
      );

      // Define header names
      const headers = [
        'CATEGORIA',
        'Nombre del artículo',
        'item_CF_COLOR',
        'Suma de RE-STOCK EN BASE PROMEDIO',
        'Suma de cantidad de existencias finales',
        'Suma de RE-STOCK EN BASE PROMEDIO',
        ...dynamicKeys
      ];

      // Add header row to worksheet
      const headerRow = sheet.addRow(headers);

      // Style header row: Bold font, thin borders, light gray background
      headerRow.font = { bold: true, size: 10, name: 'Calibri' };
      headerRow.eachCell((cell, colNum) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
        };
        // Check if dynamic column has red or blue text
        const colHeader = headers[colNum - 1];
        if (colHeader.toLowerCase().includes('salida')) {
          cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FFFF0000' } };
        } else if (colHeader.toLowerCase().includes('entrada')) {
          cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF0000FF' } };
        }
        
        // Simple fill for headers to make it look clean
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' }
        };
      });

      // Add data rows
      filteredResults.forEach((row: any) => {
        // Map standard fields
        const categoryVal = row.category || '';
        const nameVal = row.name || '';
        const colorVal = row.color && row.color !== 'Sin color' ? row.color : '';
        const budgetVal = row.presupuesto ?? 0;
        const stockVal = row.stock_total ?? 0;
        const suggestVal = row.restock_sugerido ?? 0;

        // Build row data
        const rowData: any[] = [
          categoryVal,
          nameVal,
          colorVal,
          budgetVal,
          stockVal,
          suggestVal
        ];

        // Append dynamic weekly data if any
        dynamicKeys.forEach((key) => {
          let val = row[key];
          if (val === '-' || val === '' || val === null || val === undefined) {
            rowData.push(null);
          } else {
            // Parse negative numbers from string format "(10)" to numeric -10
            if (typeof val === 'string' && val.includes('(')) {
              val = -Number(val.replace(/[()]/g, ''));
            }
            const num = Number(val);
            rowData.push(isNaN(num) ? val : num);
          }
        });

        const newRow = sheet.addRow(rowData);

        // Format and style cells of the row
        newRow.eachCell((cell, colNum) => {
          // General cell font and borders
          cell.font = { size: 10, name: 'Calibri' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };

          // Alignment based on type
          if (colNum <= 3) {
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            // Number formatting for numeric columns
            cell.numFmt = '#,##0.00;(#,##0.00);"-"';
          }

          // Style and colors for columns
          const colHeader = headers[colNum - 1];

          // Exits (red) and Entries (blue) for dynamic columns
          if (colNum > 6) {
            if (colHeader.toLowerCase().includes('salida')) {
              cell.font = { size: 10, name: 'Calibri', color: { argb: 'FFFF0000' } };
            } else if (colHeader.toLowerCase().includes('entrada')) {
              cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF0000FF' } };
            }
          }

          // Yellow highlight for suggested restock columns (D = budget, F = restock quantity)
          // when restock quantity (suggestVal) is positive (> 0)
          if ((colNum === 4 || colNum === 6) && suggestVal > 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFFFA0' } // Bright yellow fill
            };
          }
        });
      });

      // Adjust column widths automatically
      sheet.columns.forEach((column) => {
        let maxLen = 12;
        if (column && column.values) {
          column.values.forEach((v) => {
            if (v) {
              const strLen = String(v).length;
              if (strLen > maxLen) maxLen = strLen;
            }
          });
        }
        // Caps column width to 45 max for name columns
        column.width = Math.min(45, maxLen + 3);
      });

      // === SHEET 2: Análisis de Ventas ===
      const salesSheet = workbook.addWorksheet('Análisis de Ventas');
      
      const salesHeaders = [
        'CATEGORIA',
        'Nombre del artículo',
        'item_CF_COLOR',
        'Precio de Venta',
        'Stock Actual',
        'Unidades Vendidas',
        'Semanas de Cobertura',
        'Estado de Cobertura',
        ...dynamicKeys
      ];

      const salesHeaderRow = salesSheet.addRow(salesHeaders);
      salesHeaderRow.font = { bold: true, size: 10, name: 'Calibri' };
      salesHeaderRow.eachCell((cell, colNum) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
        };
        const colHeader = salesHeaders[colNum - 1];
        if (colHeader.toLowerCase().includes('salida')) {
          cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FFFF0000' } };
        } else if (colHeader.toLowerCase().includes('entrada')) {
          cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF0000FF' } };
        }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE8F4F8' } // Light blue accent for sales
        };
      });

      // Sort by sales_sum descending for Sheet 2
      const sortedBySales = [...filteredResults].sort((a, b) => b.sales_sum - a.sales_sum);

      sortedBySales.forEach((row: any) => {
        const categoryVal = row.category || '';
        const nameVal = row.name || '';
        const colorVal = row.color && row.color !== 'Sin color' ? row.color : '';
        const priceVal = row.price ?? 0;
        const stockVal = row.stock_total ?? 0;
        const salesVal = row.sales_sum ?? 0;

        // Calculate coverage weeks
        const weeklyAvg = row.weekly_avg || 0;
        let coverageWeeks = 0;
        let coverageLabel = 'Sin ventas';
        if (stockVal === 0) {
          if (weeklyAvg > 0) coverageLabel = 'Agotado';
        } else if (weeklyAvg > 0) {
          coverageWeeks = stockVal / weeklyAvg;
          coverageLabel = `${coverageWeeks.toFixed(1)} sem`;
        }

        const rowData = [
          categoryVal,
          nameVal,
          colorVal,
          priceVal,
          stockVal,
          salesVal,
          weeklyAvg > 0 && stockVal > 0 ? coverageWeeks : null,
          coverageLabel
        ];

        // Append dynamic weekly data if any
        dynamicKeys.forEach((key) => {
          let val = row[key];
          if (val === '-' || val === '' || val === null || val === undefined) {
            rowData.push(null);
          } else {
            if (typeof val === 'string' && val.includes('(')) {
              val = -Number(val.replace(/[()]/g, ''));
            }
            const num = Number(val);
            rowData.push(isNaN(num) ? val : num);
          }
        });

        const newRow = salesSheet.addRow(rowData);

        newRow.eachCell((cell, colNum) => {
          cell.font = { size: 10, name: 'Calibri' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };

          if (colNum <= 3 || colNum === 8) {
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            cell.numFmt = '#,##0.00;(#,##0.00);"-"';
          }

          // Style and colors for dynamic columns
          if (colNum > 8) {
            const colHeader = salesHeaders[colNum - 1];
            if (colHeader.toLowerCase().includes('salida')) {
              cell.font = { size: 10, name: 'Calibri', color: { argb: 'FFFF0000' } };
            } else if (colHeader.toLowerCase().includes('entrada')) {
              cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF0000FF' } };
            }
          }

          // Highlight coverage status
          if (colNum === 8 && coverageLabel === 'Agotado') {
            cell.font = { bold: true, color: { argb: 'FFFF0000' } };
          } else if (colNum === 8 && coverageLabel.includes('sem') && coverageWeeks <= 1.5) {
            cell.font = { bold: true, color: { argb: 'FFFF8C00' } }; // Orange
          } else if (colNum === 8 && coverageLabel.includes('sem') && coverageWeeks > 1.5 && coverageWeeks <= 5) {
            cell.font = { color: { argb: 'FF008000' } }; // Green
          }
        });
      });

      salesSheet.columns.forEach((column) => {
        let maxLen = 12;
        if (column && column.values) {
          column.values.forEach((v) => {
            if (v) {
              const strLen = String(v).length;
              if (strLen > maxLen) maxLen = strLen;
            }
          });
        }
        column.width = Math.min(45, maxLen + 3);
      });

      // Write workbook to buffer and trigger download
      const buffer = await workbook.xlsx.writeBuffer();
      const fileBlob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(fileBlob, `estrategia_compras_${new Date().toISOString().split('T')[0]}.xlsx`);

    } catch (err: any) {
      console.error('Error al exportar Excel:', err);
      alert(`Error al exportar Excel: ${err.message || err}`);
    }
  };

  // Derived metrics for the dashboard
  const kpis = useMemo(() => {
    if (!results) return { critical: 0, healthy: 0, overstocked: 0, budgetCritical: 0 };
    
    let critical = 0;
    let healthy = 0;
    let overstocked = 0;
    let budgetCritical = 0;

    results.forEach((row) => {
      const weeklyAvg = row.weekly_avg;

      if (row.stock_total === 0) {
        if (weeklyAvg > 0) {
          critical++;
          budgetCritical += row.presupuesto;
        }
      } else if (weeklyAvg === 0) {
        healthy++;
      } else {
        const coverageWeeks = row.stock_total / weeklyAvg;
        if (coverageWeeks <= 1.5) {
          critical++;
          budgetCritical += row.presupuesto;
        } else if (coverageWeeks <= 5.0) {
          healthy++;
        } else {
          overstocked++;
        }
      }
    });

    return { critical, healthy, overstocked, budgetCritical };
  }, [results]);

  const getCoverageStatus = (row: RestockRow) => {
    const weeklyAvg = row.weekly_avg;

    if (row.stock_total === 0) {
      if (weeklyAvg > 0) {
        return { label: 'Agotado (0 sem)', color: '#ef4444', icon: AlertCircle, bg: 'rgba(239,68,68,0.1)' };
      }
      return { label: 'Sin Stock', color: '#64748b', icon: AlertCircle, bg: 'rgba(100,116,139,0.1)' };
    }

    if (weeklyAvg === 0) {
      return { label: 'Sano (Sin ventas)', color: '#10b981', icon: CheckCircle2, bg: 'rgba(16,185,129,0.1)' };
    }

    const coverageWeeks = row.stock_total / weeklyAvg;

    if (coverageWeeks <= 1.5) {
      return { label: `Crítico (~${coverageWeeks.toFixed(1)} sem)`, color: '#f59e0b', icon: AlertTriangle, bg: 'rgba(245,158,11,0.1)' };
    }
    if (coverageWeeks <= 5.0) {
      return { label: `Sano (~${coverageWeeks.toFixed(1)} sem)`, color: '#10b981', icon: CheckCircle2, bg: 'rgba(16,185,129,0.1)' };
    }
    return { label: `Exceso (~${coverageWeeks.toFixed(1)} sem)`, color: '#3b82f6', icon: TrendingDown, bg: 'rgba(59,130,246,0.1)' };
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



  const headerButtonStylePrimary: React.CSSProperties = {
    height: 40,
    padding: '0 16px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--brand-primary)', // Solis Red
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
  };

  const toolbarButtonStyleExcel: React.CSSProperties = {
    height: 38,
    padding: '0 14px',
    borderRadius: 8,
    border: '1px solid rgba(16, 185, 129, 0.2)',
    background: 'rgba(16, 185, 129, 0.06)',
    color: '#10b981', // Excel Green
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap',
  };

  const toolbarButtonStyleAI: React.CSSProperties = {
    height: 38,
    padding: '0 14px',
    borderRadius: 8,
    border: '1px solid rgba(99, 102, 241, 0.2)',
    background: 'rgba(99, 102, 241, 0.08)',
    color: '#818cf8', // Indigo/violet tint
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={shellStyle}>
      <style>{`


        .compras-btn-primary {
          transition: all 150ms ease-in-out;
        }
        .compras-btn-primary:hover:not(:disabled) {
          background: #b91c1c !important;
          box-shadow: 0 6px 16px rgba(220, 38, 38, 0.35) !important;
        }
        .compras-btn-primary:active:not(:disabled) {
          transform: scale(0.97);
        }

        .compras-btn-excel {
          transition: all 150ms ease-in-out;
        }
        .compras-btn-excel:hover:not(:disabled) {
          background: rgba(16, 185, 129, 0.14) !important;
          border-color: rgba(16, 185, 129, 0.4) !important;
          color: #34d399 !important;
        }
        .compras-btn-excel:active:not(:disabled) {
          transform: scale(0.97);
        }

        .compras-btn-ai {
          transition: all 150ms ease-in-out;
        }
        .compras-btn-ai:hover:not(:disabled) {
          background: rgba(99, 102, 241, 0.14) !important;
          border-color: rgba(99, 102, 241, 0.4) !important;
          color: #a5b4fc !important;
        }
        .compras-btn-ai:active:not(:disabled) {
          transform: scale(0.97);
        }
        
        .compras-date-input {
          transition: border-color 150ms ease;
        }
        .compras-date-input:focus {
          border-color: rgba(96, 165, 250, 0.4) !important;
          outline: none;
        }
      `}</style>



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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: mobileView ? 'stretch' : 'flex-end' }}>
          <label style={{ display: 'grid', gap: 4, color: '#94a3b8', fontSize: 11 }}>
            Inicio
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              max={dateEnd}
              disabled={isProcessing}
              className="compras-date-input"
              style={{
                height: 40,
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.24)',
                background: 'rgba(15,23,42,0.72)',
                color: '#e2e8f0',
                padding: '0 12px',
                minWidth: 150,
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, color: '#94a3b8', fontSize: 11 }}>
            Final
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              min={dateStart}
              disabled={isProcessing}
              className="compras-date-input"
              style={{
                height: 40,
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.24)',
                background: 'rgba(15,23,42,0.72)',
                color: '#e2e8f0',
                padding: '0 12px',
                minWidth: 150,
              }}
            />
          </label>
          


          <button
            className="compras-btn-primary"
            onClick={fetchLiveAnalytics}
            disabled={isProcessing}
            style={headerButtonStylePrimary}
          >
            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span>Actualizar Análisis</span>
          </button>
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
              {/* Vistas selector */}
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 2 }}>
                <button
                  onClick={() => {
                    setActiveView('compras');
                    setOnlyNeedsRestock(true);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeView === 'compras' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: activeView === 'compras' ? '#ffffff' : '#94a3b8',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  Compras
                </button>
                <button
                  onClick={() => {
                    setActiveView('ventas');
                    setOnlyNeedsRestock(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeView === 'ventas' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: activeView === 'ventas' ? '#ffffff' : '#94a3b8',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  Más Vendidos
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '8px 14px',
                  flex: mobileView ? 1 : '0 1 250px',
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
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="compras-btn-excel"
                onClick={handleExportExcel}
                style={toolbarButtonStyleExcel}
              >
                <FileSpreadsheet size={16} />
                <span>Exportar Excel</span>
              </button>
              
              <button
                className="compras-btn-ai"
                onClick={() => setAiOpenSignal((prev) => prev + 1)}
                style={toolbarButtonStyleAI}
              >
                <Send size={16} />
                <span>Compartir con IA</span>
              </button>
            </div>
          </div>

          {/* Table */}
          {!mobileView ? (
            <div style={{ overflowX: 'auto', maxHeight: 600 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
                <thead style={{ background: 'rgba(15,23,42,0.9)', position: 'sticky', top: 0, zIndex: 1, backdropFilter: 'blur(8px)' }}>
                  <tr>
                    <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Producto</th>
                    <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{activeView === 'compras' ? 'Estado' : 'Cobertura'}</th>
                    <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Ventas (4 sem)</th>
                    {activeView === 'ventas' && (
                      <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>P. Unitario</th>
                    )}
                    <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Stock Actual</th>
                    {activeView === 'compras' && (
                      <>
                        <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Sugerido</th>
                        <th style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Inversión</th>
                      </>
                    )}
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
                              {row.state && (
                                <span
                                  style={{
                                    border: '1px solid ' + (row.state.toLowerCase() === 'nuevo' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'),
                                    background: row.state.toLowerCase() === 'nuevo' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    color: row.state.toLowerCase() === 'nuevo' ? '#34d399' : '#fbbf24',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: 'capitalize'
                                  }}
                                >
                                  {row.state}
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
                          {activeView === 'ventas' && (
                            <td style={{ padding: '14px 20px', textAlign: 'right', color: '#cbd5e1' }}>
                              {formatCurrency(row.price)}
                            </td>
                          )}
                          <td style={{ padding: '14px 20px', textAlign: 'right', color: '#cbd5e1' }}>
                            {row.stock_total} <span style={{ color: '#64748b', fontSize: 12 }}>uds</span>
                          </td>
                          {activeView === 'compras' && (
                            <>
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
                            </>
                          )}
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
                      <div style={{ color: '#64748b', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span>SKU: {row.sku}</span>
                        {row.color && row.color !== 'Sin color' && (
                          <span style={{ border: '1px solid rgba(148,163,184,0.35)', borderRadius: 999, padding: '2px 8px', color: '#cbd5e1' }}>
                            Color: {row.color}
                          </span>
                        )}
                        {row.state && (
                          <span
                            style={{
                              border: '1px solid ' + (row.state.toLowerCase() === 'nuevo' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'),
                              background: row.state.toLowerCase() === 'nuevo' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                              borderRadius: 999,
                              padding: '2px 8px',
                              color: row.state.toLowerCase() === 'nuevo' ? '#34d399' : '#fbbf24',
                              fontSize: 11,
                              fontWeight: 600,
                              textTransform: 'capitalize'
                            }}
                          >
                            {row.state}
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 16 }}>
                        {row.marca || 'Sin marca'} · {row.category || 'Sin categoria'}
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {activeView === 'compras' ? (
                          <>
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
                          </>
                        ) : (
                          <>
                            <div>
                               <div style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>Ventas (4 sem)</div>
                               <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{row.sales_sum} uds</div>
                            </div>
                             <div>
                               <div style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>Stock Actual</div>
                               <div style={{ color: '#cbd5e1', fontWeight: 600 }}>{row.stock_total} uds</div>
                            </div>
                             <div>
                               <div style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>P. Unitario</div>
                               <div style={{ color: '#cbd5e1', fontWeight: 600 }}>{formatCurrency(row.price)}</div>
                            </div>
                          </>
                        )}
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
      <AIAssistant restockData={filteredResults} topSales={[]} openSignal={aiOpenSignal} />
    </div>
  );
}
