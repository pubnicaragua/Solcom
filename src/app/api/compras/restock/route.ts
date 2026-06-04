import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { fetchSalesByItemRestock } from '@/lib/compras/zoho-salesbyitem-report';

// Usar el Service Key para sobrepasar RLS si estamos en una ruta Server-Side
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weeks = clampInteger(searchParams.get('weeks'), 4, 1, 52);
    const days = clampInteger(searchParams.get('days'), 30, 1, 365);
    const dateEnd = searchParams.get('date_end') || formatYmdInManagua(new Date());
    const dateStart = searchParams.get('date_start') || addDaysYmd(dateEnd, -days);
    const maxPages = clampInteger(searchParams.get('max_pages'), 10, 1, 50);
    const perPage = clampInteger(searchParams.get('per_page'), 200, 1, 200);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const zohoClient = createZohoBooksClient();

    if (!zohoClient) {
      return NextResponse.json({ error: 'ZOHO_BOOKS_* incompleto.' }, { status: 500 });
    }

    const report = await fetchSalesByItemRestock({
      supabase,
      zohoClient,
      dateStart,
      dateEnd,
      weeks,
      maxPages,
      perPage,
    });

    return NextResponse.json({ 
      success: true, 
      source: 'zoho_salesbyitem_report',
      period: { date_start: dateStart, date_end: dateEnd, days, weeks },
      report: {
        listed_rows: report.listed_rows,
        pages_read: report.pages_read,
        has_more_page: report.has_more_page,
      },
      count: report.rows.length,
      data: report.rows,
    });

  } catch (error) {
    console.error('[API Restock] Fatal:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
