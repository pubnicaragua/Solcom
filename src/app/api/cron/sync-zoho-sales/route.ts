import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { syncZohoInvoiceSales } from '@/lib/compras/zoho-sales-sync';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 180;

function clampInteger(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function formatYmdInManagua(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Managua',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return `${year}-${month}-${day}`;
}

function addDaysYmd(ymd: string, days: number): string {
    const [year, month, day] = ymd.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function jsonResponse(data: any, status = 200) {
    return NextResponse.json(
        { ...data, timestamp: new Date().toISOString() },
        {
            status,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'CDN-Cache-Control': 'no-store',
                'Vercel-CDN-Cache-Control': 'no-store',
            },
        }
    );
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const cronSecret = searchParams.get('cron_secret');
    const expectedSecret = process.env.CRON_SECRET || 'solcom-cron-key-123';

    if (cronSecret !== expectedSecret) {
        return jsonResponse({ error: 'Unauthorized cron request' }, 401);
    }

    const dateEnd = searchParams.get('date_end') || formatYmdInManagua(new Date());
    const days = clampInteger(searchParams.get('days'), 30, 1, 120);
    const dateStart = searchParams.get('date_start') || addDaysYmd(dateEnd, -days);
    const maxPages = clampInteger(searchParams.get('max_pages'), 3, 1, 20);
    const perPage = clampInteger(searchParams.get('per_page'), 200, 1, 200);
    const maxDetails = clampInteger(searchParams.get('max_details'), 80, 1, 1000);
    const force = searchParams.get('force') === '1' || searchParams.get('force') === 'true';

    const zohoClient = createZohoBooksClient();
    if (!zohoClient) {
        return jsonResponse({ error: 'ZOHO_BOOKS_* incompleto.' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const result = await syncZohoInvoiceSales({
            supabase,
            zohoClient,
            dateStart,
            dateEnd,
            maxPages,
            perPage,
            maxDetails,
            force,
        });

        return jsonResponse({ ok: true, result });
    } catch (error: any) {
        return jsonResponse({
            ok: false,
            error: error?.message || 'Error sincronizando ventas desde Zoho',
            migration: 'Ejecuta src/lib/supabase/restock-rpc.sql si faltan tablas zoho_invoice_sales_*.',
        }, 500);
    }
}

