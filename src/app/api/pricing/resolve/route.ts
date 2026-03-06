import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isSalesPriceProfilesEnabled } from '@/lib/ventas/feature-flags';
import { resolveUnitPrice } from '@/lib/ventas/pricing';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

// GET /api/pricing/resolve?item_id=&warehouse_id=&profile_code=&line_unit_price=
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
        const itemId = normalizeText(url.searchParams.get('item_id'));
        if (!itemId) {
            return NextResponse.json({ error: 'item_id es requerido.' }, { status: 400 });
        }

        const warehouseId = normalizeText(url.searchParams.get('warehouse_id')) || null;
        const profileCode = normalizeText(url.searchParams.get('profile_code')) || null;
        const lineUnitPrice = normalizeNumber(url.searchParams.get('line_unit_price'));

        const resolved = await resolveUnitPrice({
            supabase,
            itemId,
            warehouseId,
            profileCode,
            lineUnitPrice,
        });

        return NextResponse.json({
            item_id: itemId,
            warehouse_id: warehouseId,
            profile_code: resolved.profile_code,
            unit_price: resolved.unit_price,
            source: resolved.source,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Error interno.' }, { status: 500 });
    }
}
