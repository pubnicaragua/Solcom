/**
 * Capa de transformación de datos para reportes
 * Sin mock data, sin hardcode, solo transformaciones puras
 */

interface Item {
  id: string;
  sku: string;
  name: string;
  category?: string;
  marca?: string;
  color?: string;
  state?: string;
  price?: number;
  stock_total?: number;
  created_at?: string;
  updated_at?: string;
}

interface StockSnapshot {
  item_id: string;
  warehouse_id: string;
  qty: number;
  synced_at: string;
  items?: Item;
  warehouses?: {
    id: string;
    code: string;
    name: string;
  };
}

interface ChartData {
  label: string;
  value: number;
  color?: string;
}

/**
 * Agrupa items por categoría y suma unidades
 */
export function groupByCategoryUnits(snapshots: StockSnapshot[]): ChartData[] | null {
  if (!snapshots || snapshots.length === 0) return null;

  const groups: Record<string, number> = {};
  
  snapshots.forEach(snapshot => {
    const category = snapshot.items?.category || 'Sin categoría';
    groups[category] = (groups[category] || 0) + snapshot.qty;
  });

  return Object.entries(groups)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Agrupa items por categoría y suma costo total
 */
export function groupByCategoryCost(snapshots: StockSnapshot[]): ChartData[] | null {
  if (!snapshots || snapshots.length === 0) return null;

  const groups: Record<string, number> = {};
  let hasPrice = false;
  
  snapshots.forEach(snapshot => {
    const category = snapshot.items?.category || 'Sin categoría';
    const price = snapshot.items?.price || 0;
    
    if (price > 0) hasPrice = true;
    
    groups[category] = (groups[category] || 0) + (snapshot.qty * price);
  });

  if (!hasPrice) return null; // No hay precios disponibles

  return Object.entries(groups)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Agrupa items por marca y suma unidades
 */
export function groupByBrandUnits(snapshots: StockSnapshot[]): ChartData[] | null {
  if (!snapshots || snapshots.length === 0) return null;

  const groups: Record<string, number> = {};
  
  snapshots.forEach(snapshot => {
    const marca = snapshot.items?.marca || 'Sin marca';
    groups[marca] = (groups[marca] || 0) + snapshot.qty;
  });

  return Object.entries(groups)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Agrupa items por marca y suma costo total
 */
export function groupByBrandCost(snapshots: StockSnapshot[]): ChartData[] | null {
  if (!snapshots || snapshots.length === 0) return null;

  const groups: Record<string, number> = {};
  let hasPrice = false;
  
  snapshots.forEach(snapshot => {
    const marca = snapshot.items?.marca || 'Sin marca';
    const price = snapshot.items?.price || 0;
    
    if (price > 0) hasPrice = true;
    
    groups[marca] = (groups[marca] || 0) + (snapshot.qty * price);
  });

  if (!hasPrice) return null;

  return Object.entries(groups)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Agrupa items por almacén y suma unidades
 */
export function groupByWarehouseUnits(snapshots: StockSnapshot[]): ChartData[] | null {
  if (!snapshots || snapshots.length === 0) return null;

  const groups: Record<string, number> = {};
  
  snapshots.forEach(snapshot => {
    const warehouse = snapshot.warehouses?.name || snapshot.warehouses?.code || 'Sin almacén';
    groups[warehouse] = (groups[warehouse] || 0) + snapshot.qty;
  });

  return Object.entries(groups)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Agrupa items por almacén y suma costo total
 */
export function groupByWarehouseCost(snapshots: StockSnapshot[]): ChartData[] | null {
  if (!snapshots || snapshots.length === 0) return null;

  const groups: Record<string, number> = {};
  let hasPrice = false;
  
  snapshots.forEach(snapshot => {
    const warehouse = snapshot.warehouses?.name || snapshot.warehouses?.code || 'Sin almacén';
    const price = snapshot.items?.price || 0;
    
    if (price > 0) hasPrice = true;
    
    groups[warehouse] = (groups[warehouse] || 0) + (snapshot.qty * price);
  });

  if (!hasPrice) return null;

  return Object.entries(groups)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Obtiene top N elementos de un array
 */
export function topN(data: ChartData[] | null, n: number): ChartData[] | null {
  if (!data || data.length === 0) return null;
  return data.slice(0, n);
}

/**
 * Calcula inventario total en unidades
 */
export function getTotalUnits(snapshots: StockSnapshot[]): number {
  if (!snapshots || snapshots.length === 0) return 0;
  return snapshots.reduce((sum, s) => sum + s.qty, 0);
}

/**
 * Calcula inventario total en costo
 */
export function getTotalCost(snapshots: StockSnapshot[]): number | null {
  if (!snapshots || snapshots.length === 0) return null;
  
  let hasPrice = false;
  const total = snapshots.reduce((sum, s) => {
    const price = s.items?.price || 0;
    if (price > 0) hasPrice = true;
    return sum + (s.qty * price);
  }, 0);
  
  return hasPrice ? total : null;
}

/**
 * Genera colores para gráficas
 */
export function generateColors(count: number): string[] {
  const baseColors = [
    '#3B82F6', // blue
    '#8B5CF6', // purple
    '#10B981', // green
    '#F59E0B', // amber
    '#EF4444', // red
    '#EC4899', // pink
    '#14B8A6', // teal
    '#F97316', // orange
    '#6366F1', // indigo
    '#84CC16', // lime
  ];
  
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(baseColors[i % baseColors.length]);
  }
  
  return colors;
}

/**
 * Filtra snapshots por filtros globales
 */
export function applyFilters(
  snapshots: StockSnapshot[],
  filters: {
    year?: string;
    month?: string;
    category?: string;
    marca?: string;
    warehouse?: string;
    state?: string;
  }
): StockSnapshot[] {
  let filtered = [...snapshots];
  
  if (filters.category) {
    filtered = filtered.filter(s => s.items?.category === filters.category);
  }
  
  if (filters.marca) {
    filtered = filtered.filter(s => s.items?.marca === filters.marca);
  }
  
  if (filters.warehouse) {
    filtered = filtered.filter(s => s.warehouses?.code === filters.warehouse || s.warehouses?.name === filters.warehouse);
  }
  
  if (filters.state) {
    filtered = filtered.filter(s => s.items?.state === filters.state);
  }
  
  if (filters.year || filters.month) {
    filtered = filtered.filter(s => {
      const date = new Date(s.synced_at);
      const year = date.getFullYear().toString();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      
      if (filters.year && year !== filters.year) return false;
      if (filters.month && month !== filters.month) return false;
      
      return true;
    });
  }
  
  return filtered;
}

/**
 * Obtiene opciones únicas para filtros
 */
export function getUniqueFilterOptions(snapshots: StockSnapshot[]) {
  const categories = new Set<string>();
  const marcas = new Set<string>();
  const warehouses = new Set<string>();
  const states = new Set<string>();
  const years = new Set<string>();
  
  snapshots.forEach(s => {
    if (s.items?.category) categories.add(s.items.category);
    if (s.items?.marca) marcas.add(s.items.marca);
    if (s.warehouses?.code) warehouses.add(s.warehouses.code);
    if (s.items?.state) states.add(s.items.state);
    
    const year = new Date(s.synced_at).getFullYear().toString();
    years.add(year);
  });
  
  return {
    categories: Array.from(categories).sort(),
    marcas: Array.from(marcas).sort(),
    warehouses: Array.from(warehouses).sort(),
    states: Array.from(states).sort(),
    years: Array.from(years).sort()
  };
}
