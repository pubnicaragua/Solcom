import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fetchItemLocations, getZohoAccessToken } from '../src/lib/zoho/inventory-utils';
import { syncItemStock } from '../src/lib/zoho/sync-logic';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const organizationId = String(process.env.ZOHO_BOOKS_ORGANIZATION_ID || '').replace(/[^0-9]/g, '');

if (!supabaseUrl || !serviceRoleKey) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
if (!organizationId) throw new Error('Falta ZOHO_BOOKS_ORGANIZATION_ID.');

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function fetchAllZohoItems(accessToken: string, apiDomain: string) {
  const items: any[] = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `${apiDomain}/inventory/v1/items?organization_id=${organizationId}&per_page=200&page=${page}`,
      { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } },
    );
    const data = await readJson(response);
    if (!response.ok) throw new Error(`Zoho items ${response.status}`);
    items.push(...(data.items || []));
    if (data.page_context?.has_more_page !== true) break;
  }
  return items;
}

async function fetchAllErpItems() {
  const items: any[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await supabase
      .from('items')
      .select('id,sku,name,stock_total,zoho_item_id,zoho_removed_at')
      .range(from, from + 999);
    if (result.error) throw result.error;
    items.push(...(result.data || []));
    if (!result.data || result.data.length < 1000) break;
  }
  return items;
}

async function fetchBalanceTotals() {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await supabase
      .from('inventory_balance')
      .select('item_id,qty_on_hand')
      .range(from, from + 999);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < 1000) break;
  }

  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.item_id, (totals.get(row.item_id) || 0) + Number(row.qty_on_hand || 0));
  }
  return totals;
}

async function main() {
  const auth = await getZohoAccessToken({ forceRefresh: true });
  if ('error' in auth) throw new Error(auth.error);

  const [zohoItems, erpItems, balanceTotals] = await Promise.all([
    fetchAllZohoItems(auth.accessToken, auth.apiDomain),
    fetchAllErpItems(),
    fetchBalanceTotals(),
  ]);

  const erpByZohoId = new Map(
    erpItems.filter((item) => item.zoho_item_id).map((item) => [String(item.zoho_item_id), item]),
  );
  const zohoIds = new Set(zohoItems.map((item) => String(item.item_id)));

  const targets: any[] = [];
  const sourceConflicts: any[] = [];
  for (const zohoItem of zohoItems) {
    const sku = String(zohoItem.sku || '').trim();
    const erpItem = erpByZohoId.get(String(zohoItem.item_id));
    const zohoStock = Number(zohoItem.stock_on_hand || 0);
    const erpStock = erpItem ? Number(erpItem.stock_total || 0) : null;
    const erpCalculatedStock = erpItem ? Number(balanceTotals.get(erpItem.id) || 0) : null;

    if (!erpItem || zohoStock !== erpStock || zohoStock !== erpCalculatedStock) {
      let zohoLocationStock: number | null = null;
      let zohoLocationCount = 0;

      if (erpItem) {
        const locations = await fetchItemLocations(
          auth.accessToken,
          auth.apiDomain,
          organizationId,
          String(zohoItem.item_id),
        );
        zohoLocationCount = locations.length;
        if (locations.length > 0) {
          zohoLocationStock = locations.reduce(
            (sum: number, location: any) => sum + Number(location.location_stock_on_hand ?? location.location_available_stock ?? 0),
            0,
          );
        }
      }

      const expectedStock = zohoLocationStock ?? zohoStock;
      const hasOperationalMismatch = !erpItem
        || expectedStock !== erpStock
        || expectedStock !== erpCalculatedStock;

      if (hasOperationalMismatch) {
        targets.push({
          zohoItem,
          erpItem,
          sku,
          zohoStock,
          zohoLocationStock,
          zohoLocationCount,
          expectedStock,
          erpStock,
          erpCalculatedStock,
        });
      } else if (zohoLocationStock !== null && zohoStock !== zohoLocationStock) {
        sourceConflicts.push({
          sku,
          zoho_item_id: String(zohoItem.item_id),
          zohoAggregateStock: zohoStock,
          zohoLocationStock,
          locationCount: zohoLocationCount,
        });
      }

      // Avoid bursting the Zoho API when auditing a changing catalog.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  // Items that were managed by Zoho but no longer exist there must not keep
  // operational stock in the ERP. They are soft-retired by syncItemStock so
  // history remains available without showing stale inventory to users.
  const retiredTargets = erpItems.filter((item) => {
    if (item.zoho_removed_at || !item.zoho_item_id) return false;
    // Once an ERP row has a Zoho identity, that ID is authoritative. A
    // matching SKU on another Zoho row must not hide a stale identity.
    return !zohoIds.has(String(item.zoho_item_id));
  });

  targets.sort((a, b) => {
    if (a.sku === '195951409122') return -1;
    if (b.sku === '195951409122') return 1;
    return a.sku.localeCompare(b.sku);
  });

  const warehouseResult = await supabase
    .from('warehouses')
    .select('id,zoho_warehouse_id,active')
    .not('zoho_warehouse_id', 'is', null);
  if (warehouseResult.error) throw warehouseResult.error;

  const warehouseMap = new Map<string, { id: string; active: boolean }>();
  for (const warehouse of warehouseResult.data || []) {
    warehouseMap.set(String(warehouse.zoho_warehouse_id), {
      id: warehouse.id,
      active: Boolean(warehouse.active),
    });
  }

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    zoho_items: zohoItems.length,
    erp_items: erpItems.length,
    target_items: targets.length,
    zoho_source_conflicts: sourceConflicts.length,
    mapped_warehouses: warehouseMap.size,
    target_skus: targets.map((target) => target.sku || target.zohoItem.item_id),
    source_conflicts: sourceConflicts,
    retired_skus: retiredTargets.map((item) => item.sku || item.zoho_item_id),
  }, null, 2));

  if (!APPLY) return;

  let completed = 0;
  let failed = 0;
  const failures: any[] = [];

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const debugLog: string[] = [];
    const result = await syncItemStock(
      String(target.zohoItem.item_id),
      supabase,
      warehouseMap,
      debugLog,
      { accessToken: auth.accessToken, apiDomain: auth.apiDomain },
    );

    if (result.success) {
      completed += 1;
      console.log(`[${index + 1}/${targets.length}] OK ${target.sku || target.zohoItem.item_id}: Zoho location=${target.zohoLocationStock ?? 'n/a'} / aggregate=${target.zohoStock} -> ERP=${result.stockTotal}`);
    } else {
      failed += 1;
      const failure = {
        sku: target.sku || null,
        zoho_item_id: String(target.zohoItem.item_id),
        previous_erp_stock: target.erpStock,
        zoho_stock: target.zohoStock,
        error: result.error || 'unknown',
        debug: debugLog.slice(-4),
      };
      failures.push(failure);
      console.log(`[${index + 1}/${targets.length}] FAIL ${failure.sku || failure.zoho_item_id}: ${failure.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  let retired = 0;
  let retirementFailed = 0;
  const retirementFailures: any[] = [];
  for (let index = 0; index < retiredTargets.length; index += 1) {
    const item = retiredTargets[index];
    const debugLog: string[] = [];
    const result = await syncItemStock(
      String(item.zoho_item_id),
      supabase,
      warehouseMap,
      debugLog,
      { accessToken: auth.accessToken, apiDomain: auth.apiDomain },
    );

    if (result.success) {
      retired += 1;
      console.log(`[retire ${index + 1}/${retiredTargets.length}] OK ${item.sku || item.zoho_item_id}: stock local=0`);
    } else {
      retirementFailed += 1;
      retirementFailures.push({
        sku: item.sku || null,
        zoho_item_id: String(item.zoho_item_id),
        error: result.error || 'unknown',
        debug: debugLog.slice(-4),
      });
      console.log(`[retire ${index + 1}/${retiredTargets.length}] FAIL ${item.sku || item.zoho_item_id}: ${result.error || 'unknown'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log(JSON.stringify({
    completed,
    failed,
    failures,
    retired,
    retirementFailed,
    retirementFailures,
  }, null, 2));
  if (failed > 0 || retirementFailed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal_error: error?.message || String(error) }));
  process.exitCode = 1;
});
