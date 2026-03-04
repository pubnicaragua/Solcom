const EPSILON = 1e-6;

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeQuantity(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function formatQty(value: number): string {
    if (!Number.isFinite(value)) return '0';
    if (Math.abs(value - Math.round(value)) < EPSILON) {
        return String(Math.round(value));
    }
    return String(Number(value.toFixed(3)));
}

async function resolveFamilyWarehouseIds(supabase: any, warehouseId: string): Promise<string[]> {
    const selectedId = normalizeText(warehouseId);
    if (!selectedId) return [];

    const selectedWarehouseLookup = await supabase
        .from('warehouses')
        .select('id, parent_warehouse_id, active')
        .eq('id', selectedId)
        .maybeSingle();

    if (selectedWarehouseLookup.error) {
        throw new Error(`No se pudo validar la bodega seleccionada: ${selectedWarehouseLookup.error.message}`);
    }

    const selectedWarehouse = selectedWarehouseLookup.data;
    if (!selectedWarehouse?.id) {
        throw new Error('La bodega seleccionada no existe o no está disponible.');
    }

    const familyRootId = normalizeText(selectedWarehouse.parent_warehouse_id) || selectedWarehouse.id;
    const [rootLookup, childrenLookup] = await Promise.all([
        supabase
            .from('warehouses')
            .select('id, active')
            .eq('id', familyRootId)
            .maybeSingle(),
        supabase
            .from('warehouses')
            .select('id, active')
            .eq('parent_warehouse_id', familyRootId)
            .eq('active', true),
    ]);

    if (rootLookup.error) {
        throw new Error(`No se pudo validar bodega padre: ${rootLookup.error.message}`);
    }
    if (childrenLookup.error) {
        throw new Error(`No se pudo validar almacenes hijos: ${childrenLookup.error.message}`);
    }

    const familyIds = new Set<string>();
    if (rootLookup.data?.id && rootLookup.data.active !== false) {
        familyIds.add(rootLookup.data.id);
    }

    for (const row of childrenLookup.data || []) {
        if (row?.id && row.active !== false) {
            familyIds.add(row.id);
        }
    }

    if (familyIds.size === 0) {
        familyIds.add(selectedWarehouse.id);
    }

    return Array.from(familyIds);
}

async function getAvailableStockByItem(
    supabase: any,
    itemIds: string[],
    warehouseIds: string[]
): Promise<Map<string, number>> {
    const uniqueItemIds = Array.from(new Set(itemIds.filter(Boolean)));
    const uniqueWarehouseIds = Array.from(new Set(warehouseIds.filter(Boolean)));
    const availableByItem = new Map<string, number>();

    for (const itemId of uniqueItemIds) {
        availableByItem.set(itemId, 0);
    }

    if (uniqueItemIds.length === 0 || uniqueWarehouseIds.length === 0) {
        return availableByItem;
    }

    try {
        const { data, error } = await (supabase.from as any)('inventory_balance')
            .select('item_id, warehouse_id, qty_on_hand')
            .in('item_id', uniqueItemIds)
            .in('warehouse_id', uniqueWarehouseIds);

        if (error) throw error;

        for (const row of data || []) {
            const itemId = normalizeText(row?.item_id);
            if (!itemId) continue;
            const qty = normalizeQuantity(row?.qty_on_hand);
            const current = availableByItem.get(itemId) || 0;
            availableByItem.set(itemId, current + (Number.isFinite(qty) ? qty : 0));
        }
        return availableByItem;
    } catch {
        const { data, error } = await supabase
            .from('stock_snapshots')
            .select('item_id, warehouse_id, qty, synced_at')
            .in('item_id', uniqueItemIds)
            .in('warehouse_id', uniqueWarehouseIds)
            .order('synced_at', { ascending: false });

        if (error) {
            throw new Error(`No se pudo validar stock disponible: ${error.message}`);
        }

        const latestByItemWarehouse = new Set<string>();
        for (const row of data || []) {
            const itemId = normalizeText(row?.item_id);
            const warehouseId = normalizeText(row?.warehouse_id);
            if (!itemId || !warehouseId) continue;

            const key = `${itemId}__${warehouseId}`;
            if (latestByItemWarehouse.has(key)) continue;
            latestByItemWarehouse.add(key);

            const qty = normalizeQuantity(row?.qty);
            const current = availableByItem.get(itemId) || 0;
            availableByItem.set(itemId, current + (Number.isFinite(qty) ? qty : 0));
        }

        return availableByItem;
    }
}

export async function validateWarehouseFamilyStock(params: {
    supabase: any;
    warehouseId: string | null | undefined;
    items: any[];
}): Promise<{ ok: true; familyWarehouseIds: string[] } | { ok: false; error: string; familyWarehouseIds: string[] }> {
    const warehouseId = normalizeText(params.warehouseId);
    if (!warehouseId) {
        return { ok: true, familyWarehouseIds: [] };
    }

    const familyWarehouseIds = await resolveFamilyWarehouseIds(params.supabase, warehouseId);
    const requestedByItem = new Map<string, number>();

    for (let index = 0; index < (params.items || []).length; index += 1) {
        const line = params.items[index];
        const itemId = normalizeText(line?.item_id);
        if (!itemId) continue;

        const quantity = normalizeQuantity(line?.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            return {
                ok: false,
                familyWarehouseIds,
                error: `Cantidad inválida en la línea ${index + 1}.`,
            };
        }

        requestedByItem.set(itemId, (requestedByItem.get(itemId) || 0) + quantity);
    }

    const requestedItemIds = Array.from(requestedByItem.keys());
    if (requestedItemIds.length === 0) {
        return { ok: true, familyWarehouseIds };
    }

    const availableByItem = await getAvailableStockByItem(params.supabase, requestedItemIds, familyWarehouseIds);
    const itemLookup = await params.supabase
        .from('items')
        .select('id, sku, name')
        .in('id', requestedItemIds);

    const itemMeta = new Map<string, { sku: string; name: string }>();
    for (const row of itemLookup.data || []) {
        itemMeta.set(row.id, {
            sku: normalizeText(row?.sku),
            name: normalizeText(row?.name),
        });
    }

    const issues: string[] = [];
    for (const itemId of requestedItemIds) {
        const requested = requestedByItem.get(itemId) || 0;
        const available = availableByItem.get(itemId) || 0;
        if (requested > available + EPSILON) {
            const meta = itemMeta.get(itemId);
            const label = meta?.sku || meta?.name || itemId;
            issues.push(`${label}: solicitado ${formatQty(requested)}, disponible ${formatQty(available)}`);
        }
    }

    if (issues.length > 0) {
        return {
            ok: false,
            familyWarehouseIds,
            error: `Stock insuficiente en la bodega padre seleccionada (incluye hijos). ${issues.join(' | ')}`,
        };
    }

    return { ok: true, familyWarehouseIds };
}
