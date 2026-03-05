import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getZohoTaxCatalog } from '@/lib/zoho/tax-catalog';

export const dynamic = 'force-dynamic';

// GET /api/zoho/taxes — catálogo de impuestos Zoho normalizado para formularios
export async function GET(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const force = searchParams.get('force') === '1';
        const includeInactive = searchParams.get('include_inactive') === '1';

        const taxes = await getZohoTaxCatalog({ force_refresh: force });
        const filtered = (taxes || []).filter((tax) => {
            if (!includeInactive && !tax.active) return false;
            if (!tax.is_editable) return false;
            return true;
        });

        return NextResponse.json({
            taxes: filtered,
            total: filtered.length,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || 'No se pudo cargar el catálogo de impuestos.' },
            { status: 500 }
        );
    }
}
