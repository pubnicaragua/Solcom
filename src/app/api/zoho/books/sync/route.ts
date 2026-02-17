import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { syncRequestSchema } from '@/lib/validators/inventory';
import { getZohoAccessToken, fetchItemLocations, AuthExpiredError } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

function isMissingRelationError(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('does not exist');
}

function normalizeSku(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function buildFallbackSku(zohoItemId: string): string {
  const normalized = String(zohoItemId || '').trim();
  return `NO-SKU-${normalized || Date.now()}`;
}

function toNullableText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function toNullableNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeItemState(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();

  if (upper === 'ACTIVE' || upper === 'INACTIVE') return null;
  if (upper === 'NEW' || upper === 'NUEVO') return 'NUEVO';
  if (upper === 'USED' || upper === 'USADO' || upper === 'SEMINUEVO') return 'USADO';

  return null;
}

function buildItemPayloadFromZoho(zohoItem: any) {
  const zohoItemId = String(zohoItem?.item_id ?? '').trim();
  const customFields = zohoItem?.custom_field_hash || {};
  const sku = String(zohoItem?.sku ?? '').trim() || buildFallbackSku(zohoItemId);
  const name = String(zohoItem?.name ?? '').trim() || sku;

  return {
    sku,
    name,
    zoho_item_id: zohoItemId || null,
    color: toNullableText(customFields.cf_color ?? zohoItem?.color),
    state: normalizeItemState(customFields.cf_estado ?? customFields.cf_state ?? zohoItem?.status),
    marca: toNullableText(customFields.cf_marca ?? customFields.cf_brand ?? zohoItem?.brand),
    category: toNullableText(customFields.cf_categoria ?? zohoItem?.category_name),
    stock_total: 0,
    price: toNullableNumber(zohoItem?.rate),
    updated_at: new Date().toISOString(),
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
    const onlyNew = validation.data.onlyNew === true;

    const auth = await getZohoAccessToken();
    if ('error' in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: 500 }
      );
    }


    let { accessToken, apiDomain } = auth;
    const zohoItems = await fetchZohoItems(accessToken, apiDomain, organizationId);

    const supabase = createServerClient();
    const { data: allWarehouses } = await supabase
      .from('warehouses')
      .select('id, code, zoho_warehouse_id');

    const { data: items } = await supabase
      .from('items')
      .select('id, sku, zoho_item_id');

    const warehousesWithMapping = (allWarehouses || []).filter((w: any) => !!w.zoho_warehouse_id);
    // Claves en string para que el lookup coincida con location_id (Zoho puede devolver number o string)
    const warehouseMap = new Map(
      warehousesWithMapping.map((w: any) => [String(w.zoho_warehouse_id ?? ''), w.id])
    );
    const itemsData = items || [];
    const itemMapByZoho = new Map<string, string>();
    const itemMapBySku = new Map<string, string>();
    const duplicateSkus = new Set<string>();

    for (const item of itemsData) {
      const zohoId = String(item?.zoho_item_id ?? '').trim();
      if (zohoId) {
        itemMapByZoho.set(zohoId, item.id);
      }

      const skuKey = normalizeSku(item?.sku);
      if (!skuKey) continue;
      const existingId = itemMapBySku.get(skuKey);
      if (!existingId) {
        itemMapBySku.set(skuKey, item.id);
      } else if (existingId !== item.id) {
        duplicateSkus.add(skuKey);
      }
    }

    const toQty = (value: unknown): number => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    const addSnapshot = (
      snapshots: any[],
      indexByItemWarehouse: Map<string, number>,
      warehouseId: string,
      itemId: string,
      qty: number
    ) => {
      const key = `${itemId}::${warehouseId}`;
      const existingIndex = indexByItemWarehouse.get(key);
      if (existingIndex !== undefined) {
        snapshots[existingIndex].qty += qty;
        snapshots[existingIndex].synced_at = new Date().toISOString();
        snapshots[existingIndex].source_ts = new Date().toISOString();
        return;
      }

      snapshots.push({
        warehouse_id: warehouseId,
        item_id: itemId,
        qty,
        source_ts: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      });
      indexByItemWarehouse.set(key, snapshots.length - 1);
    };

    let snapshotsCreated = 0;
    let inventoryBalanceRows = 0;
    let inventoryBalanceSynced = false;
    let itemsSkipped = 0;
    let existingItemsSkipped = 0;
    let itemsCreated = 0;
    let itemsMatchedBySku = 0;
    let itemsRelinkedBySku = 0;
    let itemsWithWarehouses = 0;
    let itemsWithoutWarehouses = 0;
    let missingWarehouseMappings = 0;
    let itemsWithUnmappedLocations = 0;
    let preservedWithoutLocations = 0;
    let preservedWithUnmappedLocations = 0;
    const sampleZohoWarehouseIds = new Set<string>();

    const snapshots: any[] = [];
    const snapshotIndexByItemWarehouse = new Map<string, number>();
    const itemIdsToReplace = new Set<string>();

    for (const zohoItem of zohoItems) {
      const zohoItemId = String(zohoItem.item_id ?? '').trim();
      if (!zohoItemId) {
        itemsSkipped += 1;
        continue;
      }
      const skuKey = normalizeSku(zohoItem.sku);
      let itemId = itemMapByZoho.get(zohoItemId);
      const existingBySku = skuKey && !duplicateSkus.has(skuKey) ? itemMapBySku.get(skuKey) : undefined;

      // Incremental mode: only process genuinely new products.
      if (onlyNew && (itemId || existingBySku)) {
        existingItemsSkipped += 1;
        continue;
      }

      if (!itemId && skuKey && !duplicateSkus.has(skuKey)) {
        itemId = itemMapBySku.get(skuKey);
        if (itemId) {
          itemsMatchedBySku += 1;
          const { error: relinkError } = await supabase
            .from('items')
            .update({ zoho_item_id: zohoItemId })
            .eq('id', itemId);

          if (!relinkError) {
            itemsRelinkedBySku += 1;
            itemMapByZoho.set(zohoItemId, itemId);
          } else {
            console.error(`[SYNC WARN] Could not relink SKU ${zohoItem.sku} to Zoho item ${zohoItemId}:`, relinkError.message);
          }
        }
      }

      if (!itemId) {
        const itemPayload = buildItemPayloadFromZoho(zohoItem);
        let insertPayload = itemPayload;

        // Avoid SKU unique conflicts when Zoho SKU already exists locally under a different item.
        const payloadSkuKey = normalizeSku(insertPayload.sku);
        if (payloadSkuKey && itemMapBySku.has(payloadSkuKey)) {
          insertPayload = {
            ...insertPayload,
            sku: buildFallbackSku(zohoItemId),
          };
        }

        const { data: insertedItem, error: insertError } = await supabase
          .from('items')
          .insert(insertPayload)
          .select('id, sku')
          .single();

        if (insertError) {
          // Defensive fallback: if another process inserted it already, recover by zoho_item_id.
          const { data: existingItem } = await supabase
            .from('items')
            .select('id, sku')
            .eq('zoho_item_id', zohoItemId)
            .limit(1);

          const recovered = existingItem?.[0];
          if (!recovered) {
            console.error(`[SYNC WARN] Could not create local item for Zoho item ${zohoItemId}: ${insertError.message}`);
            itemsSkipped += 1;
            continue;
          }

          itemId = recovered.id;
          itemMapByZoho.set(zohoItemId, itemId);
          const recoveredSkuKey = normalizeSku(recovered.sku);
          if (recoveredSkuKey && !duplicateSkus.has(recoveredSkuKey)) {
            itemMapBySku.set(recoveredSkuKey, itemId);
          }
        } else {
          itemId = insertedItem.id;
          itemsCreated += 1;
          itemMapByZoho.set(zohoItemId, itemId);
          const insertedSkuKey = normalizeSku(insertedItem.sku);
          if (insertedSkuKey && !duplicateSkus.has(insertedSkuKey)) {
            itemMapBySku.set(insertedSkuKey, itemId);
          }
        }
      }

      let locationsList: any[] = [];
      try {
        locationsList = await fetchItemLocations(
          accessToken,
          apiDomain,
          organizationId,
          zohoItem.item_id
        );
      } catch (error) {
        // Token expired — refresh and retry once
        if (error instanceof AuthExpiredError) {
          console.log('[SYNC] Token expired, refreshing...');
          const newAuth = await getZohoAccessToken();
          if (!('error' in newAuth)) {
            accessToken = newAuth.accessToken;
            apiDomain = newAuth.apiDomain;
            try {
              locationsList = await fetchItemLocations(
                accessToken,
                apiDomain,
                organizationId,
                zohoItem.item_id
              );
            } catch (retryError) {
              console.error('Error fetching item locations after token refresh:', zohoItem.item_id, retryError);
            }
          }
        } else {
          console.error('Error fetching item locations:', zohoItem.item_id, error);
        }
      }

      if (!Array.isArray(locationsList) || locationsList.length === 0) {
        itemsWithoutWarehouses += 1;
        // Strict mapping mode:
        // do not force stock_on_hand into a default warehouse, keep current snapshots untouched.
        preservedWithoutLocations += 1;
        continue;
      }

      itemsWithWarehouses += 1;
      let missingMappingsForItem = 0;
      const itemSnapshots: { warehouseId: string; qty: number }[] = [];

      for (const loc of locationsList) {
        const locId = loc?.location_id != null ? String(loc.location_id) : '';
        if (locId) sampleZohoWarehouseIds.add(locId);

        const localWarehouseId = warehouseMap.get(locId);
        if (!localWarehouseId) {
          console.log(`[SYNC DEBUG] Warehouse mapping FAILED for location: ${loc.location_name} (ID: ${locId})`);
          missingWarehouseMappings += 1;
          missingMappingsForItem += 1;
          continue;
        }

        const qty = toQty(
          loc.location_stock_on_hand ??
          loc.location_available_stock
        );

        console.log(`[SYNC DEBUG] Adding snapshot for ${zohoItem.name} in ${loc.location_name}: ${qty}`);
        itemSnapshots.push({ warehouseId: localWarehouseId, qty });
      }

      // If any location is unmapped, skip replacing this item to avoid wrong warehouse assignment.
      if (missingMappingsForItem > 0) {
        itemsWithUnmappedLocations += 1;
        preservedWithUnmappedLocations += 1;
        continue;
      }

      if (itemSnapshots.length === 0) {
        preservedWithoutLocations += 1;
        continue;
      }

      itemIdsToReplace.add(itemId);
      for (const snapshot of itemSnapshots) {
        addSnapshot(snapshots, snapshotIndexByItemWarehouse, snapshot.warehouseId, itemId, snapshot.qty);
      }
    }

    console.log(`[SYNC DEBUG] Finished processing items. Found ${snapshots.length} total snapshots to insert.`);

    // Borrar todos los snapshots de los ítems que vamos a reescribir (evita dejar todo en X1)
    const itemIdsArray = Array.from(itemIdsToReplace);
    if (itemIdsArray.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < itemIdsArray.length; i += batchSize) {
        const batch = itemIdsArray.slice(i, i + batchSize);
        await supabase.from('stock_snapshots').delete().in('item_id', batch);
      }
    }

    // Insertar los nuevos snapshots en lotes
    if (snapshots.length > 0) {
      console.log(`[SYNC DEBUG] Inserting ${snapshots.length} snapshots in batches...`);
      const batchSize = 500;
      for (let i = 0; i < snapshots.length; i += batchSize) {
        const batch = snapshots.slice(i, i + batchSize);
        const { error: insertError } = await supabase.from('stock_snapshots').insert(batch);
        if (insertError) {
          console.error('[SYNC ERROR] Insert snapshots batch failed:', insertError);
        }
      }
      snapshotsCreated = snapshots.length;
    }

    // Mantener inventory_balance (modelo v2) alineado con snapshots.
    // Reemplaza balances solo de los ítems procesados para no tocar inventario ajeno.
    if (itemIdsArray.length > 0) {
      let canSyncInventoryBalance = true;
      const deleteBatchSize = 500;

      for (let i = 0; i < itemIdsArray.length; i += deleteBatchSize) {
        const batch = itemIdsArray.slice(i, i + deleteBatchSize);
        const { error } = await supabase
          .from('inventory_balance' as any)
          .delete()
          .in('item_id', batch);

        if (error) {
          if (isMissingRelationError(error)) {
            console.warn('[SYNC WARN] inventory_balance table not found, skipping v2 balance sync');
          } else {
            console.error('[SYNC ERROR] Failed deleting inventory_balance rows:', error);
          }
          canSyncInventoryBalance = false;
          break;
        }
      }

      if (canSyncInventoryBalance && snapshots.length > 0) {
        const nowIso = new Date().toISOString();
        const balanceRows = snapshots.map((snapshot) => ({
          item_id: snapshot.item_id,
          warehouse_id: snapshot.warehouse_id,
          qty_on_hand: snapshot.qty ?? 0,
          source: 'full_sync',
          source_ts: snapshot.source_ts || nowIso,
          updated_at: nowIso,
        }));

        const insertBatchSize = 500;
        for (let i = 0; i < balanceRows.length; i += insertBatchSize) {
          const batch = balanceRows.slice(i, i + insertBatchSize);
          const { error } = await (supabase.from as any)('inventory_balance').insert(batch as any);

          if (error) {
            if (isMissingRelationError(error)) {
              console.warn('[SYNC WARN] inventory_balance table not found during insert, skipping v2 balance sync');
            } else {
              console.error('[SYNC ERROR] Failed inserting inventory_balance rows:', error);
            }
            canSyncInventoryBalance = false;
            break;
          }
          inventoryBalanceRows += batch.length;
        }
      }

      inventoryBalanceSynced = canSyncInventoryBalance;
    }

    // Recalcular stock_total para excluir bodegas inactivas
    // Esto asegura que el total en la UI coincida con la suma de bodegas visibles
    if (itemIdsToReplace.size > 0) {
      console.log(`[SYNC DEBUG] Recalculating stock_total for ${itemIdsToReplace.size} items...`);
      const allItemIds = Array.from(itemIdsToReplace);
      // Procesar en lotes para no saturar
      const batchSize = 100;

      for (let i = 0; i < allItemIds.length; i += batchSize) {
        const batch = allItemIds.slice(i, i + batchSize);

        // Calcular suma de stock solo de bodegas ACTIVAS para estos items
        const { data: stockSums, error: sumError } = await supabase
          .from('stock_snapshots')
          .select('item_id, qty, warehouses!inner(active)')
          .in('item_id', batch)
          .eq('warehouses.active', true);

        if (!sumError && stockSums) {
          const sumsByItem = new Map<string, number>();
          stockSums.forEach((row: any) => {
            const current = sumsByItem.get(row.item_id) ?? 0;
            sumsByItem.set(row.item_id, current + (row.qty ?? 0));
          });

          // Actualizar items con el nuevo total calculado
          const updates = batch.map(itemId => ({
            id: itemId,
            stock_total: sumsByItem.get(itemId) ?? 0,
          }));

          await Promise.all(
            updates.map(update =>
              supabase.from('items').update({ stock_total: update.stock_total }).eq('id', update.id)
            )
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      snapshotsCreated,
      itemsCreated,
      itemsSkipped,
      existingItemsSkipped,
      itemsWithWarehouses,
      itemsWithoutWarehouses,
      missingWarehouseMappings,
      itemsWithUnmappedLocations,
      preservedWithoutLocations,
      preservedWithUnmappedLocations,
      zohoItemsTotal: zohoItems.length,
      warehousesMapped: warehouseMap.size,
      itemsMapped: itemMapByZoho.size,
      itemsMatchedBySku,
      itemsRelinkedBySku,
      sampleZohoWarehouseIds: Array.from(sampleZohoWarehouseIds).slice(0, 10),
      inventoryBalanceSynced,
      inventoryBalanceRows,
      mode: onlyNew ? 'only_new' : 'full',
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
