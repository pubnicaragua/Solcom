import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
    enqueueDocumentForSync,
    finishSalesSyncJob,
    syncSalesDocumentNow,
} from '@/lib/ventas/sync-processor';
import {
    findDocumentTypeById,
    markDocumentSyncState,
    SalesDocumentType,
} from '@/lib/ventas/sync-state';

export const dynamic = 'force-dynamic';

function jsonNoStore(payload: any, status = 200) {
    return NextResponse.json(payload, {
        status,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'CDN-Cache-Control': 'no-store',
            'Vercel-CDN-Cache-Control': 'no-store',
        },
    });
}

function normalizeDocumentType(value: unknown): SalesDocumentType | null {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return null;
    if (text === 'sales_order' || text === 'sales_orders' || text === 'order' || text === 'ov') {
        return 'sales_order';
    }
    if (text === 'sales_invoice' || text === 'sales_invoices' || text === 'invoice' || text === 'factura') {
        return 'sales_invoice';
    }
    if (text === 'sales_quote' || text === 'sales_quotes' || text === 'quote' || text === 'cotizacion' || text === 'cotización') {
        return 'sales_quote';
    }
    return null;
}

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return jsonNoStore({ error: 'No autorizado' }, 401);
        }

        const documentId = String(params.id || '').trim();
        if (!documentId) {
            return jsonNoStore({ error: 'ID inválido.' }, 400);
        }

        let body: any = {};
        try {
            body = await req.json();
        } catch {
            body = {};
        }

        let documentType = normalizeDocumentType(body?.document_type);
        if (!documentType) {
            documentType = await findDocumentTypeById({
                supabase,
                id: documentId,
            });
        }

        if (!documentType) {
            return jsonNoStore({ error: 'No se pudo resolver el tipo de documento para reintento.' }, 404);
        }

        const idempotencyKey = req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key') || null;
        const immediate = body?.immediate === undefined ? true : Boolean(body.immediate);
        const externalRequestId = idempotencyKey ? `idem_${String(idempotencyKey).trim()}` : `retry_${Date.now()}`;

        await markDocumentSyncState({
            supabase,
            documentType,
            documentId,
            status: 'pending_sync',
            errorCode: 'MANUAL_RETRY',
            errorMessage: 'Reintento manual solicitado.',
            externalRequestId,
            incrementAttempts: false,
        });

        const queueResult = await enqueueDocumentForSync({
            supabase,
            documentType,
            documentId,
            idempotencyKey: idempotencyKey || null,
            payloadHash: null,
            externalRequestId,
            errorCode: 'MANUAL_RETRY',
            errorMessage: 'Reintento manual solicitado.',
            priority: 1,
        });

        if (queueResult.error) {
            return jsonNoStore({ error: queueResult.error.message || 'No se pudo encolar reintento.' }, 500);
        }

        if (immediate && queueResult.job) {
            try {
                await syncSalesDocumentNow({
                    supabase,
                    documentType,
                    documentId,
                    externalRequestId,
                });
                await finishSalesSyncJob({
                    supabase,
                    job: queueResult.job,
                    success: true,
                });

                return jsonNoStore({
                    ok: true,
                    synced_now: true,
                    document_type: documentType,
                    document_id: documentId,
                    sync_status: 'synced',
                    job_id: queueResult.job.id,
                });
            } catch (error: any) {
                await finishSalesSyncJob({
                    supabase,
                    job: queueResult.job,
                    success: false,
                    error,
                });

                return jsonNoStore(
                    {
                        ok: true,
                        synced_now: false,
                        code: 'SYNC_PENDING',
                        document_type: documentType,
                        document_id: documentId,
                        sync_status: 'pending_sync',
                        warning: error?.message || 'Error al sincronizar inmediatamente; quedó en cola.',
                        job_id: queueResult.job.id,
                    },
                    202
                );
            }
        }

        return jsonNoStore(
            {
                ok: true,
                synced_now: false,
                code: 'SYNC_PENDING',
                document_type: documentType,
                document_id: documentId,
                sync_status: 'pending_sync',
                job_id: queueResult.job?.id || null,
            },
            202
        );
    } catch (error: any) {
        return jsonNoStore({ error: error?.message || 'Error interno' }, 500);
    }
}
