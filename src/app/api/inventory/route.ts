import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

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

    const supabase = createServerClient();
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
        .eq('warehouses.active', true);

      if (warehouse) {
        base = base.eq('warehouses.code', warehouse);
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

    // Vista agrupada: una fila por producto (sin repetir por bodega)
    if (groupBy === 'item') {
      let itemIdsInWarehouse: string[] | null = null;
      if (warehouse && warehouse.trim()) {
        const codeOrId = warehouse.trim();
        let whId: string | null = null;
        const { data: byCode } = await supabase
          .from('warehouses')
          .select('id')
          .eq('active', true)
          .eq('code', codeOrId)
          .limit(1);
        if (byCode?.[0]?.id) {
          whId = byCode[0].id;
        } else {
          const { data: byId } = await supabase
            .from('warehouses')
            .select('id')
            .eq('active', true)
            .eq('id', codeOrId)
            .limit(1);
          whId = byId?.[0]?.id ?? null;
        }
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
      if (stockLevel) {
        switch (stockLevel) {
          case 'out': itemsQuery = itemsQuery.eq('stock_total', 0); break;
          case 'critical': itemsQuery = itemsQuery.gte('stock_total', 1).lte('stock_total', 5); break;
          case 'low': itemsQuery = itemsQuery.gte('stock_total', 6).lte('stock_total', 20); break;
          case 'medium': itemsQuery = itemsQuery.gte('stock_total', 21).lte('stock_total', 50); break;
          case 'high': itemsQuery = itemsQuery.gt('stock_total', 50); break;
        }
      }

      const orderCol = sortBy === 'name_desc' ? 'name' : sortBy === 'name' ? 'name' : sortBy === 'stock_asc' ? 'stock_total' : sortBy === 'stock_desc' ? 'stock_total' : 'name';
      const orderAsc = sortBy === 'stock_desc' ? false : true;
      const { data: itemsData, error: itemsError, count: itemsCount } = await itemsQuery
        .order(orderCol, { ascending: orderAsc })
        .range(offset, offset + limit - 1);

      if (itemsError) throw itemsError;

      const list = itemsData || [];
      const total = itemsCount ?? list.length;
      const itemIds = list.map((r: any) => r.id);

      // Cuántas bodegas (activas) tienen cada ítem
      let warehouseCountByItem: Record<string, number> = {};
      if (itemIds.length > 0) {
        const { data: activeWh } = await supabase.from('warehouses').select('id').eq('active', true);
        const whIdsActive = new Set((activeWh ?? []).map((w: any) => w.id));
        const { data: snapCounts } = await supabase
          .from('stock_snapshots')
          .select('item_id, warehouse_id')
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
        state: row.state,
        category: row.category || null,
        brand: row.marca || null,
        warehouse_id: null,
        warehouse_code: null,
        warehouse_name: null,
        qty: null,
        warehouse_count: warehouseCountByItem[row.id] ?? 0,
        stock_total: row.stock_total ?? 0,
        price: row.price ?? 0,
        synced_at: null,
        grouped: true,
      }));

      return NextResponse.json({
        data: formatted,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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

        const formattedData = paged.map((row: any) => ({
          id: row.id,
          warehouse_id: row.warehouse_id,
          item_id: row.item_id,
          item_name: row.items.name,
          color: row.items.color,
          state: row.items.state,
          sku: row.items.sku,
          category: row.items.category || null,
          brand: row.items.marca || null,
          warehouse_code: row.warehouses.code,
          warehouse_name: row.warehouses.name,
          qty: row.qty,
          stock_total: row.items.stock_total || 0,
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

    const formattedData = (data || []).map((row: any) => ({
      id: row.id,
      warehouse_id: row.warehouse_id,
      item_id: row.item_id,
      item_name: row.items.name,
      color: row.items.color,
      state: row.items.state,
      sku: row.items.sku,
      category: row.items.category || null,
      brand: row.items.marca || null,
      warehouse_code: row.warehouses.code,
      warehouse_name: row.warehouses.name,
      qty: row.qty,
      stock_total: row.items.stock_total || 0,
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
