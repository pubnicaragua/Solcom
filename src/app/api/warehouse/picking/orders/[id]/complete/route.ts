import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getExpectedRowVersion } from '@/lib/ventas/version-conflict';
import { PickTransitionError, transitionPickOrderStatus } from '@/lib/ventas/picking';

export const dynamic = 'force-dynamic';

function jsonNoStore(body: any, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
    });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return jsonNoStore({ error: 'No autorizado' }, 401);
        }

        let body: any = {};
        try {
            body = await req.json();
        } catch {
            body = {};
        }

        const expectedRowVersion = getExpectedRowVersion(req, body);
        const pickOrder = await transitionPickOrderStatus({
            supabase,
            pickOrderId: params.id,
            action: 'complete',
            actorUserId: user.id,
            expectedRowVersion,
        });

        return jsonNoStore({ pick_order: pickOrder });
    } catch (error: any) {
        if (error instanceof PickTransitionError) {
            return jsonNoStore(
                {
                    error: error.message,
                    code: error.code,
                    ...(error.details ? error.details : {}),
                },
                error.status
            );
        }
        return jsonNoStore({ error: error?.message || 'Error interno' }, 500);
    }
}
