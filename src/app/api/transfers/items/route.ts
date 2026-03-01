
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
    getAuthenticatedProfile,
    getWarehouseAccessScope,
    isWarehouseAllowed,
} from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
};
const SEARCH_ITEM_LIMIT = 500;
const DEFAULT_ITEM_LIMIT = 120;

function isMissingRelationError(error: any): boolean {
    return String(error?.code || '') === '42P01';
}

function isMissingSourceTsColumn(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return message.includes("column inventory_balance.source_ts does not exist");
}

function sanitizeTerm(raw: string): string {
    return raw.trim().replace(/[,%()'"]/g, ' ').replace(/\s+/g, ' ');
}

function asQty(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function asTs(value: unknown): number {
    const n = new Date(String(value || '')).getTime();
    return Number.isFinite(n) ? n : 0;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = sanitizeTerm(searchParams.get('search') || '');
        const warehouseId = searchParams.get('warehouseId');

        if (!warehouseId) {
            return NextResponse.json({ error: 'Warehouse ID required' }, { status: 400, headers: NO_STORE_HEADERS });
        }

        const supabase = createRouteHandlerClient({ cookies });
        const auth = await getAuthenticatedProfile(supabase);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE_HEADERS });
        }

        const moduleAccess = await getEffectiveModuleAccess(supabase, auth.userId, auth.role);
        if (!hasModuleAccess(moduleAccess, 'transfers')) {
            return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403, headers: NO_STORE_HEADERS });
        }

        const scope = await getWarehouseAccessScope(supabase, auth.userId, auth.role);
        if (!scope.canViewStock) {
            return NextResponse.json([], { headers: NO_STORE_HEADERS });
        }

        if (!isWarehouseAllowed(scope, warehouseId)) {
            return NextResponse.json(
                { error: 'No tienes permiso para consultar esa bodega' },
                { status: 403, headers: NO_STORE_HEADERS }
            );
        }

        // 1) Buscar primero items por término (evita consultas gigantes con .in de miles de IDs).
        let itemQuery = supabase
            .from('items')
            .select('id, name, sku, zoho_item_id, price')
            .limit(DEFAULT_ITEM_LIMIT);

        if (search) {
            itemQuery = itemQuery
                .or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
                .limit(SEARCH_ITEM_LIMIT);
        } else {
            itemQuery = itemQuery.order('updated_at', { ascending: false });
        }

        const { data: items, error: itemError } = await itemQuery;
        if (itemError) throw itemError;
        if (!items || items.length === 0) return NextResponse.json([], { headers: NO_STORE_HEADERS });

        const itemIds = items.map((item: any) => item.id);
        const latestBalanceByItem = new Map<string, { qty: number; ts: number }>();
        const latestSnapshotByItem = new Map<string, { qty: number; ts: number }>();

        // 2) inventory_balance (preferido)
        try {
            let { data: balances, error: balanceError } = await (supabase.from as any)('inventory_balance')
                .select('item_id, qty_on_hand, updated_at, source_ts')
                .eq('warehouse_id', warehouseId)
                .order('updated_at', { ascending: false })
                .order('source_ts', { ascending: false })
                .in('item_id', itemIds);

            if (balanceError && isMissingSourceTsColumn(balanceError)) {
                const retry = await (supabase.from as any)('inventory_balance')
                    .select('item_id, qty_on_hand, updated_at')
                    .eq('warehouse_id', warehouseId)
                    .order('updated_at', { ascending: false })
                    .in('item_id', itemIds);
                balances = retry.data as any;
                balanceError = retry.error as any;
            }

            if (balanceError) {
                if (!isMissingRelationError(balanceError)) throw balanceError;
            } else {
                for (const row of balances || []) {
                    const itemId = String((row as any).item_id || '');
                    if (!itemId) continue;
                    const candidate = {
                        qty: asQty((row as any).qty_on_hand),
                        ts: Math.max(asTs((row as any).updated_at), asTs((row as any).source_ts)),
                    };
                    const current = latestBalanceByItem.get(itemId);
                    if (!current || candidate.ts > current.ts) {
                        latestBalanceByItem.set(itemId, candidate);
                    }
                }
            }
        } catch (balanceError: any) {
            console.warn('[transfers/items] inventory_balance unavailable, fallback to stock_snapshots', balanceError?.message);
        }

        // 3) fallback/complemento desde snapshots para los mismos items
        const { data: snapshots, error: snapshotError } = await supabase
            .from('stock_snapshots')
            .select('item_id, qty, synced_at')
            .eq('warehouse_id', warehouseId)
            .in('item_id', itemIds)
            .order('synced_at', { ascending: false })
            .limit(3000);
        if (snapshotError) throw snapshotError;

        for (const row of snapshots || []) {
            const itemId = String((row as any).item_id || '');
            if (!itemId) continue;
            if (latestSnapshotByItem.has(itemId)) continue; // ordered desc by synced_at
            latestSnapshotByItem.set(itemId, {
                qty: asQty((row as any).qty),
                ts: asTs((row as any).synced_at),
            });
        }

        const result = items
            .map((item: any) => {
                const balance = latestBalanceByItem.get(item.id);
                const snapshot = latestSnapshotByItem.get(item.id);

                let currentStock = 0;
                if (balance && snapshot) {
                    currentStock = snapshot.ts > balance.ts ? snapshot.qty : balance.qty;
                } else if (balance) {
                    currentStock = balance.qty;
                } else if (snapshot) {
                    currentStock = snapshot.qty;
                }

                return {
                    id: item.id,
                    zoho_item_id: item.zoho_item_id,
                    name: item.name,
                    sku: item.sku,
                    unit_price: Number(item.price ?? 0),
                    current_stock: currentStock,
                };
            })
            .filter((row: any) => row.current_stock > 0)
            .sort((a: any, b: any) => b.current_stock - a.current_stock)
            .slice(0, 20);

        return NextResponse.json(result, { headers: NO_STORE_HEADERS });

    } catch (error: any) {
        console.error('Error searching items:', error);
        return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
}
