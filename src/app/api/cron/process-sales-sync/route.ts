import { createClient } from '@supabase/supabase-js';
import { runSalesSyncWorkerBatch } from '@/lib/ventas/sync-worker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 120;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify({ ...data, timestamp: new Date().toISOString() }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'CDN-Cache-Control': 'no-store',
            'Vercel-CDN-Cache-Control': 'no-store',
        },
    });
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const cronSecret = searchParams.get('cron_secret');
    const expectedSecret = process.env.CRON_SECRET || 'solcom-cron-key-123';
    if (cronSecret !== expectedSecret) {
        return jsonResponse({ error: 'Unauthorized cron request' }, 401);
    }

    const batchSizeRaw = Number(searchParams.get('batch_size') || 20);
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

        return jsonResponse(result);
    } catch (error: any) {
        return jsonResponse({ error: error?.message || 'Error interno en process-sales-sync' }, 500);
    }
}
