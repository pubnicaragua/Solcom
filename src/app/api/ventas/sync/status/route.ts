import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

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

function ageMinutes(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return 0;
    return Math.round(ms / 60000);
}

function isMissingDeleteAuditTableError(errorMessage: string): boolean {
    const text = String(errorMessage || '').toLowerCase();
    return (
        text.includes('sales_delete_sync_audit') &&
        (text.includes('does not exist') || text.includes('could not find the table'))
    );
}

export async function GET(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return jsonNoStore({ error: 'No autorizado' }, 401);
        }

        const queueRes = await supabase
            .from('sales_sync_queue')
            .select('id, document_type, document_id, status, attempts, max_attempts, error_code, error_message, created_at, updated_at, next_attempt_at')
            .order('created_at', { ascending: true })
            .limit(5000);

        if (queueRes.error) {
            return jsonNoStore({ error: queueRes.error.message }, 500);
        }

        const rows = Array.isArray(queueRes.data) ? queueRes.data : [];
        const counts = rows.reduce((acc: Record<string, number>, row: any) => {
            const status = String(row?.status || 'unknown');
            acc[status] = (acc[status] || 0) + 1;
            acc.total = (acc.total || 0) + 1;
            return acc;
        }, {});

        const pendingRows = rows.filter((row: any) => String(row?.status) === 'pending');
        const completedRows = rows.filter((row: any) => String(row?.status) === 'completed');
        const oldestPending = pendingRows.length > 0 ? pendingRows[0] : null;
        const maxPendingAge = pendingRows.reduce((max, row: any) => {
            const age = ageMinutes(row?.created_at) || 0;
            return Math.max(max, age);
        }, 0);
        const pendingAges = pendingRows
            .map((row: any) => ageMinutes(row?.created_at) || 0)
            .sort((a, b) => a - b);
        const pendingP95 = pendingAges.length > 0
            ? pendingAges[Math.min(pendingAges.length - 1, Math.floor(pendingAges.length * 0.95))]
            : 0;

        const completedLatencies = completedRows
            .map((row: any) => {
                const createdAt = new Date(String(row?.created_at || '')).getTime();
                const completedAt = new Date(String(row?.updated_at || '')).getTime();
                const ms = completedAt - createdAt;
                if (!Number.isFinite(ms) || ms < 0) return null;
                return Math.round(ms / 1000);
            })
            .filter((seconds: number | null): seconds is number => typeof seconds === 'number')
            .sort((a, b) => a - b);
        const syncLatencyP95Seconds = completedLatencies.length > 0
            ? completedLatencies[Math.min(completedLatencies.length - 1, Math.floor(completedLatencies.length * 0.95))]
            : 0;

        const errorCodeCounts = rows.reduce((acc: Record<string, number>, row: any) => {
            const code = String(row?.error_code || '').trim();
            if (!code) return acc;
            acc[code] = (acc[code] || 0) + 1;
            return acc;
        }, {});

        const [ordersPending, invoicesPending, quotesPending] = await Promise.all([
            supabase.from('sales_orders').select('id', { count: 'exact', head: true }).eq('sync_status', 'pending_sync'),
            supabase.from('sales_invoices').select('id', { count: 'exact', head: true }).eq('sync_status', 'pending_sync'),
            supabase.from('sales_quotes').select('id', { count: 'exact', head: true }).eq('sync_status', 'pending_sync'),
        ]);

        const [invoiceIssuesRes, orderIssuesRes, quoteIssuesRes] = await Promise.all([
            supabase
                .from('sales_invoices')
                .select('id, invoice_number, status, sync_status, sync_error_code, sync_error_message, sync_attempts, last_sync_attempt_at, updated_at')
                .in('sync_status', ['pending_sync', 'failed_sync'])
                .order('updated_at', { ascending: false })
                .limit(120),
            supabase
                .from('sales_orders')
                .select('id, order_number, status, sync_status, sync_error_code, sync_error_message, sync_attempts, last_sync_attempt_at, updated_at')
                .in('sync_status', ['pending_sync', 'failed_sync'])
                .order('updated_at', { ascending: false })
                .limit(120),
            supabase
                .from('sales_quotes')
                .select('id, quote_number, status, sync_status, sync_error_code, sync_error_message, sync_attempts, last_sync_attempt_at, updated_at')
                .in('sync_status', ['pending_sync', 'failed_sync'])
                .order('updated_at', { ascending: false })
                .limit(120),
        ]);

        const invoiceIssues = invoiceIssuesRes.error ? [] : (invoiceIssuesRes.data || []);
        const orderIssues = orderIssuesRes.error ? [] : (orderIssuesRes.data || []);
        const quoteIssues = quoteIssuesRes.error ? [] : (quoteIssuesRes.data || []);

        const deleteAuditRes = await supabase
            .from('sales_delete_sync_audit')
            .select('id, document_type, document_id, document_number, requested_by, requested_at, local_action, local_result, zoho_linked, zoho_external_id, zoho_operation, zoho_result_status, zoho_error_code, zoho_error_message, sync_job_id, created_at')
            .in('zoho_result_status', ['pending', 'failed'])
            .order('requested_at', { ascending: false })
            .limit(200);

        let deleteSyncIssues: any[] = [];
        if (!deleteAuditRes.error) {
            deleteSyncIssues = deleteAuditRes.data || [];
        } else if (!isMissingDeleteAuditTableError(deleteAuditRes.error.message || '')) {
            console.warn('[sync/status] No se pudo leer sales_delete_sync_audit:', deleteAuditRes.error.message);
        }

        const stuck = rows
            .filter((row: any) => {
                const status = String(row?.status || '');
                if (status !== 'processing') return false;
                const age = ageMinutes(row?.updated_at) || 0;
                return age >= 5;
            })
            .slice(0, 50)
            .map((row: any) => ({
                id: row.id,
                document_type: row.document_type,
                document_id: row.document_id,
                status: row.status,
                attempts: row.attempts,
                max_attempts: row.max_attempts,
                error_code: row.error_code,
                error_message: row.error_message,
                updated_at: row.updated_at,
                processing_age_minutes: ageMinutes(row.updated_at),
            }));

        return jsonNoStore({
            queue: {
                total: counts.total || 0,
                pending: counts.pending || 0,
                processing: counts.processing || 0,
                completed: counts.completed || 0,
                failed: counts.failed || 0,
                oldest_pending_at: oldestPending?.created_at || null,
                oldest_pending_age_minutes: oldestPending ? ageMinutes(oldestPending.created_at) : null,
                max_pending_age_minutes: maxPendingAge,
                pending_age_p95_minutes: pendingP95,
                sync_latency_p95_seconds: syncLatencyP95Seconds,
            },
            documents: {
                orders_pending_sync: ordersPending.count || 0,
                invoices_pending_sync: invoicesPending.count || 0,
                quotes_pending_sync: quotesPending.count || 0,
            },
            errors: {
                error_code_counts: errorCodeCounts,
            },
            sync_issues: {
                invoices: invoiceIssues,
                orders: orderIssues,
                quotes: quoteIssues,
            },
            delete_sync_issues: deleteSyncIssues,
            stuck_jobs: stuck,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        return jsonNoStore({ error: error?.message || 'Error interno' }, 500);
    }
}
