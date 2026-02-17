import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

async function getZohoToken() {
  const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
  const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
  const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) return null;

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
        }),
        cache: 'no-store', // Prevent caching of token response
      });

      if (!res.ok) {
        console.error(`[KPIs] Token fetch failed (Attempt ${attempts + 1}/${maxAttempts}):`, res.status, await res.text());
        attempts++;
        if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 1000 * attempts)); // Backoff
        continue;
      }

      const data = await res.json();
      if (data.error) {
        console.error('[KPIs] Token error:', data.error);
        return null; // Don't retry logic errors
      }
      return data;
    } catch (e: any) {
      console.error(`[KPIs] Token exception (Attempt ${attempts + 1}/${maxAttempts}):`, e.message);
      attempts++;
      if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 1000 * attempts));
    }
  }
  return null;
}

// In-memory cache: avoid calling Zoho on every page load
let kpiCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  // Return cached data if fresh
  if (kpiCache && Date.now() - kpiCache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(kpiCache.data, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' },
    });
  }

  try {
    const supabase = createServerClient();

    const [warehousesResult, snapshotsResult] = await Promise.all([
      supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('stock_snapshots').select('synced_at').order('synced_at', { ascending: false }).limit(1),
    ]);

    const tokenData = await getZohoToken();
    if (!tokenData) {
      // Fallback to local DB if Zoho token fails, but preserving the structure
      return NextResponse.json(
        { error: 'No se pudo conectar con Zoho Books' },
        { status: 503 }
      );
    }

    const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

    // Fetch from Zoho API - Inventory Valuation Report
    // This provides 'asset_value' matching ERP
    let page = 1;
    let hasMore = true;
    let totalStock = 0;
    let totalValue = 0;
    let totalProducts = 0;
    let sampleItem: any = null;

    // Safety limit
    const MAX_PAGES = 100; // Increased limit as we need to paginate through report

    while (hasMore && page <= MAX_PAGES) {
      const url = `https://www.zohoapis.com/books/v3/reports/inventoryvaluation?organization_id=${organizationId}&page=${page}&per_page=200&status=active`;

      const res = await fetch(url, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${tokenData.access_token}`,
        },
        cache: 'no-store'
      });

      if (res.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      if (!res.ok) {
        console.error(`Zoho Report API Error on page ${page}:`, res.status);
        break;
      }

      const data = await res.json();

      if (data.code === 0 && data.inventory_valuation) {
        // The report returns groups (default is one group if no grouping)
        // Structure: inventory_valuation: [ { item_details: [ ... ] } ]

        const groups = data.inventory_valuation;
        for (const group of groups) {
          if (group.item_details) {
            for (const item of group.item_details) {
              totalProducts++;
              // Report fields: quantity_available, asset_value
              const stock = parseFloat(item.quantity_available || 0);
              const value = parseFloat(item.asset_value || 0);

              totalStock += stock;
              totalValue += value;

              if (!sampleItem && stock > 0) {
                sampleItem = item;
              }
            }
          }
        }
      }

      hasMore = data.page_context?.has_more_page || false;
      page++;

      // Small delay to be nice to API
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const lastSync = (snapshotsResult.data as any)?.[0]?.synced_at
      ? format(new Date((snapshotsResult.data as any)[0].synced_at), "dd MMM yyyy, HH:mm", { locale: es })
      : 'Nunca';

    const responseData = {
      totalSKUs: totalProducts,
      totalProducts,
      totalStock,
      totalValue, // Now accurate from Asset Value
      activeWarehouses: warehousesResult.count || 0,
      lastSync,
      source: 'zoho',
      debug: {
        tokenOk: true,
        orgIdOk: !!organizationId,
        itemsProcessed: totalProducts,
        pagesFetched: page - 1,
        sampleItem: sampleItem,
        mode: 'report_valuation'
      }
    };

    // Save to cache
    kpiCache = { data: responseData, timestamp: Date.now() };

    return NextResponse.json(
      responseData,
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('[KPIs] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener KPIs desde Zoho' },
      { status: 500 }
    );
  }
}
