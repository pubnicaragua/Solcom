import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getAuthenticatedProfile } from '@/lib/auth/warehouse-permissions';
import { PickTransitionError } from '@/lib/ventas/picking';
import { markPickReadyWithScans } from '@/lib/ventas/picking-serials';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const auth = await getAuthenticatedProfile(supabase);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const body = await req.json().catch(() => ({}));
        const token = String(body?.token || '').trim();
        if (!token) return NextResponse.json({ error: 'Falta token de alistamiento.' }, { status: 400 });
        const pickOrder = await markPickReadyWithScans({
            supabase,
            pickOrderId: token,
            actorUserId: auth.userId,
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
