import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { syncRequestSchema } from '@/lib/validators/inventory';

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

    const rawText = await response.text();
    if (!rawText) {
      throw new Error(`Zoho Inventory error: empty response (status ${response.status})`);
    }

    let result: any;
    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error(`Zoho Inventory error: invalid JSON response: ${rawText.substring(0, 200)}`);
    }
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

async function fetchItemWarehouses(
  accessToken: string,
  apiDomain: string,
  organizationId: string,
  itemId: string
) {
  const url = `${apiDomain}/inventory/v1/items/${itemId}?organization_id=${organizationId}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoho Inventory item error: ${response.status} - ${errorText}`);
  }

  const rawText = await response.text();
  if (!rawText) {
    return [];
  }

  let result: any;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`Zoho Inventory item error: invalid JSON response: ${rawText.substring(0, 200)}`);
  }

  return result.item?.warehouses || [];
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const body = rawBody ? JSON.parse(rawBody) : {};
    const validation = syncRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      );
    }

    const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    if (!organizationId) {
      return NextResponse.json(
        { error: 'ZOHO_BOOKS_ORGANIZATION_ID no configurado' },
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
    const { data: warehouses } = await supabase
      .from('warehouses')
      .select('id, code, zoho_warehouse_id')
      .not('zoho_warehouse_id', 'is', null);

    const { data: items } = await supabase
      .from('items')
      .select('id, zoho_item_id')
      .not('zoho_item_id', 'is', null);

    const warehouseMap = new Map(
      (warehouses || []).map((w: any) => [w.zoho_warehouse_id, w.id])
    );
    const preferredWarehouse = (warehouses || []).find((w: any) => w.code === 'X1');
    const defaultWarehouseId =
      preferredWarehouse?.id || (warehouses && warehouses.length > 0 ? warehouses[0].id : null);
    const itemMap = new Map(
      (items || []).map((i: any) => [i.zoho_item_id, i.id])
    );

    let snapshotsCreated = 0;
    let itemsSkipped = 0;
    let itemsWithWarehouses = 0;
    let itemsWithoutWarehouses = 0;
    let missingWarehouseMappings = 0;
    const sampleZohoWarehouseIds = new Set<string>();

    const snapshots: any[] = [];
    const perWarehouseItemIds = new Map<string, Set<string>>();

    for (const zohoItem of zohoItems) {
      const itemId = itemMap.get(zohoItem.item_id);
      if (!itemId) {
        itemsSkipped += 1;
        continue;
      }

      let warehousesList = zohoItem.warehouses || [];
      if (!Array.isArray(warehousesList) || warehousesList.length === 0) {
        try {
          warehousesList = await fetchItemWarehouses(
            accessToken,
            apiDomain,
            organizationId,
            zohoItem.item_id
          );
        } catch (error) {
          console.error('Error fetching item warehouses:', zohoItem.item_id, error);
        }
      }

      if (!Array.isArray(warehousesList) || warehousesList.length === 0) {
        itemsWithoutWarehouses += 1;

        if (defaultWarehouseId) {
          const qty = zohoItem.stock_on_hand ?? 0;
          snapshots.push({
            warehouse_id: defaultWarehouseId,
            item_id: itemId,
            qty,
            source_ts: new Date().toISOString(),
            synced_at: new Date().toISOString(),
          });
          if (!perWarehouseItemIds.has(defaultWarehouseId)) {
            perWarehouseItemIds.set(defaultWarehouseId, new Set());
          }
          perWarehouseItemIds.get(defaultWarehouseId)!.add(itemId);
        }
        continue;
      }

      itemsWithWarehouses += 1;

      for (const wh of warehousesList) {
        if (wh?.warehouse_id) {
          sampleZohoWarehouseIds.add(wh.warehouse_id);
        }
        const localWarehouseId = warehouseMap.get(wh.warehouse_id);
        if (!localWarehouseId) {
          missingWarehouseMappings += 1;
          continue;
        }

        const qty =
          wh.warehouse_stock_on_hand ??
          wh.stock_on_hand ??
          wh.quantity_available ??
          0;

        snapshots.push({
          warehouse_id: localWarehouseId,
          item_id: itemId,
          qty,
          source_ts: new Date().toISOString(),
          synced_at: new Date().toISOString(),
        });

        if (!perWarehouseItemIds.has(localWarehouseId)) {
          perWarehouseItemIds.set(localWarehouseId, new Set());
        }
        perWarehouseItemIds.get(localWarehouseId)!.add(itemId);
      }
    }

    for (const [warehouseId, itemIdsSet] of perWarehouseItemIds.entries()) {
      const itemIds = Array.from(itemIdsSet);
      await supabase
        .from('stock_snapshots')
        .delete()
        .eq('warehouse_id', warehouseId)
        .in('item_id', itemIds);
    }

    if (snapshots.length > 0) {
      const { error: snapError } = await supabase
        .from('stock_snapshots')
        .insert(snapshots);

      if (snapError) {
        throw snapError;
      }
      snapshotsCreated = snapshots.length;
    }

    return NextResponse.json({
      success: true,
      snapshotsCreated,
      itemsSkipped,
      itemsWithWarehouses,
      itemsWithoutWarehouses,
      missingWarehouseMappings,
      zohoItemsTotal: zohoItems.length,
      warehousesMapped: warehouseMap.size,
      itemsMapped: itemMap.size,
      sampleZohoWarehouseIds: Array.from(sampleZohoWarehouseIds).slice(0, 10),
      message: `Sincronización de inventario completada: ${snapshotsCreated} snapshots`,
    });
  } catch (error) {
    console.error('Zoho Books sync error:', error);
    return NextResponse.json(
      { error: 'Error en sincronización de Zoho Books', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}