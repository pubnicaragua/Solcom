import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
  getAuthenticatedProfile,
  getWarehouseAccessScope,
  listWarehousesForScope,
} from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const groupBy = searchParams.get('group_by') || '';
    const search = searchParams.get('search') || '';
    const warehouse = searchParams.get('warehouse') || '';
    const state = searchParams.get('state') || '';
    const category = searchParams.get('category') || '';
    const brand = searchParams.get('brand') || '';
    const marca = searchParams.get('marca') || '';
    const color = searchParams.get('color') || '';
    const stockLevel = searchParams.get('stockLevel') || '';
    const priceRange = searchParams.get('priceRange') || '';
    const sortBy = searchParams.get('sortBy') || 'name';

    const supabase = createRouteHandlerClient({ cookies });
    const auth = await getAuthenticatedProfile(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const moduleAccess = await getEffectiveModuleAccess(supabase, auth.userId, auth.role);
    if (!hasModuleAccess(moduleAccess, 'inventory')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    const scope = await getWarehouseAccessScope(supabase, auth.userId, auth.role);
    if (!scope.canViewStock) {
      return NextResponse.json({
        data: [],
        page,
        limit,
        total: 0,
        totalPages: 0,
      });
    }

    const scopedActiveWarehouses = await listWarehousesForScope(supabase, scope, { activeOnly: true });
    const allowedWarehouseIds = scopedActiveWarehouses.map((w) => w.id);
    if (allowedWarehouseIds.length === 0) {
      return NextResponse.json({
        data: [],
        page,
        limit,
        total: 0,
        totalPages: 0,
      });
    }

    const requestedWarehouseId = warehouse
      ? scopedActiveWarehouses.find((w) => w.id === warehouse || w.code === warehouse)?.id || null
      : null;
    if (warehouse && !requestedWarehouseId) {
      return NextResponse.json({ error: 'No tienes permiso para consultar esa bodega' }, { status: 403 });
    }

    const offset = (page - 1) * limit;

    const buildBaseQuery = () => {
      let base = supabase
        .from('stock_snapshots')
        .select(`
          id,
          warehouse_id,
          item_id,
          qty,
          synced_at,
          warehouses!inner(code, name, active),
          items!inner(sku, name, color, state, category, marca, stock_total, price)
        `)
        .eq('warehouses.active', true)
        .in('warehouse_id', allowedWarehouseIds);

      if (requestedWarehouseId) {
        base = base.eq('warehouse_id', requestedWarehouseId);
      }

      if (brand || marca) {
        const value = brand || marca;
        base = base.eq('items.marca', value);
      }

      if (color) {
        base = base.ilike('items.color', `%${color}%`);
      }

      if (state) {
        base = base.eq('items.state', state);
      }

      if (category) {
        base = base.ilike('items.category', `%${category}%`);
      }

      if (priceRange) {
        if (priceRange.endsWith('+')) {
          const min = parseFloat(priceRange.replace('+', ''));
          if (!Number.isNaN(min)) {
            base = base.gte('items.price', min);
          }
        } else if (priceRange.includes('-')) {
          const [minRaw, maxRaw] = priceRange.split('-');
          const min = parseFloat(minRaw);
          const max = parseFloat(maxRaw);
          if (!Number.isNaN(min)) {
            base = base.gte('items.price', min);
          }
          if (!Number.isNaN(max)) {
            base = base.lte('items.price', max);
          }
        }
      }

      if (stockLevel) {
        switch (stockLevel) {
          case 'out':
            base = base.eq('qty', 0);
            break;
          case 'critical':
            base = base.gte('qty', 1).lte('qty', 5);
            break;
          case 'low':
            base = base.gte('qty', 6).lte('qty', 20);
            break;
          case 'medium':
            base = base.gte('qty', 21).lte('qty', 50);
            break;
          case 'high':
            base = base.gt('qty', 50);
            break;
        }
      }

      return base;
    };

    const getScopedTotalsForItems = async (itemIds: string[]) => {
      const totals = new Map<string, number>();
      if (itemIds.length === 0) return totals;

      try {
        const { data: balances, error: balanceError } = await (supabase.from as any)('inventory_balance')
          .select('item_id, warehouse_id, qty_on_hand')
          .in('item_id', itemIds)
          .in('warehouse_id', allowedWarehouseIds);

        if (balanceError) throw balanceError;

        for (const row of balances || []) {
          const itemId = String(row.item_id || '');
          if (!itemId) continue;
          totals.set(itemId, Number(totals.get(itemId) || 0) + Number(row.qty_on_hand || 0));
        }
        return totals;
      } catch (_balanceError) {
        const { data: snapshots, error: snapError } = await supabase
          .from('stock_snapshots')
          .select('item_id, warehouse_id, qty, synced_at')
          .in('item_id', itemIds)
          .in('warehouse_id', allowedWarehouseIds)
          .order('synced_at', { ascending: false });

        if (snapError) throw snapError;

        const seen = new Set<string>();
        for (const row of snapshots || []) {
          const itemId = String(row.item_id || '');
          const warehouseId = String(row.warehouse_id || '');
          if (!itemId || !warehouseId) continue;
          const key = `${itemId}__${warehouseId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          totals.set(itemId, Number(totals.get(itemId) || 0) + Number(row.qty || 0));
        }
        return totals;
      }
    };

    // Vista agrupada: una fila por producto (sin repetir por bodega)
    if (groupBy === 'item') {
      let itemIdsInWarehouse: string[] | null = null;
      if (warehouse && warehouse.trim()) {
        const whId = requestedWarehouseId;
        if (whId) {
          const { data: snapRows } = await supabase
            .from('stock_snapshots')
            .select('item_id, qty')
            .eq('warehouse_id', String(whId))
            .gt('qty', 0);
          const ids = [...new Set((snapRows || []).map((r: any) => r.item_id))];
          itemIdsInWarehouse = ids.length > 0 ? ids : null;
          // Si no hay ítems con stock en esta bodega, mostramos todos (no dejar tabla vacía)
        } else {
          itemIdsInWarehouse = null;
        }
      }

      let itemsQuery = supabase
        .from('items')
        .select('id, sku, name, color, state, category, marca, stock_total, price', { count: 'exact' })
        .is('zoho_removed_at', null);

      if (itemIdsInWarehouse !== null && itemIdsInWarehouse.length > 0) {
        itemsQuery = itemsQuery.in('id', itemIdsInWarehouse);
      }

      if (search?.trim()) {
        const t = search.trim();
        itemsQuery = itemsQuery.or(`name.ilike.%${t}%,sku.ilike.%${t}%`);
      }
      if (brand || marca) itemsQuery = itemsQuery.eq('marca', brand || marca);
      if (color) itemsQuery = itemsQuery.ilike('color', `%${color}%`);
      if (state) itemsQuery = itemsQuery.eq('state', state);
      if (category) itemsQuery = itemsQuery.ilike('category', `%${category}%`);
      if (priceRange) {
        if (priceRange.endsWith('+')) {
          const min = parseFloat(priceRange.replace('+', ''));
          if (!Number.isNaN(min)) itemsQuery = itemsQuery.gte('price', min);
        } else if (priceRange.includes('-')) {
          const [minRaw, maxRaw] = priceRange.split('-');
          const min = parseFloat(minRaw);
          const max = parseFloat(maxRaw);
          if (!Number.isNaN(min)) itemsQuery = itemsQuery.gte('price', min);
          if (!Number.isNaN(max)) itemsQuery = itemsQuery.lte('price', max);
        }
      }
      const orderCol = sortBy === 'name_desc' ? 'name' : sortBy === 'name' ? 'name' : sortBy === 'stock_asc' ? 'stock_total' : sortBy === 'stock_desc' ? 'stock_total' : 'name';
      const orderAsc = sortBy === 'stock_desc' ? false : true;
      const { data: itemsData, error: itemsError } = await itemsQuery
        .order(orderCol, { ascending: orderAsc })
        .range(offset, offset + limit - 1);

      if (itemsError) throw itemsError;

      const list = itemsData || [];
      const itemIds = list.map((r: any) => r.id);
      const scopedStockTotalByItem = await getScopedTotalsForItems(itemIds);

      // Cuántas bodegas (activas) tienen cada ítem
      let warehouseCountByItem: Record<string, number> = {};
      if (itemIds.length > 0) {
        const whIdsActive = new Set(allowedWarehouseIds);
        const { data: snapCounts } = await supabase
          .from('stock_snapshots')
          .select('item_id, warehouse_id')
          .in('warehouse_id', allowedWarehouseIds)
          .in('item_id', itemIds);
        const byItem = new Map<string, Set<string>>();
        for (const row of snapCounts || []) {
          if (whIdsActive.has(row.warehouse_id)) {
            if (!byItem.has(row.item_id)) byItem.set(row.item_id, new Set());
            byItem.get(row.item_id)!.add(row.warehouse_id);
          }
        }
        byItem.forEach((set, id) => { warehouseCountByItem[id] = set.size; });
      }

      const formatted = list.map((row: any) => ({
        id: row.id,
        item_id: row.id,
        item_name: row.name,
        sku: row.sku,
        color: row.color,
        color_hex: row.color_hex,
        state: row.state,
        category: row.category || null,
        brand: row.marca || null,
        warehouse_id: null,
        warehouse_code: null,
        warehouse_name: null,
        qty: null,
        warehouse_count: warehouseCountByItem[row.id] ?? 0,
        stock_total: scopedStockTotalByItem.get(row.id) ?? 0,
        price: row.price ?? 0,
        synced_at: null,
        grouped: true,
      }));

      const stockFiltered = stockLevel
        ? formatted.filter((row) => {
          switch (stockLevel) {
            case 'out': return row.stock_total === 0;
            case 'critical': return row.stock_total >= 1 && row.stock_total <= 5;
            case 'low': return row.stock_total >= 6 && row.stock_total <= 20;
            case 'medium': return row.stock_total >= 21 && row.stock_total <= 50;
            case 'high': return row.stock_total > 50;
            default: return true;
          }
        })
        : formatted;

      return NextResponse.json({
        data: stockFiltered,
        page,
        limit,
        total: stockFiltered.length,
        totalPages: Math.ceil(stockFiltered.length / limit),
      });
    }

    if (search) {
      const trimmed = search.trim();
      if (trimmed) {
        const startsWith = `name.ilike.${trimmed}%,sku.ilike.${trimmed}%`;
        const contains = `name.ilike.%${trimmed}%,sku.ilike.%${trimmed}%`;

        const { data: startsData, error: startsError } = await buildBaseQuery()
          .or(startsWith, { referencedTable: 'items' })
          .order('name', { ascending: true, foreignTable: 'items' });

        if (startsError) throw startsError;

        const { data: containsData, error: containsError } = await buildBaseQuery()
          .or(contains, { referencedTable: 'items' })
          .order('name', { ascending: true, foreignTable: 'items' });

        if (containsError) throw containsError;

        const seen = new Set<string>();
        const combined = [];

        for (const row of startsData || []) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            combined.push(row);
          }
        }

        for (const row of containsData || []) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            combined.push(row);
          }
        }

        const total = combined.length;
        const paged = combined.slice(offset, offset + limit);
        const scopedTotals = await getScopedTotalsForItems(
          Array.from(new Set(paged.map((row: any) => String(row.item_id || '')).filter(Boolean)))
        );

        const formattedData = paged.map((row: any) => ({
          id: row.id,
          warehouse_id: row.warehouse_id,
          item_id: row.item_id,
          item_name: row.items.name,
          color: row.items.color,
          color_hex: row.items.color_hex,
          state: row.items.state,
          sku: row.items.sku,
          category: row.items.category || null,
          brand: row.items.marca || null,
          warehouse_code: row.warehouses.code,
          warehouse_name: row.warehouses.name,
          qty: row.qty,
          stock_total: scopedTotals.get(row.item_id) ?? 0,
          price: row.items.price || 0,
          synced_at: row.synced_at,
        }));

        return NextResponse.json({
          data: formattedData,
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        });
      }
    }

    let query = buildBaseQuery();

    let orderConfig: { column: string, options?: { ascending: boolean, foreignTable?: string } } = {
      column: 'synced_at',
      options: { ascending: false }
    };

    switch (sortBy) {
      case 'name':
        orderConfig = { column: 'name', options: { ascending: true, foreignTable: 'items' } };
        break;
      case 'name_desc':
        orderConfig = { column: 'name', options: { ascending: false, foreignTable: 'items' } };
        break;
      case 'stock_asc':
        orderConfig = { column: 'qty', options: { ascending: true } };
        break;
      case 'stock_desc':
        orderConfig = { column: 'qty', options: { ascending: false } };
        break;
      case 'updated':
        orderConfig = { column: 'synced_at', options: { ascending: false } };
        break;
      default:
        if (search) {
          orderConfig = { column: 'name', options: { ascending: true, foreignTable: 'items' } };
        } else {
          orderConfig = { column: 'synced_at', options: { ascending: false } };
        }
    }

    const { data, error, count } = await query
      .order(orderConfig.column, orderConfig.options)
      .range(offset, offset + limit - 1);

    console.log('Inventory query result:', {
      dataLength: data?.length,
      count,
      error,
      filters: { search, warehouse, state, category, brand, stockLevel }
    });

    if (error) {
      console.error('Inventory query error:', error);
      throw error;
    }

    const scopedTotals = await getScopedTotalsForItems(
      Array.from(new Set((data || []).map((row: any) => String(row.item_id || '')).filter(Boolean)))
    );

    const formattedData = (data || []).map((row: any) => ({
      id: row.id,
      warehouse_id: row.warehouse_id,
      item_id: row.item_id,
      item_name: row.items.name,
      color: row.items.color,
      color_hex: row.items.color_hex,
      state: row.items.state,
      sku: row.items.sku,
      category: row.items.category || null,
      brand: row.items.marca || null,
      warehouse_code: row.warehouses.code,
      warehouse_name: row.warehouses.name,
      qty: row.qty,
      stock_total: scopedTotals.get(row.item_id) ?? 0,
      price: row.items.price || 0,
      synced_at: row.synced_at,
    }));


    return NextResponse.json({
      data: formattedData,
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error('Inventory error:', error);
    return NextResponse.json(
      { error: 'Error al obtener inventario', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
