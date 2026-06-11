import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createPickingScanToken } from '@/lib/ventas/picking-scan-token';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const pick = await supabase
        .from('warehouse_pick_orders')
        .select('id, assigned_user_id, status')
        .eq('id', params.id)
        .maybeSingle();
    if (pick.error) return NextResponse.json({ error: pick.error.message }, { status: 500 });
    if (!pick.data) return NextResponse.json({ error: 'Orden de alistamiento no encontrada.' }, { status: 404 });
    if (!['claimed', 'picking'].includes(String(pick.data.status || ''))) {
        return NextResponse.json({ error: 'Primero toma e inicia la orden de alistamiento.' }, { status: 409 });
    }
    const actorUserId = String(pick.data.assigned_user_id || '').trim();
    if (!actorUserId) return NextResponse.json({ error: 'La orden no tiene responsable de bodega asignado.' }, { status: 409 });
    const requestOrigin = new URL(req.url).origin;
    const configuredOrigin = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').trim().replace(/\/+$/, '');
    const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
    const origin = configuredOrigin || vercelOrigin || requestOrigin;
    const token = createPickingScanToken({
        pickOrderId: params.id,
        actorUserId,
    });
    return NextResponse.json({ token, url: `${origin}/alistamiento/escanear/${token}` });
}
