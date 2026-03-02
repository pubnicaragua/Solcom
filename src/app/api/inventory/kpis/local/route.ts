import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  getAuthenticatedProfile,
  getWarehouseAccessScope,
  listWarehousesForScope,
} from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

export const dynamic = 'force-dynamic';

async function fetchScopedPivotItems(request: Request) {
  const origin = new URL(request.url).origin;
  const response = await fetch(`${origin}/api/inventory/pivot?showZeroStock=true`, {
    headers: {
      cookie: request.headers.get('cookie') || '',
      'Cache-Control': 'no-cache',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pivot API error ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    model: String(payload?.model || 'inventory_balance'),
  };
}

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const auth = await getAuthenticatedProfile(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const moduleAccess = await getEffectiveModuleAccess(supabase, auth.userId, auth.role);
    if (!hasModuleAccess(moduleAccess, 'inventory')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    const scope = await getWarehouseAccessScope(supabase, auth.userId, auth.role);
    if (!scope.canViewStock) {
      return NextResponse.json({
        totalSKUs: 0,
        totalProducts: 0,
        totalStock: 0,
        totalValue: 0,
        activeWarehouses: 0,
        lastSync: 'Nunca',
        source: 'permissions',
      });
    }

    const activeWarehouses = await listWarehousesForScope(supabase, scope, { activeOnly: true });
    const activeWarehouseIds = activeWarehouses.map((warehouse) => warehouse.id);

    if (activeWarehouseIds.length === 0) {
      return NextResponse.json({
        totalSKUs: 0,
        totalProducts: 0,
        totalStock: 0,
        totalValue: 0,
        activeWarehouses: 0,
        lastSync: 'Nunca',
        source: 'permissions',
      });
    }

    const [pivot, snapshotsResult, balanceSyncResult] = await Promise.all([
      fetchScopedPivotItems(request),
      supabase
        .from('stock_snapshots')
        .select('synced_at, warehouse_id')
        .in('warehouse_id', activeWarehouseIds)
        .order('synced_at', { ascending: false })
        .limit(1),
      (supabase.from as any)('inventory_balance')
        .select('updated_at, warehouse_id')
        .in('warehouse_id', activeWarehouseIds)
        .order('updated_at', { ascending: false })
        .limit(1),
    ]);

    const items = pivot.items;
    const skuSet = new Set<string>();
    let totalStock = 0;
    let totalValue = 0;

    for (const item of items) {
      const sku = String(item?.sku || '').trim();
      if (sku) skuSet.add(sku);
      const stock = Number(item?.total ?? 0);
      const price = Number(item?.price ?? 0);
      totalStock += stock;
      totalValue += stock * price;
    }

    const balanceUpdatedAt = (balanceSyncResult as any)?.data?.[0]?.updated_at || null;
    const snapshotSyncedAt = (snapshotsResult.data as any)?.[0]?.synced_at || null;
    const lastSyncTs = balanceUpdatedAt || snapshotSyncedAt;
    const lastSync = lastSyncTs
      ? format(new Date(lastSyncTs), 'dd MMM yyyy, HH:mm', { locale: es })
      : 'Nunca';

    return NextResponse.json(
      {
        totalSKUs: skuSet.size,
        totalProducts: items.length,
        totalStock,
        totalValue,
        activeWarehouses: activeWarehouses.length,
        lastSync,
        source: pivot.model || 'inventory_balance',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('[KPIs local] Error:', error);
    return NextResponse.json({ error: 'Error al obtener KPIs' }, { status: 500 });
  }
}
