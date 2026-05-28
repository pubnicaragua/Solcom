import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { syncZohoInvoiceSales } from '@/lib/compras/zoho-sales-sync';

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

function isMissingZohoSnapshot(error: any): boolean {
  const text = String(error?.message || error || '').toLowerCase();
  return (
    text.includes('get_restock_analytics_zoho') ||
    text.includes('zoho_invoice_sales') ||
    text.includes('could not find the function') ||
    text.includes('pgrst202')
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weeks = clampInteger(searchParams.get('weeks'), 4, 1, 52);
    const days = clampInteger(searchParams.get('days'), 30, 1, 365);
    const dateEnd = searchParams.get('date_end') || formatYmdInManagua(new Date());
    const dateStart = searchParams.get('date_start') || addDaysYmd(dateEnd, -days);
    const shouldSync = searchParams.get('sync') !== '0';
    const maxDetails = clampInteger(searchParams.get('max_details'), 60, 1, 1000);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let syncResult = null;
    let syncWarning: string | null = null;

    if (shouldSync) {
      const zohoClient = createZohoBooksClient();
      if (zohoClient) {
        try {
          syncResult = await syncZohoInvoiceSales({
            supabase,
            zohoClient,
            dateStart,
            dateEnd,
            maxDetails,
            maxPages: 3,
            perPage: 200,
            force: searchParams.get('force_sync') === '1',
          });
        } catch (syncError: any) {
          syncWarning = syncError?.message || 'No se pudo refrescar ventas desde Zoho';
          console.warn('[API Restock] Zoho sync warning:', syncWarning);
        }
      } else {
        syncWarning = 'ZOHO_BOOKS_* incompleto; usando ultimo snapshot disponible.';
      }
    }

    const { data: analyticsRow, error } = await supabase
      .rpc('get_restock_analytics_zoho', {
        p_weeks: weeks,
        p_days: days,
        p_date_to: dateEnd,
      });

    if (error) {
      if (isMissingZohoSnapshot(error)) {
        const fallback = await supabase.rpc('get_restock_analytics', { p_weeks: weeks });
        if (fallback.error) {
          console.error('[API Restock] Error fetching fallback analytics:', fallback.error);
          return NextResponse.json({ error: fallback.error.message }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          source: 'inventory_events_fallback',
          warning: 'Falta aplicar la migracion de ventas Zoho; se uso el calculo anterior.',
          sync_warning: syncWarning,
          count: fallback.data?.length || 0,
          data: fallback.data || [],
        });
      }

      console.error('[API Restock] Error fetching analytics:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      source: 'zoho_invoice_sales_snapshot',
      period: { date_start: dateStart, date_end: dateEnd, days, weeks },
      sync: syncResult,
      sync_warning: syncWarning,
      count: analyticsRow?.length || 0,
      data: analyticsRow || [] 
    });

  } catch (error) {
    console.error('[API Restock] Fatal:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
