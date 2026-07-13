import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import { syncItemStock } from '@/lib/zoho/sync-logic';
import { requireZohoOrganizationId } from '@/lib/zoho/config';
import {
    claimInventorySyncJobs,
    finishInventorySyncJob,
    type InventorySyncQueueJob,
} from '@/lib/zoho/sync-queue';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 120;

const DEFAULT_BATCH_SIZE = 30;
const MAX_BATCH_SIZE = 50;
const WORKER_TIME_BUDGET_MS = 100_000;

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

function configuredBatchSize(): number {
    const parsed = Number(process.env.INVENTORY_SYNC_BATCH_SIZE || DEFAULT_BATCH_SIZE);
    if (!Number.isFinite(parsed)) return DEFAULT_BATCH_SIZE;
    return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(parsed)));
}

async function queueStatusCounts(supabase: any) {
    const statuses = ['pending', 'processing', 'completed', 'failed'] as const;
    const results = await Promise.all(statuses.map(async (status) => {
        const result = await supabase
            .from('sync_queue')
            .select('id', { count: 'exact', head: true })
            .eq('status', status);
        if (result.error) {
            throw new Error(`No se pudo contar sync_queue (${status}): ${result.error.message}`);
        }
        return [status, result.count ?? 0] as const;
    }));
    return Object.fromEntries(results);
}

async function finishClaimedJobsAfterFatalError(params: {
    supabase: any;
    jobs: InventorySyncQueueJob[];
    workerId: string;
    error: unknown;
}) {
    await Promise.allSettled(params.jobs.map((job) => finishInventorySyncJob({
        supabase: params.supabase,
        job,
        workerId: params.workerId,
        success: false,
        retryable: true,
        error: params.error,
    })));
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const cronSecret = searchParams.get('cron_secret');
    const expectedSecret = String(process.env.CRON_SECRET || '').trim();

    if (!expectedSecret) {
        return jsonResponse({ error: 'Configuración incompleta: falta CRON_SECRET.' }, 500);
    }

    if (cronSecret !== expectedSecret) {
        return jsonResponse({ error: 'Unauthorized cron request' }, 401);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        return jsonResponse({
            error: 'Configuración incompleta: el worker requiere Supabase URL y service role key.',
        }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const debugLog: string[] = [];
    const workerId = `inventory-sync-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const batchSize = configuredBatchSize();
    const startedAt = Date.now();
    let claimedJobs: InventorySyncQueueJob[] = [];

    try {
        const beforeCounts = await queueStatusCounts(supabase);
        debugLog.push(`Queue before: ${JSON.stringify(beforeCounts)}`);

        const claimResult = await claimInventorySyncJobs({
            supabase,
            batchSize,
            workerId,
            staleAfterSeconds: 300,
        });
        claimedJobs = claimResult.jobs;

        if (claimResult.fallback) {
            debugLog.push('WARN: Queue RPC no disponible; usando fallback no atómico. Aplicar migración SQL.');
        }

        if (claimedJobs.length === 0) {
            return jsonResponse({
                message: 'No pending items in queue',
                processed: 0,
                workerId,
                queue: beforeCounts,
                debug: debugLog,
            });
        }

        debugLog.push(`Claimed ${claimedJobs.length} jobs as ${workerId}.`);

        const auth = await getZohoAccessToken();
        if (!auth || 'error' in auth) {
            const error = new Error(`Global Zoho auth failed: ${(auth as any)?.error || 'Unknown'}`);
            await finishClaimedJobsAfterFatalError({ supabase, jobs: claimedJobs, workerId, error });
            claimedJobs = [];
            throw error;
        }

        const organizationId = requireZohoOrganizationId();
        const headers = { Authorization: `Zoho-oauthtoken ${auth.accessToken}` };

        // Mantiene nombres y estados de bodegas alineados. Los errores aquí no
        // impiden procesar si el mapa local ya está completo.
        try {
            const itemListRes = await fetch(
                `${auth.apiDomain}/inventory/v1/items?organization_id=${organizationId}&page=1&per_page=1`,
                { headers, cache: 'no-store' }
            );
            if (!itemListRes.ok) {
                throw new Error(`Zoho warehouse seed failed: ${itemListRes.status}`);
            }
            const itemListData = await itemListRes.json();
            const sampleItemId = itemListData.items?.[0]?.item_id;

            if (sampleItemId) {
                const locationsRes = await fetch(
                    `${auth.apiDomain}/inventory/v1/items/${sampleItemId}/locationdetails?organization_id=${organizationId}`,
                    { headers, cache: 'no-store' }
                );
                if (!locationsRes.ok) {
                    throw new Error(`Zoho warehouse locations failed: ${locationsRes.status}`);
                }
                const locationsData = await locationsRes.json();
                const locations = locationsData.item_location_details?.locations || [];

                for (const location of locations) {
                    const zohoId = String(location.location_id || '').trim();
                    if (!zohoId) continue;
                    const locationName = String(location.location_name || zohoId);
                    const status = String(location.status || '').trim().toLowerCase();
                    const warehouseUpdate: Record<string, unknown> = {
                        name: locationName,
                        code: locationName.substring(0, 40),
                        updated_at: new Date().toISOString(),
                    };
                    if (status) {
                        warehouseUpdate.active = status === 'active';
                    }
                    const updateResult = await supabase
                        .from('warehouses')
                        .update(warehouseUpdate)
                        .eq('zoho_warehouse_id', zohoId);
                    if (updateResult.error) {
                        throw new Error(`Warehouse ${zohoId}: ${updateResult.error.message}`);
                    }
                }
                debugLog.push(`Warehouse metadata refreshed: ${locations.length}.`);
            }
        } catch (warehouseError: any) {
            debugLog.push(`WARN warehouse refresh: ${warehouseError?.message || warehouseError}`);
        }

        const warehousesResult = await supabase
            .from('warehouses')
            .select('id, zoho_warehouse_id, active')
            .not('zoho_warehouse_id', 'is', null);
        if (warehousesResult.error) {
            throw new Error(`No se pudieron cargar bodegas: ${warehousesResult.error.message}`);
        }

        const warehouseMap = new Map(
            (warehousesResult.data || []).map((warehouse: any) => [
                String(warehouse.zoho_warehouse_id),
                { id: warehouse.id, active: warehouse.active },
            ])
        );
        if (warehouseMap.size === 0) {
            throw new Error('No hay bodegas con zoho_warehouse_id configurado.');
        }

        const cleanAuth = { accessToken: auth.accessToken, apiDomain: auth.apiDomain };
        let successCount = 0;
        let failCount = 0;
        let deferredCount = 0;

        for (let index = 0; index < claimedJobs.length; index += 1) {
            const job = claimedJobs[index];

            if (Date.now() - startedAt >= WORKER_TIME_BUDGET_MS) {
                const remaining = claimedJobs.slice(index);
                await finishClaimedJobsAfterFatalError({
                    supabase,
                    jobs: remaining,
                    workerId,
                    error: new Error('Trabajo diferido para evitar timeout del worker.'),
                });
                deferredCount += remaining.length;
                break;
            }

            const itemDebug: string[] = [];
            try {
                const result = await syncItemStock(
                    job.zoho_item_id,
                    supabase,
                    warehouseMap,
                    itemDebug,
                    cleanAuth
                );
                itemDebug.forEach((line) => debugLog.push(`[${job.zoho_item_id}] ${line}`));

                await finishInventorySyncJob({
                    supabase,
                    job,
                    workerId,
                    success: result.success,
                    retryable: result.retryable,
                    error: result.error,
                });

                if (result.success) {
                    successCount += 1;
                    debugLog.push(
                        `OK ${job.zoho_item_id} snapshots=${result.snapshotsCreated} total=${result.stockTotal}`
                    );
                } else {
                    failCount += 1;
                    debugLog.push(`FAIL ${job.zoho_item_id}: ${result.error || 'Unknown'}`);
                }
            } catch (error: any) {
                failCount += 1;
                await finishInventorySyncJob({
                    supabase,
                    job,
                    workerId,
                    success: false,
                    retryable: true,
                    error,
                });
                debugLog.push(`FAIL ${job.zoho_item_id}: ${error?.message || error}`);
            }
        }

        const afterCounts = await queueStatusCounts(supabase);
        return jsonResponse({
            ok: failCount === 0,
            message: 'Batch processing complete',
            workerId,
            total: claimedJobs.length,
            success: successCount,
            failed: failCount,
            deferred: deferredCount,
            durationMs: Date.now() - startedAt,
            queue: afterCounts,
            debug: debugLog,
        });
    } catch (error: any) {
        if (claimedJobs.length > 0) {
            await finishClaimedJobsAfterFatalError({
                supabase,
                jobs: claimedJobs,
                workerId,
                error,
            });
        }
        debugLog.push(`FATAL: ${error?.message || error}`);
        return jsonResponse({
            error: error?.message || 'Error desconocido',
            workerId,
            durationMs: Date.now() - startedAt,
            debug: debugLog,
        }, 500);
    }
}
