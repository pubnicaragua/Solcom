import { createClient } from '@supabase/supabase-js';
import { runSalesSyncWorkerBatch } from '@/lib/ventas/sync-worker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 120;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function jsonNoStore(body: any, status = 200) {
    return new Response(JSON.stringify({ ...body, timestamp: new Date().toISOString() }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'CDN-Cache-Control': 'no-store',
            'Vercel-CDN-Cache-Control': 'no-store',
        },
    });
}

function resolveAuthSecret(): string {
    return String(process.env.SALES_SYNC_WORKER_SECRET || process.env.CRON_SECRET || '').trim();
}

function isAuthorized(request: Request): boolean {
    const expected = resolveAuthSecret();
    if (!expected) return false;
    const authHeader = String(request.headers.get('authorization') || '').trim();
    if (authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim() === expected;
    }
    const url = new URL(request.url);
    const queryToken = String(url.searchParams.get('worker_secret') || '').trim();
    return queryToken === expected;
}

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return jsonNoStore({ error: 'Unauthorized worker request' }, 401);
    }

    const url = new URL(request.url);
    const batchSizeRaw = Number(url.searchParams.get('batch_size') || 20);
    const batchSize = Math.max(1, Math.min(100, Number.isFinite(batchSizeRaw) ? batchSizeRaw : 20));
    const workerId = `sales-sync-worker-${Date.now()}`;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const result = await runSalesSyncWorkerBatch({
            supabase,
            batchSize,
            workerId,
            useDistributedLock: true,
        });
        return jsonNoStore(result);
    } catch (error: any) {
        return jsonNoStore(
            { error: error?.message || 'Error interno en sync worker' },
            500
        );
    }
}
