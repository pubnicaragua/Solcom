export type InventorySyncQueueJob = {
    id: string;
    zoho_item_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    attempts: number;
    error?: string | null;
    created_at?: string;
    updated_at?: string;
    next_attempt_at?: string;
    locked_at?: string | null;
    locked_by?: string | null;
};

function isMissingRpc(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === 'PGRST202' || code === '42883' || message.includes('could not find the function');
}

function normalizeIds(values: unknown[]): string[] {
    return Array.from(new Set(
        values
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
    ));
}

export async function enqueueInventorySyncItems(
    supabase: any,
    values: unknown[]
): Promise<{ requested: number; queued: number; coalesced: number; fallback: boolean }> {
    const itemIds = normalizeIds(values);
    if (itemIds.length === 0) {
        return { requested: 0, queued: 0, coalesced: 0, fallback: false };
    }

    const rpcResult = await supabase.rpc('enqueue_inventory_sync_items', {
        p_zoho_item_ids: itemIds,
    });

    if (!rpcResult.error) {
        const payload = rpcResult.data || {};
        return {
            requested: Number(payload.requested || itemIds.length),
            queued: Number(payload.queued || itemIds.length),
            coalesced: Number(payload.coalesced || 0),
            fallback: false,
        };
    }

    if (!isMissingRpc(rpcResult.error)) {
        throw new Error(`No se pudo encolar inventario: ${rpcResult.error.message}`);
    }

    // Compatibilidad durante el despliegue: evita duplicados comunes hasta que
    // la migración con el índice parcial y el RPC esté aplicada.
    const existingResult = await supabase
        .from('sync_queue')
        .select('zoho_item_id')
        .in('zoho_item_id', itemIds)
        .eq('status', 'pending');

    if (existingResult.error) {
        throw new Error(`No se pudo revisar la cola: ${existingResult.error.message}`);
    }

    const existing = new Set(
        (existingResult.data || []).map((row: any) => String(row.zoho_item_id))
    );
    const missing = itemIds.filter((itemId) => !existing.has(itemId));

    if (missing.length > 0) {
        const insertResult = await supabase
            .from('sync_queue')
            .insert(missing.map((zohoItemId) => ({
                zoho_item_id: zohoItemId,
                status: 'pending',
            })));

        if (insertResult.error) {
            throw new Error(`No se pudo encolar inventario: ${insertResult.error.message}`);
        }
    }

    return {
        requested: itemIds.length,
        queued: missing.length,
        coalesced: itemIds.length - missing.length,
        fallback: true,
    };
}

export async function claimInventorySyncJobs(params: {
    supabase: any;
    batchSize: number;
    workerId: string;
    staleAfterSeconds?: number;
}): Promise<{ jobs: InventorySyncQueueJob[]; fallback: boolean }> {
    const { supabase, workerId } = params;
    const batchSize = Math.max(1, Math.min(50, Math.floor(params.batchSize)));
    const staleAfterSeconds = Math.max(120, Math.floor(params.staleAfterSeconds ?? 300));

    const rpcResult = await supabase.rpc('claim_inventory_sync_jobs', {
        p_batch_size: batchSize,
        p_worker_id: workerId,
        p_stale_after_seconds: staleAfterSeconds,
    });

    if (!rpcResult.error) {
        return {
            jobs: Array.isArray(rpcResult.data) ? rpcResult.data as InventorySyncQueueJob[] : [],
            fallback: false,
        };
    }

    if (!isMissingRpc(rpcResult.error)) {
        throw new Error(`No se pudo reclamar la cola: ${rpcResult.error.message}`);
    }

    const staleBefore = new Date(Date.now() - staleAfterSeconds * 1000).toISOString();
    await supabase
        .from('sync_queue')
        .update({ status: 'pending', error: 'Trabajo recuperado por timeout.' })
        .eq('status', 'processing')
        .lt('updated_at', staleBefore);

    const pendingResult = await supabase
        .from('sync_queue')
        .select('id, zoho_item_id, status, attempts, error, created_at, updated_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(batchSize);

    if (pendingResult.error || !Array.isArray(pendingResult.data)) {
        throw new Error(`No se pudo leer la cola: ${pendingResult.error?.message || 'respuesta inválida'}`);
    }

    const ids = pendingResult.data.map((job: any) => String(job.id));
    if (ids.length === 0) return { jobs: [], fallback: true };

    const lockResult = await supabase
        .from('sync_queue')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .in('id', ids)
        .eq('status', 'pending')
        .select('id, zoho_item_id, status, attempts, error, created_at, updated_at');

    if (lockResult.error) {
        throw new Error(`No se pudo bloquear la cola: ${lockResult.error.message}`);
    }

    return {
        // Procesar únicamente las filas que este update realmente reclamó.
        // Si dos cron coinciden durante la ventana previa a la migración, el
        // segundo recibe una lista vacía en lugar de procesar los mismos IDs.
        jobs: Array.isArray(lockResult.data)
            ? lockResult.data as InventorySyncQueueJob[]
            : [],
        fallback: true,
    };
}

export async function finishInventorySyncJob(params: {
    supabase: any;
    job: InventorySyncQueueJob;
    workerId: string;
    success: boolean;
    retryable?: boolean;
    error?: unknown;
    maxAttempts?: number;
}): Promise<void> {
    const {
        supabase,
        job,
        workerId,
        success,
        retryable = true,
        maxAttempts = 5,
    } = params;
    const errorMessage = success
        ? null
        : String((params.error as any)?.message || params.error || 'Error desconocido').slice(0, 1000);

    const rpcResult = await supabase.rpc('finish_inventory_sync_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_success: success,
        p_retryable: retryable,
        p_error: errorMessage,
        p_max_attempts: Math.max(1, Math.floor(maxAttempts)),
    });

    if (!rpcResult.error) return;
    if (!isMissingRpc(rpcResult.error)) {
        throw new Error(`No se pudo finalizar trabajo de inventario: ${rpcResult.error.message}`);
    }

    const nextAttempts = Math.max(0, Number(job.attempts || 0)) + 1;
    const shouldRetry = !success && retryable && nextAttempts < maxAttempts;
    const updatePayload: Record<string, unknown> = {
        status: success ? 'completed' : (shouldRetry ? 'pending' : 'failed'),
        attempts: nextAttempts,
        error: errorMessage,
        updated_at: new Date().toISOString(),
    };

    const updateResult = await supabase
        .from('sync_queue')
        .update(updatePayload)
        .eq('id', job.id)
        .eq('status', 'processing');

    if (updateResult.error) {
        throw new Error(`No se pudo finalizar trabajo de inventario: ${updateResult.error.message}`);
    }
}
