import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isSalesPriceProfilesEnabled } from '@/lib/ventas/feature-flags';
import { listPriceProfiles } from '@/lib/ventas/pricing';

export const dynamic = 'force-dynamic';

type SummaryProfile = {
    code: string;
    name: string;
    description: string | null;
    currency_code: string | null;
    active: boolean;
    item_count: number;
    updated_at: string | null;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isMissingTable(error: any): boolean {
    return String(error?.code || '') === '42P01';
}

function normalizeProfileCode(value: unknown): string {
    const raw = String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    return raw
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64);
}

function defaultProfileNameFromCode(code: string): string {
    return code
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || code;
}

async function getSummaryProfiles(
    supabase: ReturnType<typeof createRouteHandlerClient>,
    activeOnly: boolean
) {
    const profileMap = new Map<string, SummaryProfile>();

    const profileDefs = await (supabase as any)
        .from('price_profiles')
        .select('code, name, description, currency_code, active, updated_at')
        .order('name', { ascending: true });

    if (profileDefs.error && !isMissingTable(profileDefs.error)) {
        throw profileDefs.error;
    }

    if (!profileDefs.error) {
        for (const row of profileDefs.data || []) {
            const code = normalizeProfileCode(row?.code);
            if (!code) continue;
            if (activeOnly && row?.active === false) continue;
            profileMap.set(code, {
                code,
                name: normalizeText(row?.name) || defaultProfileNameFromCode(code),
                description: normalizeText(row?.description) || null,
                currency_code: normalizeText(row?.currency_code) || null,
                active: row?.active !== false,
                item_count: 0,
                updated_at: normalizeText(row?.updated_at) || null,
            });
        }
    }

    let pricesQuery = (supabase as any)
        .from('item_price_profiles')
        .select('profile_code, active, updated_at')
        .limit(10000);

    if (activeOnly) {
        pricesQuery = pricesQuery.eq('active', true);
    }

    const prices = await pricesQuery;
    if (prices.error) {
        if (isMissingTable(prices.error)) {
            return Array.from(profileMap.values());
        }
        throw prices.error;
    }

    for (const row of prices.data || []) {
        const code = normalizeProfileCode(row?.profile_code);
        if (!code) continue;
        const existing = profileMap.get(code);
        const updatedAt = normalizeText(row?.updated_at) || null;
        if (!existing) {
            profileMap.set(code, {
                code,
                name: defaultProfileNameFromCode(code),
                description: null,
                currency_code: null,
                active: row?.active !== false,
                item_count: 1,
                updated_at: updatedAt,
            });
            continue;
        }
        existing.item_count += 1;
        if (updatedAt && (!existing.updated_at || updatedAt > existing.updated_at)) {
            existing.updated_at = updatedAt;
        }
    }

    return Array.from(profileMap.values()).sort((a, b) => {
        const byName = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
        if (byName !== 0) return byName;
        return a.code.localeCompare(b.code, 'es', { sensitivity: 'base' });
    });
}

// GET /api/pricing/profiles
export async function GET(req: NextRequest) {
    try {
        if (!isSalesPriceProfilesEnabled()) {
            return NextResponse.json(
                { error: 'Pricing profiles deshabilitado por feature flag.' },
                { status: 404 }
            );
        }

        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const url = new URL(req.url);
        const view = normalizeText(url.searchParams.get('view')).toLowerCase();
        const activeOnly = url.searchParams.get('active') !== '0';

        if (view === 'summary') {
            const summary = await getSummaryProfiles(supabase, activeOnly);
            return NextResponse.json({
                profiles: summary,
                count: summary.length,
            });
        }

        const profileCode = normalizeText(url.searchParams.get('profile_code'));
        const itemId = normalizeText(url.searchParams.get('item_id'));
        const warehouseId = normalizeText(url.searchParams.get('warehouse_id'));
        const limitRaw = Number(url.searchParams.get('limit') || 200);

        const result = await listPriceProfiles({
            supabase,
            profileCode: profileCode || null,
            itemId: itemId || null,
            warehouseId: warehouseId || null,
            activeOnly,
            limit: Number.isFinite(limitRaw) ? limitRaw : 200,
        });

        if (result.error) {
            if (isMissingTable(result.error)) {
                return NextResponse.json({
                    profiles: [],
                    count: 0,
                    warning: 'Falta migración de pricing. Ejecuta sales-pricing-profiles-v1.sql.',
                });
            }
            return NextResponse.json({ error: result.error.message }, { status: 500 });
        }

        return NextResponse.json({
            profiles: result.data,
            count: result.data.length,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Error interno.' }, { status: 500 });
    }
}

// POST /api/pricing/profiles
// Crea o actualiza una definición de lista de precios (catálogo de perfiles).
export async function POST(req: NextRequest) {
    try {
        if (!isSalesPriceProfilesEnabled()) {
            return NextResponse.json(
                { error: 'Pricing profiles deshabilitado por feature flag.' },
                { status: 404 }
            );
        }

        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const inputCode = normalizeText(body?.code);
        const inputName = normalizeText(body?.name);
        const code = normalizeProfileCode(inputCode || inputName);
        if (!code) {
            return NextResponse.json({ error: 'code o name es requerido.' }, { status: 400 });
        }

        const profileRow = {
            code,
            name: inputName || defaultProfileNameFromCode(code),
            description: normalizeText(body?.description) || null,
            currency_code: normalizeText(body?.currency_code) || null,
            active: body?.active !== false,
        };

        const { data, error } = await (supabase as any)
            .from('price_profiles')
            .upsert(profileRow, { onConflict: 'code' })
            .select('code, name, description, currency_code, active, updated_at')
            .single();

        if (error) {
            if (isMissingTable(error)) {
                return NextResponse.json(
                    { error: 'Falta migración de pricing. Ejecuta sales-pricing-profiles-v2.sql.' },
                    { status: 500 }
                );
            }
            throw error;
        }

        return NextResponse.json({
            profile: data,
            success: true,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Error interno.' }, { status: 500 });
    }
}

// DELETE /api/pricing/profiles?code=<profile_code>&delete_prices=1
export async function DELETE(req: NextRequest) {
    try {
        if (!isSalesPriceProfilesEnabled()) {
            return NextResponse.json(
                { error: 'Pricing profiles deshabilitado por feature flag.' },
                { status: 404 }
            );
        }

        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const url = new URL(req.url);
        const code = normalizeProfileCode(url.searchParams.get('code'));
        if (!code) {
            return NextResponse.json({ error: 'code es requerido.' }, { status: 400 });
        }

        const deletePrices = url.searchParams.get('delete_prices') === '1';

        const { error: profileError } = await (supabase as any)
            .from('price_profiles')
            .delete()
            .eq('code', code);
        if (profileError && !isMissingTable(profileError)) {
            throw profileError;
        }

        if (deletePrices) {
            const { error: pricesError } = await (supabase as any)
                .from('item_price_profiles')
                .delete()
                .eq('profile_code', code);
            if (pricesError && !isMissingTable(pricesError)) {
                throw pricesError;
            }
        }

        return NextResponse.json({
            success: true,
            code,
            delete_prices: deletePrices,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Error interno.' }, { status: 500 });
    }
}
