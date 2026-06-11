import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const pick = await supabase
        .from('warehouse_pick_orders')
        .select('id')
        .eq('id', params.id)
        .maybeSingle();
    if (pick.error) return NextResponse.json({ error: pick.error.message }, { status: 500 });
    if (!pick.data) return NextResponse.json({ error: 'Orden de alistamiento no encontrada.' }, { status: 404 });
    const requestOrigin = new URL(req.url).origin;
    const configuredOrigin = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').trim().replace(/\/+$/, '');
    const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
    const origin = configuredOrigin || vercelOrigin || requestOrigin;
    return NextResponse.json({
        token: params.id,
        url: `${origin}/alistamiento/escanear/${params.id}`,
    });
}
