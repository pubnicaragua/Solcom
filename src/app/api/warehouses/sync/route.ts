import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

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
    const allZohoWarehouses: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${apiDomain}/inventory/v1/warehouses?organization_id=${organizationId}&page=${page}&per_page=200`;
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
      const pageWarehouses = result.warehouses || [];
      allZohoWarehouses.push(...pageWarehouses);

      hasMore = result.page_context?.has_more_page || false;
      page++;
    }

    if (allZohoWarehouses.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        updated: 0,
        message: 'No se encontraron bodegas en Zoho Inventory',
      });
    }

    console.log(`[WAREHOUSE SYNC] Fetched ${allZohoWarehouses.length} warehouses from Zoho.`);

    const supabase = createServerClient();
    let inserted = 0;
    let updated = 0;

    for (const w of allZohoWarehouses) {
      const payload = {
        code: w.warehouse_name, // Usamos el nombre como código para que sea legible
        name: w.warehouse_name,
        zoho_warehouse_id: w.warehouse_id,
        active: w.status === 'active',
      };

      // Intentar actualizar por zoho_warehouse_id
      const { data: updatedRows, error: updateError } = await supabase
        .from('warehouses')
        .upsert(payload, { onConflict: 'zoho_warehouse_id' })
        .select('id');

      if (updateError) {
        // Si falla el upsert (ej. por conflicto de 'code' único), intentamos buscar y parchar
        console.warn(`[WAREHOUSE SYNC] Conflict for ${w.warehouse_name}, trying manual update...`);
        const { error: patchError } = await supabase
          .from('warehouses')
          .update(payload)
          .eq('zoho_warehouse_id', w.warehouse_id);

        if (patchError) {
          console.error(`[WAREHOUSE SYNC] Failed to sync ${w.warehouse_name}:`, patchError);
          continue;
        }
        updated++;
      } else if (updatedRows && updatedRows.length > 0) {
        updated++;
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
