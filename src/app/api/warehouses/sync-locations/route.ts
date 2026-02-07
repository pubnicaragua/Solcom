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

/**
 * Sincroniza ubicaciones (location_id + location_name) desde Zoho Inventory
 * locationdetails y las guarda en warehouses con zoho_warehouse_id = location_id.
 * Así el sync de inventario puede mapear cada producto a su bodega real.
 */
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

    const supabase = createServerClient();

    // Obtener un item_id de nuestra base para llamar locationdetails
    const { data: oneItem } = await supabase
      .from('items')
      .select('zoho_item_id')
      .not('zoho_item_id', 'is', null)
      .limit(1)
      .single();

    const itemId = oneItem?.zoho_item_id;
    if (!itemId) {
      return NextResponse.json(
        { error: 'No hay items con zoho_item_id. Ejecuta antes /api/items/sync' },
        { status: 400 }
      );
    }

    const { accessToken, apiDomain } = auth;
    const url = `${apiDomain}/inventory/v1/items/${itemId}/locationdetails?organization_id=${organizationId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Zoho locationdetails error: ${response.status} - ${errorText}` },
        { status: 500 }
      );
    }

    const result = await response.json();
    const locations: Array<{ location_id: string; location_name: string; status?: string }> =
      result.item_location_details?.locations || [];

    if (locations.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        updated: 0,
        message: 'No se encontraron ubicaciones en locationdetails',
      });
    }

    let inserted = 0;
    let updated = 0;

    for (const loc of locations) {
      const locationId = loc.location_id;
      const name = (loc.location_name || '').trim() || locationId;
      const code = name;

      const payload = {
        code,
        name,
        zoho_warehouse_id: locationId,
        active: loc.status === 'active',
      };

      const { data: updatedByZoho, error: updateZohoError } = await supabase
        .from('warehouses')
        .update(payload)
        .eq('zoho_warehouse_id', locationId)
        .select('id');

      if (updateZohoError) {
        return NextResponse.json(
          { error: updateZohoError.message },
          { status: 500 }
        );
      }

      if (updatedByZoho && updatedByZoho.length > 0) {
        updated += 1;
        continue;
      }

      const { data: updatedByCode } = await supabase
        .from('warehouses')
        .update(payload)
        .eq('code', code)
        .select('id');

      if (updatedByCode && updatedByCode.length > 0) {
        updated += 1;
        continue;
      }

      const { data: insertedRow, error: insertError } = await supabase
        .from('warehouses')
        .insert(payload)
        .select('id');

      if (insertError) {
        const fallbackCode = `${code} (${locationId})`;
        const { data: fallbackRow, error: fallbackError } = await supabase
          .from('warehouses')
          .insert({ ...payload, code: fallbackCode })
          .select('id');

        if (fallbackError) {
          return NextResponse.json(
            { error: fallbackError.message },
            { status: 500 }
          );
        }
        if (fallbackRow?.length) inserted += 1;
      } else if (insertedRow?.length) {
        inserted += 1;
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      total: locations.length,
      message: `Ubicaciones sincronizadas: ${inserted} nuevas, ${updated} actualizadas`,
    });
  } catch (error) {
    console.error('Sync locations error:', error);
    return NextResponse.json(
      {
        error: 'Error sincronizando ubicaciones',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
