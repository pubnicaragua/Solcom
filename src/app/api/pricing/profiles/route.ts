import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isSalesPriceProfilesEnabled } from '@/lib/ventas/feature-flags';
import { listPriceProfiles } from '@/lib/ventas/pricing';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
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
        const profileCode = normalizeText(url.searchParams.get('profile_code'));
        const itemId = normalizeText(url.searchParams.get('item_id'));
        const warehouseId = normalizeText(url.searchParams.get('warehouse_id'));
        const activeOnly = url.searchParams.get('active') !== '0';
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
