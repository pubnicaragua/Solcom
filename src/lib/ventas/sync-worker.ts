import { randomUUID } from 'crypto';
import {
    acquirePendingSalesSyncJobs,
    finishSalesSyncJob,
    syncSalesDocumentNow,
} from '@/lib/ventas/sync-processor';
import {
    isRedisRestConfigured,
    redisAcquireLock,
    redisReleaseLock,
} from '@/lib/redis/rest';
import { isSalesZohoRedisGuardsEnabled } from '@/lib/ventas/feature-flags';

export type SalesSyncWorkerResult = {
    ok: boolean;
    processed: number;
    success: number;
    failed: number;
    skipped: boolean;
    message: string;
    worker_id: string;
    results: Array<{
        job_id: string;
        document_type: string;
        document_id: string;
        status: 'completed' | 'failed';
        error?: string;
    }>;
};

type RunWorkerParams = {
    supabase: any;
    batchSize: number;
    workerId?: string;
    useDistributedLock?: boolean;
};

function shouldUseDistributedLock(explicit: boolean | undefined): boolean {
    if (explicit === false) return false;
    return isSalesZohoRedisGuardsEnabled() && isRedisRestConfigured();
}

export async function runSalesSyncWorkerBatch(params: RunWorkerParams): Promise<SalesSyncWorkerResult> {
    const {
        supabase,
        batchSize,
        workerId = `sales-sync-worker-${Date.now()}-${randomUUID().slice(0, 8)}`,
        useDistributedLock,
    } = params;

    const distributedLockEnabled = shouldUseDistributedLock(useDistributedLock);
    const lockKey = 'sales:sync:worker:lock';
    const lockOwner = randomUUID();
    let lockAcquired = false;

    if (distributedLockEnabled) {
        const lock = await redisAcquireLock({
            key: lockKey,
            owner: lockOwner,
            ttlSeconds: 40,
        });
        if (!lock.acquired) {
            return {
                ok: true,
                processed: 0,
                success: 0,
                failed: 0,
                skipped: true,
                message: 'Otro worker está procesando la cola.',
                worker_id: workerId,
                results: [],
            };
        }
        lockAcquired = true;
    }

    try {
        const jobs = await acquirePendingSalesSyncJobs({
            supabase,
            workerId,
            batchSize,
        });

        if (!jobs.length) {
            return {
                ok: true,
                processed: 0,
                success: 0,
                failed: 0,
                skipped: false,
                message: 'No hay jobs pendientes en sales_sync_queue.',
                worker_id: workerId,
                results: [],
            };
        }

        let success = 0;
        let failed = 0;
        const results: SalesSyncWorkerResult['results'] = [];

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
                    error: String(error?.message || error || 'Error desconocido'),
                });
            }
        }

        return {
            ok: true,
            processed: jobs.length,
            success,
            failed,
            skipped: false,
            message: 'Batch procesado.',
            worker_id: workerId,
            results,
        };
    } finally {
        if (lockAcquired) {
            await redisReleaseLock({ key: lockKey, owner: lockOwner });
        }
    }
}
