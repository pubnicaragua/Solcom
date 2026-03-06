import { createClient } from '@supabase/supabase-js';
import { createZohoBooksClient } from '@/lib/zoho/books-client';

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

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const cronSecret = searchParams.get('cron_secret');
    const expectedSecret = process.env.CRON_SECRET || 'solcom-cron-key-123';
    if (cronSecret !== expectedSecret) {
        return jsonResponse({ error: 'Unauthorized cron request' }, 401);
    }

    const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 50)));
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const zohoClient = createZohoBooksClient();
    if (!zohoClient) {
        return jsonResponse({ error: 'ZOHO_BOOKS_* incompleto.' }, 500);
    }

    try {
        const invoiceRes = await supabase
            .from('sales_invoices')
            .select('id, invoice_number, total, zoho_invoice_id, sync_status, updated_at')
            .eq('sync_status', 'synced')
            .not('zoho_invoice_id', 'is', null)
            .order('updated_at', { ascending: false })
            .limit(limit);

        if (invoiceRes.error) {
            return jsonResponse({ error: invoiceRes.error.message }, 500);
        }

        const rows = Array.isArray(invoiceRes.data) ? invoiceRes.data : [];
        const diffs: Array<{
            document_type: 'sales_invoice';
            document_id: string;
            document_number: string;
            local_total: number;
            zoho_total: number;
            diff: number;
        }> = [];

        for (const row of rows) {
            const zohoInvoiceId = String(row.zoho_invoice_id || '').trim();
            if (!zohoInvoiceId) continue;
            try {
                const result = await zohoClient.request('GET', `/books/v3/invoices/${zohoInvoiceId}`);
                const zohoTotal = round2(normalizeNumber(result?.invoice?.total, Number.NaN));
                const localTotal = round2(normalizeNumber(row.total, 0));
                if (!Number.isFinite(zohoTotal)) continue;
                const diff = round2(zohoTotal - localTotal);
                if (Math.abs(diff) >= 0.01) {
                    diffs.push({
                        document_type: 'sales_invoice',
                        document_id: row.id,
                        document_number: String(row.invoice_number || ''),
                        local_total: localTotal,
                        zoho_total: zohoTotal,
                        diff,
                    });
                }
            } catch {
                // Skip records that Zoho cannot read in this pass.
            }
        }

        return jsonResponse({
            ok: true,
            checked: rows.length,
            diffs_found: diffs.length,
            diffs,
        });
    } catch (error: any) {
        return jsonResponse({ error: error?.message || 'Error interno en reconciliación' }, 500);
    }
}

