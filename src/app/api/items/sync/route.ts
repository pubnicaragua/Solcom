import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function getZohoAccessToken() {
  const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
  const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return { error: 'Configuración de Zoho Books incompleta' };
  }

  const authDomain = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';
  const response = await fetch(`${authDomain}/oauth/v2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { error: `Zoho auth failed: ${response.status} - ${errorText}` };
  }

  const data = await response.json();
  return {
    accessToken: data.access_token as string,
    apiDomain: (data.api_domain as string) || 'https://www.zohoapis.com',
  };
}

async function fetchZohoItems(accessToken: string, apiDomain: string, organizationId: string) {
  const items: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${apiDomain}/inventory/v1/items?organization_id=${organizationId}&page=${page}&per_page=200`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zoho Inventory error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const pageItems = result.items || [];
    items.push(...pageItems);

    if (result.page_context?.has_more_page) {
      page += 1;
    } else {
      hasMore = false;
    }
  }

  return items;
}

export async function POST() {
  try {
    const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    if (!organizationId) {
      return NextResponse.json(
        { error: 'Falta ZOHO_BOOKS_ORGANIZATION_ID' },
        { status: 500 }
      );
    }

    const auth = await getZohoAccessToken();
    if ('error' in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: 500 }
      );
    }

    const { accessToken, apiDomain } = auth;
    const zohoItems = await fetchZohoItems(accessToken, apiDomain, organizationId);

    const supabase = createServerClient();
    let inserted = 0;
    let updated = 0;

    const seenSku = new Set<string>();

    for (const zItem of zohoItems) {
      let sku = (zItem.sku || `NO-SKU-${zItem.item_id}`).trim();
      if (!sku) {
        sku = `NO-SKU-${zItem.item_id}`;
      }

      // Ensure unique SKU within the same sync batch
      if (seenSku.has(sku)) {
        sku = `${sku}-${zItem.item_id}`;
      }
      seenSku.add(sku);
      const payload = {
        sku,
        name: zItem.name,
        category: zItem.category_name || null,
        color: zItem.cf_color || null,
        state: zItem.cf_estado || null,
        zoho_item_id: zItem.item_id,
        stock_total: zItem.stock_on_hand ?? 0,
        price: zItem.purchase_rate ?? null,
      };

      const { data: updatedByZoho, error: updateZohoError } = await supabase
        .from('items')
        .update(payload)
        .eq('zoho_item_id', zItem.item_id)
        .select('id');

      if (updateZohoError) {
        return NextResponse.json(
          { error: updateZohoError.message },
          { status: 500 }
        );
      }

      if (updatedByZoho && updatedByZoho.length > 0) {
        updated += updatedByZoho.length;
        continue;
      }

      const { data: updatedBySku, error: updateSkuError } = await supabase
        .from('items')
        .update(payload)
        .eq('sku', sku)
        .select('id');

      if (updateSkuError) {
        return NextResponse.json(
          { error: updateSkuError.message },
          { status: 500 }
        );
      }

      if (updatedBySku && updatedBySku.length > 0) {
        updated += updatedBySku.length;
        continue;
      }

      const { data: insertedRow, error: insertError } = await supabase
        .from('items')
        .insert(payload)
        .select('id');

      if (insertError) {
        const fallbackSku = `${sku}-${zItem.item_id}`;
        const { data: fallbackRow, error: fallbackError } = await supabase
          .from('items')
          .insert({ ...payload, sku: fallbackSku })
          .select('id');

        if (fallbackError) {
          return NextResponse.json(
            { error: fallbackError.message },
            { status: 500 }
          );
        }

        if (fallbackRow && fallbackRow.length > 0) {
          inserted += fallbackRow.length;
        }
      } else if (insertedRow && insertedRow.length > 0) {
        inserted += insertedRow.length;
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      message: `Items sincronizados: ${inserted + updated}`,
    });
  } catch (error) {
    console.error('Items sync error:', error);
    return NextResponse.json(
      { error: 'Error sincronizando items', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
