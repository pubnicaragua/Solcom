import { NextRequest, NextResponse } from 'next/server';
import { PickTransitionError } from '@/lib/ventas/picking';
import { markPickReadyWithScans } from '@/lib/ventas/picking-serials';
import { createPickingScanAdminClient, verifyPickingScanToken } from '@/lib/ventas/picking-scan-token';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const token = String(body?.token || '').trim();
        if (!token) return NextResponse.json({ error: 'Falta token de alistamiento.' }, { status: 400 });
        const access = verifyPickingScanToken(token);
        if (!access) return NextResponse.json({ error: 'El enlace de escaneo es inválido o expiró.' }, { status: 401 });
        const supabase = createPickingScanAdminClient();
        const pickOrder = await markPickReadyWithScans({
            supabase,
            pickOrderId: access.pick_order_id,
            actorUserId: access.actor_user_id,
            expectedRowVersion: Number.isInteger(Number(body?.row_version)) ? Number(body.row_version) : null,
        });
        return NextResponse.json({ pick_order: pickOrder });
    } catch (error: any) {
        if (error instanceof PickTransitionError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
        }
        return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
    }
}
