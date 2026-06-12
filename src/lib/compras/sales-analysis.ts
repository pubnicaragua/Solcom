/**
 * sales-analysis.ts
 * --------------------------------------------------
 * Toma los datos del reporte de restock (zoho-salesbyitem-report)
 * y genera insights de ventas listos para que el bot de IA los consuma.
 *
 * Fórmula de cobertura:
 *   ventaSemanal = (ventas_totales / días_del_rango) * 7
 *   semanasCobertura = stock_actual / ventaSemanal
 *
 * Umbrales:
 *   • Crítico:  cobertura < 2 semanas
 *   • Bajo:     cobertura >= 2 y < 4 semanas
 *   • Sano:     cobertura >= 4 semanas
 *   • Sin venta: 0 ventas en el rango (no aplica fórmula)
 * --------------------------------------------------
 */

export type CoverageStatus = 'critico' | 'bajo' | 'sano' | 'sin_venta' | 'sin_stock';

export interface ProductAnalysis {
  item_id: string;
  sku: string;
  name: string;
  marca: string;
  category: string;
  color: string;
  state: string;
  price: number;
  stock_total: number;
  sales_sum: number;
  weekly_avg: number;
  /** Semanas de cobertura calculada */
  coverage_weeks: number;
  /** Estado de la cobertura */
  coverage_status: CoverageStatus;
  /** Etiqueta legible del estado */
  coverage_label: string;
  /** Ingreso total = ventas × precio */
  revenue: number;
  /** Restock sugerido (unidades que faltan) */
  restock_sugerido: number;
  /** Presupuesto para reabastecer */
  presupuesto: number;
}

export interface CategoryBreakdown {
  category: string;
  total_units_sold: number;
  total_revenue: number;
  product_count: number;
  top_product: string;
}

export interface BrandBreakdown {
  brand: string;
  total_units_sold: number;
  total_revenue: number;
  product_count: number;
  top_product: string;
}

export interface SalesAnalysisResult {
  /** Periodo analizado */
  period: {
    date_start: string;
    date_end: string;
    days: number;
    weeks: number;
  };
  /** Resumen general */
  summary: {
    total_products: number;
    total_units_sold: number;
    total_revenue: number;
    avg_weekly_sales: number;
    critical_count: number;
    low_count: number;
    healthy_count: number;
    no_sales_count: number;
    no_stock_count: number;
  };
  /** Top 15 más vendidos por cantidad */
  top_by_quantity: ProductAnalysis[];
  /** Top 15 más vendidos por ingreso */
  top_by_revenue: ProductAnalysis[];
  /** Productos críticos (cobertura < 2 sem) */
  critical_products: ProductAnalysis[];
  /** Productos sanos (cobertura >= 4 sem) */
  healthy_products: ProductAnalysis[];
  /** Productos sin stock */
  out_of_stock: ProductAnalysis[];
  /** Desglose por categoría */
  categories: CategoryBreakdown[];
  /** Desglose por marca */
  brands: BrandBreakdown[];
  /** Todos los productos analizados */
  all_products: ProductAnalysis[];
  /** Texto de resumen listo para el bot */
  bot_summary: string;
}

// ─────────────── helpers ───────────────

function diffDays(dateStart: string, dateEnd: string): number {
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  const ms = end.getTime() - start.getTime();
  return Math.max(Math.ceil(ms / (1000 * 60 * 60 * 24)), 1);
}

function calculateCoverage(
  salesSum: number,
  stockTotal: number,
  days: number,
): { weeks: number; status: CoverageStatus; label: string } {
  if (salesSum <= 0 && stockTotal <= 0) {
    return { weeks: 0, status: 'sin_stock', label: '⚫ Sin stock ni ventas' };
  }
  if (salesSum <= 0 && stockTotal > 0) {
    return { weeks: 999, status: 'sin_venta', label: '⚪ Sin ventas (stock parado)' };
  }
  if (stockTotal <= 0) {
    return { weeks: 0, status: 'sin_stock', label: '⚫ Agotado' };
  }

  // Fórmula: (ventas / días) * 7 = promedio semanal
  const weeklyRate = (salesSum / days) * 7;
  // stock / promedio semanal = semanas de cobertura
  const weeks = weeklyRate > 0 ? stockTotal / weeklyRate : 999;
  const rounded = Math.round(weeks * 100) / 100;

  if (rounded < 2) {
    return { weeks: rounded, status: 'critico', label: `🔴 Crítico (~${rounded.toFixed(1)} sem)` };
  }
  if (rounded < 4) {
    return { weeks: rounded, status: 'bajo', label: `🟡 Bajo (~${rounded.toFixed(1)} sem)` };
  }
  return { weeks: rounded, status: 'sano', label: `🟢 Sano (~${rounded.toFixed(1)} sem)` };
}

function formatCurrency(value: number): string {
  return `C$ ${value.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─────────────── procesamiento principal ───────────────

export interface RestockRow {
  item_id: string;
  sku: string;
  name: string;
  marca: string;
  category: string;
  color: string;
  state: string;
  price: number;
  stock_total: number;
  sales_sum: number;
  weekly_avg: number;
  restock_sugerido: number;
  presupuesto: number;
}

export function analyzeSales(
  rows: RestockRow[],
  dateStart: string,
  dateEnd: string,
): SalesAnalysisResult {
  const days = diffDays(dateStart, dateEnd);
  const weeks = days / 7;

  // ── Calcular análisis por producto ──
  const all: ProductAnalysis[] = rows.map((row) => {
    const { weeks: covWeeks, status, label } = calculateCoverage(
      row.sales_sum,
      row.stock_total,
      days,
    );
    const revenue = Math.round(row.sales_sum * row.price * 100) / 100;

    return {
      ...row,
      coverage_weeks: covWeeks,
      coverage_status: status,
      coverage_label: label,
      revenue,
    };
  });

  // ── Filtros ──
  const critical = all
    .filter((p) => p.coverage_status === 'critico')
    .sort((a, b) => a.coverage_weeks - b.coverage_weeks);

  const low = all
    .filter((p) => p.coverage_status === 'bajo')
    .sort((a, b) => a.coverage_weeks - b.coverage_weeks);

  const healthy = all
    .filter((p) => p.coverage_status === 'sano')
    .sort((a, b) => b.sales_sum - a.sales_sum);

  const noSales = all.filter((p) => p.coverage_status === 'sin_venta');
  const noStock = all.filter((p) => p.coverage_status === 'sin_stock');

  // ── Top vendidos ──
  const topByQty = [...all]
    .filter((p) => p.sales_sum > 0)
    .sort((a, b) => b.sales_sum - a.sales_sum)
    .slice(0, 15);

  const topByRevenue = [...all]
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15);

  // ── Desglose por categoría ──
  const catMap = new Map<string, { units: number; revenue: number; count: number; topName: string; topQty: number }>();
  for (const p of all) {
    const cat = p.category || 'Sin categoría';
    const current = catMap.get(cat) || { units: 0, revenue: 0, count: 0, topName: '', topQty: 0 };
    current.units += p.sales_sum;
    current.revenue += p.revenue;
    current.count += 1;
    if (p.sales_sum > current.topQty) {
      current.topQty = p.sales_sum;
      current.topName = p.name;
    }
    catMap.set(cat, current);
  }
  const categories: CategoryBreakdown[] = Array.from(catMap.entries())
    .map(([category, data]) => ({
      category,
      total_units_sold: data.units,
      total_revenue: Math.round(data.revenue * 100) / 100,
      product_count: data.count,
      top_product: data.topName,
    }))
    .sort((a, b) => b.total_units_sold - a.total_units_sold);

  // ── Desglose por marca ──
  const brandMap = new Map<string, { units: number; revenue: number; count: number; topName: string; topQty: number }>();
  for (const p of all) {
    const brand = p.marca || 'Sin marca';
    const current = brandMap.get(brand) || { units: 0, revenue: 0, count: 0, topName: '', topQty: 0 };
    current.units += p.sales_sum;
    current.revenue += p.revenue;
    current.count += 1;
    if (p.sales_sum > current.topQty) {
      current.topQty = p.sales_sum;
      current.topName = p.name;
    }
    brandMap.set(brand, current);
  }
  const brands: BrandBreakdown[] = Array.from(brandMap.entries())
    .map(([brand, data]) => ({
      brand,
      total_units_sold: data.units,
      total_revenue: Math.round(data.revenue * 100) / 100,
      product_count: data.count,
      top_product: data.topName,
    }))
    .sort((a, b) => b.total_units_sold - a.total_units_sold);

  // ── Resumen ──
  const totalUnitsSold = all.reduce((sum, p) => sum + p.sales_sum, 0);
  const totalRevenue = all.reduce((sum, p) => sum + p.revenue, 0);
  const avgWeekly = weeks > 0 ? totalUnitsSold / weeks : 0;

  const summary = {
    total_products: all.length,
    total_units_sold: Math.round(totalUnitsSold * 100) / 100,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    avg_weekly_sales: Math.round(avgWeekly * 100) / 100,
    critical_count: critical.length,
    low_count: low.length,
    healthy_count: healthy.length,
    no_sales_count: noSales.length,
    no_stock_count: noStock.length,
  };

  // ── Generar texto resumen para el bot ──
  const botSummary = buildBotSummary(summary, topByQty, topByRevenue, critical, healthy, categories, brands, dateStart, dateEnd, days);

  return {
    period: { date_start: dateStart, date_end: dateEnd, days, weeks: Math.round(weeks * 100) / 100 },
    summary,
    top_by_quantity: topByQty,
    top_by_revenue: topByRevenue,
    critical_products: critical,
    healthy_products: healthy,
    out_of_stock: noStock,
    categories,
    brands,
    all_products: all,
    bot_summary: botSummary,
  };
}

// ─────────────── Texto para el bot ───────────────

function buildBotSummary(
  summary: SalesAnalysisResult['summary'],
  topByQty: ProductAnalysis[],
  topByRevenue: ProductAnalysis[],
  critical: ProductAnalysis[],
  healthy: ProductAnalysis[],
  categories: CategoryBreakdown[],
  brands: BrandBreakdown[],
  dateStart: string,
  dateEnd: string,
  days: number,
): string {
  const lines: string[] = [];

  lines.push(`📊 ANÁLISIS DE VENTAS (${dateStart} al ${dateEnd} — ${days} días)`);
  lines.push('');
  lines.push(`📦 Total productos analizados: ${summary.total_products}`);
  lines.push(`🛒 Unidades vendidas en el período: ${summary.total_units_sold.toLocaleString()}`);
  lines.push(`💰 Ingreso total estimado: ${formatCurrency(summary.total_revenue)}`);
  lines.push(`📈 Promedio semanal global: ${summary.avg_weekly_sales.toLocaleString()} unidades/semana`);
  lines.push('');

  // Estado de cobertura
  lines.push('── ESTADO DE COBERTURA ──');
  lines.push(`🔴 Críticos (< 2 sem): ${summary.critical_count} productos`);
  lines.push(`🟡 Bajos (2–4 sem): ${summary.low_count} productos`);
  lines.push(`🟢 Sanos (> 4 sem): ${summary.healthy_count} productos`);
  lines.push(`⚫ Agotados/Sin stock: ${summary.no_stock_count} productos`);
  lines.push(`⚪ Sin ventas (stock parado): ${summary.no_sales_count} productos`);
  lines.push('');

  // Top 10 más vendidos por cantidad
  if (topByQty.length > 0) {
    lines.push('── 🏆 TOP 10 MÁS VENDIDOS (por cantidad) ──');
    topByQty.slice(0, 10).forEach((p, i) => {
      lines.push(`${i + 1}. ${p.name} (${p.sku}) — ${p.sales_sum} uds vendidas | Stock: ${p.stock_total} | ${p.coverage_label}`);
    });
    lines.push('');
  }

  // Top 5 por ingreso
  if (topByRevenue.length > 0) {
    lines.push('── 💰 TOP 5 POR INGRESO ──');
    topByRevenue.slice(0, 5).forEach((p, i) => {
      lines.push(`${i + 1}. ${p.name} — Ingreso: ${formatCurrency(p.revenue)} | ${p.sales_sum} uds | ${p.coverage_label}`);
    });
    lines.push('');
  }

  // Productos críticos
  if (critical.length > 0) {
    lines.push('── 🔴 PRODUCTOS CRÍTICOS (necesitan reabastecimiento urgente) ──');
    critical.slice(0, 10).forEach((p) => {
      const weeklyRate = days > 0 ? ((p.sales_sum / days) * 7).toFixed(1) : '0';
      lines.push(`• ${p.name} (${p.sku}) — Stock: ${p.stock_total} | Venta semanal: ${weeklyRate} | Cobertura: ${p.coverage_weeks.toFixed(1)} sem | Restock sugerido: ${p.restock_sugerido} uds (${formatCurrency(p.presupuesto)})`);
    });
    lines.push('');
  }

  // Top categorías
  if (categories.length > 0) {
    lines.push('── 📂 TOP 5 CATEGORÍAS ──');
    categories.slice(0, 5).forEach((c) => {
      lines.push(`• ${c.category}: ${c.total_units_sold} uds | ${formatCurrency(c.total_revenue)} | ${c.product_count} productos | Más vendido: ${c.top_product}`);
    });
    lines.push('');
  }

  // Top marcas
  if (brands.length > 0) {
    lines.push('── 🏷️ TOP 5 MARCAS ──');
    brands.slice(0, 5).forEach((b) => {
      lines.push(`• ${b.brand}: ${b.total_units_sold} uds | ${formatCurrency(b.total_revenue)} | ${b.product_count} productos | Más vendido: ${b.top_product}`);
    });
    lines.push('');
  }

  // Productos sanos
  if (healthy.length > 0) {
    lines.push(`── 🟢 PRODUCTOS SANOS (${healthy.length} en total, mostrando top 5) ──`);
    healthy.slice(0, 5).forEach((p) => {
      lines.push(`• ${p.name} (${p.sku}) — Stock: ${p.stock_total} | Cobertura: ${p.coverage_weeks.toFixed(1)} semanas`);
    });
  }

  return lines.join('\n');
}
