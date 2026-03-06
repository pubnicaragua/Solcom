import { createClient } from '@supabase/supabase-js';
import {
    acquirePendingSalesSyncJobs,
    finishSalesSyncJob,
    syncSalesDocumentNow,
} from '@/lib/ventas/sync-processor';

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
        const jobs = await acquirePendingSalesSyncJobs({
            supabase,
            workerId,
            batchSize,
        });

        if (!jobs.length) {
            return jsonResponse({
                ok: true,
                processed: 0,
                success: 0,
                failed: 0,
                message: 'No hay jobs pendientes en sales_sync_queue.',
            });
        }

        let success = 0;
        let failed = 0;
        const results: any[] = [];

        for (const job of jobs) {
            try {
                await syncSalesDocumentNow({
                    supabase,
                    documentType: job.document_type,
                    documentId: job.document_id,
                    externalRequestId: job.external_request_id || null,
                });

                await finishSalesSyncJob({
                    supabase,
                    job,
                    success: true,
                });

                success += 1;
                results.push({
                    job_id: job.id,
                    document_type: job.document_type,
                    document_id: job.document_id,
                    status: 'completed',
                });
            } catch (error: any) {
                await finishSalesSyncJob({
                    supabase,
                    job,
                    success: false,
                    error,
                });
                failed += 1;
                results.push({
                    job_id: job.id,
                    document_type: job.document_type,
                    document_id: job.document_id,
                    status: 'failed',
                    error: error?.message || 'Error desconocido',
                });
            }
        }

        return jsonResponse({
            ok: true,
            processed: jobs.length,
            success,
            failed,
            results,
        });
    } catch (error: any) {
        return jsonResponse({ error: error?.message || 'Error interno en process-sales-sync' }, 500);
    }
}
