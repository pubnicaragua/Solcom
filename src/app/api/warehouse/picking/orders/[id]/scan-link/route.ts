import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import os from 'os';
import { createPickingScanToken } from '@/lib/ventas/picking-scan-token';

export const dynamic = 'force-dynamic';

function resolveLocalNetworkHost(): string | null {
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
        for (const entry of entries || []) {
            if (!entry) continue;
            if (entry.family !== 'IPv4') continue;
            if (entry.internal) continue;
            const address = String(entry.address || '').trim();
            if (!address) continue;
            if (address.startsWith('169.254.')) continue;
            return address;
        }
    }
    return null;
}

function resolveScanOrigin(req: NextRequest): string {
    const configuredOrigin = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (configuredOrigin) return configuredOrigin;

    const vercelProductionOrigin = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim().replace(/\/+$/, '');
    if (vercelProductionOrigin) {
        const withProtocol = /^https?:\/\//i.test(vercelProductionOrigin)
            ? vercelProductionOrigin
            : `https://${vercelProductionOrigin}`;
        return withProtocol;
    }

    const url = new URL(req.url);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        const networkHost = resolveLocalNetworkHost();
        if (networkHost) {
            url.hostname = networkHost;
            return url.origin;
        }
    }

    return url.origin;
}

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
    const origin = resolveScanOrigin(req);
    const token = createPickingScanToken({
        pickOrderId: params.id,
        actorUserId,
    });
    return NextResponse.json({ token, url: `${origin}/alistamiento/escanear/${token}` });
}
