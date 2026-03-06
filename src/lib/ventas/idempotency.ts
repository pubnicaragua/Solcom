import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

type IdempotencyRecord = {
    id: string;
    key: string;
    endpoint: string;
    payload_hash: string;
    status: 'processing' | 'completed' | 'failed';
    response_status: number | null;
    response_body: any;
    document_type: string | null;
    document_id: string | null;
    external_request_id: string | null;
    expires_at: string;
};

type IdempotencyStartProceed = {
    kind: 'proceed';
    recordId: string;
    key: string;
    payloadHash: string;
    externalRequestId: string;
};

type IdempotencyStartReplay = {
    kind: 'replay';
    response: NextResponse;
};

type IdempotencyStartError = {
    kind: 'error';
    response: NextResponse;
};

export type IdempotencyStartResult =
    | IdempotencyStartProceed
    | IdempotencyStartReplay
    | IdempotencyStartError;

export type IdempotencyFinalizeParams = {
    supabase: any;
    recordId: string;
    responseStatus: number;
    responseBody: any;
    documentType?: string | null;
    documentId?: string | null;
    externalRequestId?: string | null;
};

function isRelationMissingError(message: string): boolean {
    const text = String(message || '').toLowerCase();
    return (
        text.includes('relation') &&
        text.includes('idempotency_keys') &&
        text.includes('does not exist')
    );
}

function isDuplicateError(message: string): boolean {
    const text = String(message || '').toLowerCase();
    return text.includes('duplicate key') || text.includes('unique constraint');
}

function stableStringify(value: any): string {
    if (value === null || value === undefined) return String(value);
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function buildPayloadHash(payload: any): string {
    return createHash('sha256')
        .update(stableStringify(payload))
        .digest('hex');
}

function jsonResponse(body: any, status: number): NextResponse {
    return NextResponse.json(body, { status });
}

function idempotencyConflictResponse(message: string, code = 'IDEMPOTENCY_CONFLICT'): NextResponse {
    return jsonResponse({ error: message, code }, 409);
}

function resolveExternalRequestId(key: string): string {
    return `idem_${key}`;
}

async function getExistingRecord(supabase: any, key: string, endpoint: string): Promise<IdempotencyRecord | null> {
    const { data, error } = await supabase
        .from('idempotency_keys')
        .select('*')
        .eq('key', key)
        .eq('endpoint', endpoint)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    if (error) {
        throw error;
    }

    return (data || null) as IdempotencyRecord | null;
}

export async function beginIdempotentRequest(params: {
    supabase: any;
    req: NextRequest;
    endpoint: string;
    payload: any;
    required?: boolean;
}): Promise<IdempotencyStartResult> {
    const { supabase, req, endpoint, payload, required = true } = params;
    const rawKey = req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key') || '';
    const key = rawKey.trim();

    if (!key) {
        if (!required) {
            return {
                kind: 'proceed',
                recordId: '',
                key: '',
                payloadHash: buildPayloadHash(payload),
                externalRequestId: '',
            };
        }
        return {
            kind: 'error',
            response: jsonResponse(
                {
                    error: 'Idempotency-Key es requerido para esta operación.',
                    code: 'IDEMPOTENCY_KEY_REQUIRED',
                },
                400
            ),
        };
    }

    const payloadHash = buildPayloadHash(payload);
    const externalRequestId = resolveExternalRequestId(key);

    let existing: IdempotencyRecord | null = null;
    try {
        existing = await getExistingRecord(supabase, key, endpoint);
    } catch (error: any) {
        const message = String(error?.message || '');
        if (isRelationMissingError(message)) {
            return {
                kind: 'error',
                response: jsonResponse(
                    {
                        error: 'Falta migración de resiliencia: tabla idempotency_keys no existe.',
                        code: 'RESILIENCE_MIGRATION_REQUIRED',
                    },
                    500
                ),
            };
        }
        return {
            kind: 'error',
            response: jsonResponse({ error: message || 'Error de idempotencia.' }, 500),
        };
    }

    if (existing) {
        if (existing.payload_hash !== payloadHash) {
            return {
                kind: 'error',
                response: idempotencyConflictResponse(
                    'La misma Idempotency-Key fue enviada con un payload distinto.',
                    'IDEMPOTENCY_CONFLICT'
                ),
            };
        }

        if (existing.status === 'completed' && existing.response_status && existing.response_body !== undefined) {
            const replay = NextResponse.json(existing.response_body, { status: existing.response_status });
            replay.headers.set('X-Idempotency-Replayed', 'true');
            replay.headers.set('X-Idempotency-Key', key);
            return { kind: 'replay', response: replay };
        }

        if (existing.status === 'failed' && existing.response_status && existing.response_body !== undefined) {
            const replay = NextResponse.json(existing.response_body, { status: existing.response_status });
            replay.headers.set('X-Idempotency-Replayed', 'true');
            replay.headers.set('X-Idempotency-Key', key);
            return { kind: 'replay', response: replay };
        }

        if (existing.status === 'processing') {
            return {
                kind: 'error',
                response: idempotencyConflictResponse(
                    'La solicitud con esta Idempotency-Key aún está en procesamiento.',
                    'IDEMPOTENCY_IN_PROGRESS'
                ),
            };
        }

        const retryUpdate = await supabase
            .from('idempotency_keys')
            .update({
                status: 'processing',
                updated_at: new Date().toISOString(),
                external_request_id: externalRequestId,
            })
            .eq('id', existing.id);

        if (retryUpdate.error) {
            return {
                kind: 'error',
                response: jsonResponse({ error: retryUpdate.error.message }, 500),
            };
        }

        return {
            kind: 'proceed',
            recordId: existing.id,
            key,
            payloadHash,
            externalRequestId,
        };
    }

    const insertResult = await supabase
        .from('idempotency_keys')
        .insert({
            key,
            endpoint,
            payload_hash: payloadHash,
            status: 'processing',
            external_request_id: externalRequestId,
        })
        .select('id')
        .single();

    if (insertResult.error) {
        if (isDuplicateError(insertResult.error.message || '')) {
            const loaded = await getExistingRecord(supabase, key, endpoint);
            if (loaded) {
                if (loaded.payload_hash !== payloadHash) {
                    return {
                        kind: 'error',
                        response: idempotencyConflictResponse(
                            'La misma Idempotency-Key fue enviada con un payload distinto.',
                            'IDEMPOTENCY_CONFLICT'
                        ),
                    };
                }

                if (loaded.status === 'completed' && loaded.response_status && loaded.response_body !== undefined) {
                    const replay = NextResponse.json(loaded.response_body, { status: loaded.response_status });
                    replay.headers.set('X-Idempotency-Replayed', 'true');
                    replay.headers.set('X-Idempotency-Key', key);
                    return { kind: 'replay', response: replay };
                }

                if (loaded.status === 'failed' && loaded.response_status && loaded.response_body !== undefined) {
                    const replay = NextResponse.json(loaded.response_body, { status: loaded.response_status });
                    replay.headers.set('X-Idempotency-Replayed', 'true');
                    replay.headers.set('X-Idempotency-Key', key);
                    return { kind: 'replay', response: replay };
                }

                return {
                    kind: 'error',
                    response: idempotencyConflictResponse(
                        'La solicitud con esta Idempotency-Key ya está en ejecución.',
                        'IDEMPOTENCY_IN_PROGRESS'
                    ),
                };
            }
        }

        const message = String(insertResult.error.message || '');
        if (isRelationMissingError(message)) {
            return {
                kind: 'error',
                response: jsonResponse(
                    {
                        error: 'Falta migración de resiliencia: tabla idempotency_keys no existe.',
                        code: 'RESILIENCE_MIGRATION_REQUIRED',
                    },
                    500
                ),
            };
        }

        return {
            kind: 'error',
            response: jsonResponse({ error: insertResult.error.message }, 500),
        };
    }

    return {
        kind: 'proceed',
        recordId: String(insertResult.data?.id || ''),
        key,
        payloadHash,
        externalRequestId,
    };
}

export async function finalizeIdempotentRequest(params: IdempotencyFinalizeParams): Promise<void> {
    const {
        supabase,
        recordId,
        responseStatus,
        responseBody,
        documentType = null,
        documentId = null,
        externalRequestId = null,
    } = params;

    if (!recordId) return;

    await supabase
        .from('idempotency_keys')
        .update({
            status: 'completed',
            response_status: responseStatus,
            response_body: responseBody,
            document_type: documentType,
            document_id: documentId,
            external_request_id: externalRequestId,
            updated_at: new Date().toISOString(),
        })
        .eq('id', recordId);
}

export async function failIdempotentRequest(params: {
    supabase: any;
    recordId: string;
    responseStatus?: number;
    responseBody?: any;
}): Promise<void> {
    const { supabase, recordId, responseStatus = 500, responseBody = null } = params;
    if (!recordId) return;

    await supabase
        .from('idempotency_keys')
        .update({
            status: 'failed',
            response_status: responseStatus,
            response_body: responseBody,
            updated_at: new Date().toISOString(),
        })
        .eq('id', recordId);
}
