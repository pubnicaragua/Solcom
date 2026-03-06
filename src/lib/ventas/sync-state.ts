export type SalesDocumentType = 'sales_order' | 'sales_invoice' | 'sales_quote';
export type SalesDocumentTable = 'sales_orders' | 'sales_invoices' | 'sales_quotes';
export type SyncStatus = 'not_requested' | 'pending_sync' | 'synced' | 'failed_sync';

const TABLE_BY_TYPE: Record<SalesDocumentType, SalesDocumentTable> = {
    sales_order: 'sales_orders',
    sales_invoice: 'sales_invoices',
    sales_quote: 'sales_quotes',
};

const TYPE_BY_TABLE: Record<SalesDocumentTable, SalesDocumentType> = {
    sales_orders: 'sales_order',
    sales_invoices: 'sales_invoice',
    sales_quotes: 'sales_quote',
};

function extractMissingColumn(message: string): string | null {
    const text = String(message || '');
    let match = text.match(/Could not find the '([^']+)' column/i);
    if (match?.[1]) return match[1];
    match = text.match(/column "?([a-zA-Z0-9_]+)"? does not exist/i);
    if (match?.[1]) return match[1];
    return null;
}

function isDuplicateError(message: string): boolean {
    const text = String(message || '').toLowerCase();
    return text.includes('duplicate key') || text.includes('unique constraint');
}

export function resolveSalesDocumentTable(documentType: SalesDocumentType): SalesDocumentTable {
    return TABLE_BY_TYPE[documentType];
}

export function resolveSalesDocumentType(table: SalesDocumentTable): SalesDocumentType {
    return TYPE_BY_TABLE[table];
}

export function normalizeSyncErrorCodeFromError(error: unknown): string {
    const message = String((error as any)?.message || error || '').toLowerCase();
    if (!message) return 'SYNC_ERROR';
    if (message.includes('too many requests') || message.includes('access denied') || message.includes('429')) {
        return 'ZOHO_RATE_LIMIT';
    }
    if (message.includes('timeout') || message.includes('timed out') || message.includes('network')) {
        return 'ZOHO_NETWORK_ERROR';
    }
    if (message.includes('oauth') || message.includes('token') || message.includes('auth')) {
        return 'ZOHO_AUTH_ERROR';
    }
    if (message.includes('invalid tax') || message.includes('tax')) {
        return 'ZOHO_TAX_ERROR';
    }
    return 'ZOHO_SYNC_ERROR';
}

async function safeUpdateDocumentColumns(params: {
    supabase: any;
    table: SalesDocumentTable;
    id: string;
    patch: Record<string, any>;
    select?: string;
}): Promise<{ data: any; error: any; patchApplied: Record<string, any> }> {
    const { supabase, table, id, select = '*', patch } = params;
    const mutablePatch = { ...patch };

    let retry = 0;
    while (retry < 16) {
        const result = await supabase
            .from(table)
            .update(mutablePatch)
            .eq('id', id)
            .select(select)
            .maybeSingle();

        if (!result.error) {
            return { data: result.data, error: null, patchApplied: mutablePatch };
        }

        const missingColumn = extractMissingColumn(result.error?.message || '');
        if (!missingColumn || !Object.prototype.hasOwnProperty.call(mutablePatch, missingColumn)) {
            return { data: result.data, error: result.error, patchApplied: mutablePatch };
        }

        delete (mutablePatch as any)[missingColumn];
        retry += 1;
    }

    return {
        data: null,
        error: new Error(`No se pudo actualizar ${table} por columnas faltantes.`),
        patchApplied: mutablePatch,
    };
}

async function getDocumentSyncAttempts(params: {
    supabase: any;
    table: SalesDocumentTable;
    id: string;
}): Promise<number> {
    const { supabase, table, id } = params;
    const result = await supabase
        .from(table)
        .select('sync_attempts')
        .eq('id', id)
        .maybeSingle();
    if (result.error) return 0;
    const raw = Number(result.data?.sync_attempts ?? 0);
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

export function buildSyncStatusPayload(row: any): {
    sync_status: SyncStatus;
    sync_error_code: string | null;
    sync_error_message: string | null;
    last_sync_attempt_at: string | null;
    last_synced_at: string | null;
} {
    const syncStatus = String(row?.sync_status || 'not_requested') as SyncStatus;
    return {
        sync_status: syncStatus,
        sync_error_code: row?.sync_error_code ?? null,
        sync_error_message: row?.sync_error_message ?? null,
        last_sync_attempt_at: row?.last_sync_attempt_at ?? null,
        last_synced_at: row?.last_synced_at ?? null,
    };
}

export async function markDocumentSyncState(params: {
    supabase: any;
    documentType: SalesDocumentType;
    documentId: string;
    status: SyncStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    externalRequestId?: string | null;
    incrementAttempts?: boolean;
}): Promise<{ data: any; error: any }> {
    const {
        supabase,
        documentType,
        documentId,
        status,
        errorCode = null,
        errorMessage = null,
        externalRequestId = null,
        incrementAttempts = false,
    } = params;

    const table = resolveSalesDocumentTable(documentType);
    const now = new Date().toISOString();
    const patch: Record<string, any> = {
        sync_status: status,
        last_sync_attempt_at: now,
        updated_at: now,
    };

    if (externalRequestId) {
        patch.external_request_id = externalRequestId;
    }

    if (incrementAttempts) {
        const currentAttempts = await getDocumentSyncAttempts({
            supabase,
            table,
            id: documentId,
        });
        patch.sync_attempts = currentAttempts + 1;
    }

    if (status === 'synced') {
        patch.sync_error_code = null;
        patch.sync_error_message = null;
        patch.last_synced_at = now;
    } else if (status === 'not_requested') {
        patch.sync_error_code = null;
        patch.sync_error_message = null;
    } else {
        patch.sync_error_code = errorCode;
        patch.sync_error_message = errorMessage;
    }

    return safeUpdateDocumentColumns({
        supabase,
        table,
        id: documentId,
        patch,
        select: 'id, sync_status, sync_error_code, sync_error_message, last_sync_attempt_at, last_synced_at, sync_attempts, external_request_id',
    });
}

export async function enqueueSalesSyncJob(params: {
    supabase: any;
    documentType: SalesDocumentType;
    documentId: string;
    action?: string;
    priority?: number;
    idempotencyKey?: string | null;
    payloadHash?: string | null;
    externalRequestId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    nextAttemptAt?: string | null;
}): Promise<{ queued: boolean; job: any; error: any }> {
    const {
        supabase,
        documentType,
        documentId,
        action = 'sync_create',
        priority = 50,
        idempotencyKey = null,
        payloadHash = null,
        externalRequestId = null,
        errorCode = null,
        errorMessage = null,
        nextAttemptAt = null,
    } = params;

    const payload = {
        document_type: documentType,
        document_id: documentId,
        action,
        status: 'pending',
        priority,
        attempts: 0,
        idempotency_key: idempotencyKey,
        payload_hash: payloadHash,
        external_request_id: externalRequestId,
        error_code: errorCode,
        error_message: errorMessage,
        next_attempt_at: nextAttemptAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const insertResult = await supabase
        .from('sales_sync_queue')
        .insert(payload)
        .select('*')
        .single();

    if (!insertResult.error) {
        return { queued: true, job: insertResult.data, error: null };
    }

    if (isDuplicateError(insertResult.error.message || '')) {
        const existing = await supabase
            .from('sales_sync_queue')
            .select('*')
            .eq('document_type', documentType)
            .eq('document_id', documentId)
            .eq('action', action)
            .in('status', ['pending', 'processing'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!existing.error && existing.data) {
            return { queued: false, job: existing.data, error: null };
        }
    }

    return { queued: false, job: null, error: insertResult.error };
}

export async function findDocumentTypeById(params: {
    supabase: any;
    id: string;
}): Promise<SalesDocumentType | null> {
    const { supabase, id } = params;
    const checks: Array<{ table: SalesDocumentTable; type: SalesDocumentType }> = [
        { table: 'sales_orders', type: 'sales_order' },
        { table: 'sales_invoices', type: 'sales_invoice' },
        { table: 'sales_quotes', type: 'sales_quote' },
    ];

    for (const check of checks) {
        const result = await supabase
            .from(check.table)
            .select('id')
            .eq('id', id)
            .maybeSingle();

        if (!result.error && result.data?.id) {
            return check.type;
        }
    }
    return null;
}

