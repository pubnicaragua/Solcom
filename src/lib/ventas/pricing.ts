export type PriceResolutionSource =
    | 'line_override'
    | 'profile_warehouse'
    | 'profile_global'
    | 'item_price'
    | 'fallback_zero';

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export async function resolveUnitPrice(params: {
    supabase: any;
    itemId: string;
    warehouseId?: string | null;
    profileCode?: string | null;
    lineUnitPrice?: number | null;
}): Promise<{ unit_price: number; source: PriceResolutionSource; profile_code: string | null }> {
    const { supabase, itemId } = params;
    const warehouseId = normalizeText(params.warehouseId);
    const profileCode = normalizeText(params.profileCode);
    const lineUnitPrice = normalizeNumber(params.lineUnitPrice, Number.NaN);

    if (Number.isFinite(lineUnitPrice) && lineUnitPrice > 0) {
        return {
            unit_price: Math.max(0, lineUnitPrice),
            source: 'line_override',
            profile_code: profileCode || null,
        };
    }

    if (profileCode) {
        if (warehouseId) {
            const byWarehouse = await supabase
                .from('item_price_profiles')
                .select('profile_code, unit_price')
                .eq('item_id', itemId)
                .eq('profile_code', profileCode)
                .eq('warehouse_id', warehouseId)
                .eq('active', true)
                .maybeSingle();

            if (!byWarehouse.error && byWarehouse.data) {
                return {
                    unit_price: Math.max(0, normalizeNumber(byWarehouse.data.unit_price, 0)),
                    source: 'profile_warehouse',
                    profile_code: normalizeText(byWarehouse.data.profile_code) || profileCode,
                };
            }
        }

        const globalProfile = await supabase
            .from('item_price_profiles')
            .select('profile_code, unit_price')
            .eq('item_id', itemId)
            .eq('profile_code', profileCode)
            .is('warehouse_id', null)
            .eq('active', true)
            .maybeSingle();

        if (!globalProfile.error && globalProfile.data) {
            return {
                unit_price: Math.max(0, normalizeNumber(globalProfile.data.unit_price, 0)),
                source: 'profile_global',
                profile_code: normalizeText(globalProfile.data.profile_code) || profileCode,
            };
        }
    }

    const itemPrice = await supabase
        .from('items')
        .select('price')
        .eq('id', itemId)
        .maybeSingle();

    const basePrice = Math.max(0, normalizeNumber(itemPrice.data?.price, 0));
    if (basePrice > 0) {
        return {
            unit_price: basePrice,
            source: 'item_price',
            profile_code: profileCode || null,
        };
    }

    return {
        unit_price: 0,
        source: 'fallback_zero',
        profile_code: profileCode || null,
    };
}

export async function listPriceProfiles(params: {
    supabase: any;
    profileCode?: string | null;
    itemId?: string | null;
    warehouseId?: string | null;
    activeOnly?: boolean;
    limit?: number;
}) {
    const { supabase } = params;
    const profileCode = normalizeText(params.profileCode);
    const itemId = normalizeText(params.itemId);
    const warehouseId = normalizeText(params.warehouseId);
    const activeOnly = params.activeOnly !== false;
    const limit = Math.max(1, Math.min(500, Number(params.limit || 200)));

    let query = supabase
        .from('item_price_profiles')
        .select('id, item_id, warehouse_id, profile_code, unit_price, currency_code, active, metadata, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(limit);

    if (activeOnly) query = query.eq('active', true);
    if (profileCode) query = query.eq('profile_code', profileCode);
    if (itemId) query = query.eq('item_id', itemId);
    if (warehouseId) query = query.eq('warehouse_id', warehouseId);

    const result = await query;
    return {
        data: Array.isArray(result.data) ? result.data : [],
        error: result.error || null,
    };
}
