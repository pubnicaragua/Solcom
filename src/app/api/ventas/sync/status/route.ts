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
        const oldestPending = pendingRows.length > 0 ? pendingRows[0] : null;
        const maxPendingAge = pendingRows.reduce((max, row: any) => {
            const age = ageMinutes(row?.created_at) || 0;
            return Math.max(max, age);
        }, 0);

        const [ordersPending, invoicesPending, quotesPending] = await Promise.all([
            supabase.from('sales_orders').select('id', { count: 'exact', head: true }).eq('sync_status', 'pending_sync'),
            supabase.from('sales_invoices').select('id', { count: 'exact', head: true }).eq('sync_status', 'pending_sync'),
            supabase.from('sales_quotes').select('id', { count: 'exact', head: true }).eq('sync_status', 'pending_sync'),
        ]);

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
            },
            documents: {
                orders_pending_sync: ordersPending.count || 0,
                invoices_pending_sync: invoicesPending.count || 0,
                quotes_pending_sync: quotesPending.count || 0,
            },
            stuck_jobs: stuck,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        return jsonNoStore({ error: error?.message || 'Error interno' }, 500);
    }
}

