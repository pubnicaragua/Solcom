import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function json(data: Record<string, any>, status = 200) {
    return NextResponse.json(
        {
            ...data,
            timestamp: new Date().toISOString(),
        },
        {
            status,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            },
        }
    );
}

function isAuthorized(request: Request): boolean {
    const expectedSecret = normalizeText(process.env.CRON_SECRET);
    if (!expectedSecret) return true;

    const url = new URL(request.url);
    const querySecret = normalizeText(url.searchParams.get('cron_secret'));
    if (querySecret && querySecret === expectedSecret) return true;

    const authHeader = normalizeText(request.headers.get('authorization'));
    return authHeader === `Bearer ${expectedSecret}`;
}

export async function POST(request: Request) {
    try {
        if (!isAuthorized(request)) {
            return json({ error: 'Unauthorized cron request' }, 401);
        }

        const supabaseUrl = normalizeText(process.env.NEXT_PUBLIC_SUPABASE_URL);
        const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY);
        if (!supabaseUrl || !serviceRoleKey) {
            return json(
                { error: 'Falta configuración SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_URL' },
                500
            );
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data, error } = await supabase.rpc('fn_expire_serial_reservations');
        if (error) {
            return json({ error: `No se pudo expirar reservas: ${error.message}` }, 500);
        }

        const expiredCount = Number(data || 0) || 0;
        return json({
            success: true,
            expired_count: expiredCount,
            message: `Reservas expiradas en esta corrida: ${expiredCount}`,
        });
    } catch (error: any) {
        return json({ error: error?.message || 'Error interno' }, 500);
    }
}
