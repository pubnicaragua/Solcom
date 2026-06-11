import { createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';

type ScanTokenPayload = {
    pick_order_id: string;
    actor_user_id: string;
    exp: number;
};

function secret(): string {
    const value = String(
        process.env.PICKING_SCAN_SECRET
        || process.env.SUPABASE_SERVICE_ROLE_KEY
        || ''
    ).trim();
    if (!value) throw new Error('Falta configurar PICKING_SCAN_SECRET o SUPABASE_SERVICE_ROLE_KEY.');
    return value;
}

function sign(encodedPayload: string): string {
    return createHmac('sha256', secret()).update(encodedPayload).digest('base64url');
}

export function createPickingScanToken(params: {
    pickOrderId: string;
    actorUserId: string;
    ttlSeconds?: number;
}): string {
    const payload: ScanTokenPayload = {
        pick_order_id: params.pickOrderId,
        actor_user_id: params.actorUserId,
        exp: Math.floor(Date.now() / 1000) + Math.max(300, params.ttlSeconds || 8 * 60 * 60),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${sign(encoded)}`;
}

export function verifyPickingScanToken(token: string): ScanTokenPayload | null {
    const [encoded, signature, extra] = String(token || '').split('.');
    if (!encoded || !signature || extra) return null;
    const expected = sign(encoded);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    try {
        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ScanTokenPayload;
        if (!payload.pick_order_id || !payload.actor_user_id || !payload.exp) return null;
        if (payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

export function createPickingScanAdminClient() {
    const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) throw new Error('Falta configuración de Supabase para el escáner móvil.');
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
