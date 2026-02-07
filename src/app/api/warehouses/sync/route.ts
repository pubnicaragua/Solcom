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
    const url = `${apiDomain}/inventory/v1/warehouses?organization_id=${organizationId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Zoho Inventory error: ${response.status} - ${errorText}` },
        { status: 500 }
      );
    }

    const result = await response.json();
    const zohoWarehouses = result.warehouses || [];

    if (zohoWarehouses.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        updated: 0,
        message: 'No se encontraron bodegas en Zoho Inventory',
      });
    }

    const supabase = createServerClient();
    let inserted = 0;
    let updated = 0;

    for (const w of zohoWarehouses) {
      const normalizedCode = (w.warehouse_name || '').trim() || w.warehouse_id;
      const payload = {
        code: normalizedCode,
        name: w.warehouse_name,
        zoho_warehouse_id: w.warehouse_id,
        active: w.status === 'active',
      };

      // 1) Try update by zoho_warehouse_id
      const { data: updatedByZoho, error: updateZohoError } = await supabase
        .from('warehouses')
        .update(payload)
        .eq('zoho_warehouse_id', w.warehouse_id)
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

      // 2) Try update by code (warehouse_name) and attach zoho_warehouse_id
      const { data: updatedByCode, error: updateCodeError } = await supabase
        .from('warehouses')
        .update(payload)
        .eq('code', normalizedCode)
        .select('id');

      if (updateCodeError) {
        return NextResponse.json(
          { error: updateCodeError.message },
          { status: 500 }
        );
      }

      if (updatedByCode && updatedByCode.length > 0) {
        updated += updatedByCode.length;
        continue;
      }

      // 3) Safety: check if code already exists (case/space mismatch)
      const { data: existingByCode, error: existingByCodeError } = await supabase
        .from('warehouses')
        .select('id')
        .eq('code', normalizedCode)
        .limit(1);

      if (existingByCodeError) {
        return NextResponse.json(
          { error: existingByCodeError.message },
          { status: 500 }
        );
      }

      if (existingByCode && existingByCode.length > 0) {
        updated += existingByCode.length;
        continue;
      }

      // 4) Insert new warehouse (fallback to unique code if needed)
      const { data: insertedRow, error: insertError } = await supabase
        .from('warehouses')
        .insert(payload)
        .select('id');

      if (insertError) {
        const fallbackCode = `${normalizedCode} (${w.warehouse_id})`;
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
      message: `Bodegas sincronizadas: ${inserted + updated}`,
    });
  } catch (error) {
    console.error('Warehouses sync error:', error);
    return NextResponse.json(
      { error: 'Error sincronizando bodegas', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
