import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { getZohoAccessToken, fetchItemLocations } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function isMissingRelationError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === '42P01' || message.includes('does not exist');
}

function toQty(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function isInvalidUrlZohoError(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('invalid url passed') || (message.includes('zoho books api error: 404') && message.includes('"code":5'));
}

async function resolveZohoTransferOrderId(zohoClient: any, transfer: any): Promise<string | null> {
    const directId = String(transfer?.zoho_transfer_order_id || '').trim();
    if (/^\d+$/.test(directId)) {
        return directId;
    }

    const transferNumber = String(transfer?.transfer_order_number || '').trim();
    if (!transferNumber) {
        return directId || null;
    }

    let page = 1;
    while (page <= 15) {
        const res = await zohoClient.listTransferOrders(page);
        const orders = Array.isArray(res?.transferorders)
            ? res.transferorders
            : Array.isArray(res?.transfer_orders)
                ? res.transfer_orders
                : [];

        const found = orders.find((order: any) => (
            String(order?.transfer_order_number || '').trim() === transferNumber
        ));
        if (found?.transfer_order_id) {
            return String(found.transfer_order_id);
        }

        if (!res?.page_context?.has_more_page) break;
        page += 1;
    }

    return directId || null;
}

async function replaceInventoryBalance(
    supabase: any,
    itemId: string,
    rows: Array<{ warehouse_id: string; qty: number }>,
    mappedWarehouseIds: string[]
) {
    if (!itemId || mappedWarehouseIds.length === 0) return;

    const DELETE_BATCH = 200;
    for (let i = 0; i < mappedWarehouseIds.length; i += DELETE_BATCH) {
        const batch = mappedWarehouseIds.slice(i, i + DELETE_BATCH);
        const { error } = await (supabase.from as any)('inventory_balance')
            .delete()
            .eq('item_id', itemId)
            .in('warehouse_id', batch);
        if (error && !isMissingRelationError(error)) {
            throw error;
        }
        if (isMissingRelationError(error)) {
            return;
        }
    }

    if (rows.length === 0) return;

    const nowIso = new Date().toISOString();
    const balanceRows = rows.map((row) => ({
        item_id: itemId,
        warehouse_id: row.warehouse_id,
        qty_on_hand: row.qty,
        source: 'transfer_receive',
        source_ts: nowIso,
        updated_at: nowIso,
    }));

    const INSERT_BATCH = 500;
    for (let i = 0; i < balanceRows.length; i += INSERT_BATCH) {
        const batch = balanceRows.slice(i, i + INSERT_BATCH);
        const { error } = await (supabase.from as any)('inventory_balance').insert(batch as any);
        if (error && !isMissingRelationError(error)) {
            throw error;
        }
        if (isMissingRelationError(error)) {
            return;
        }
    }
}

async function syncItemStockFromZoho(
    supabase: any,
    zohoItemId: string,
    warehouseMap: Map<string, { id: string; active: boolean }>,
    mappedWarehouseIds: string[],
    organizationId: string
): Promise<{ updated: boolean; reason?: string }> {
    const auth = await getZohoAccessToken();
    if ('error' in auth) {
        return { updated: false, reason: auth.error };
    }

    const locations = await fetchItemLocations(
        auth.accessToken,
        auth.apiDomain,
        organizationId,
        zohoItemId
    );

    const { data: itemRows } = await supabase
        .from('items')
        .select('id, stock_total')
        .eq('zoho_item_id', zohoItemId)
        .limit(1);

    const localItemId = itemRows?.[0]?.id;
    if (!localItemId) {
        return { updated: false, reason: 'item_not_found_local' };
    }

    if (!Array.isArray(locations) || locations.length === 0) {
        return { updated: false, reason: 'no_locations' };
    }

    const snapshots: Array<{ warehouse_id: string; item_id: string; qty: number; source_ts: string; synced_at: string }> = [];
    let cleanStock = 0;
    let unmapped = 0;

    for (const loc of locations) {
        const wh = warehouseMap.get(String(loc.location_id));
        const qty = toQty(loc.location_stock_on_hand ?? loc.location_available_stock);
        if (!wh) {
            unmapped += 1;
            continue;
        }
        snapshots.push({
            warehouse_id: wh.id,
            item_id: localItemId,
            qty,
            source_ts: new Date().toISOString(),
            synced_at: new Date().toISOString(),
        });
        if (wh.active) cleanStock += qty;
    }

    if (unmapped > 0) {
        return { updated: false, reason: `unmapped_locations:${unmapped}` };
    }

    const { error: deleteSnapshotsError } = await supabase
        .from('stock_snapshots')
        .delete()
        .eq('item_id', localItemId);
    if (deleteSnapshotsError) {
        throw deleteSnapshotsError;
    }

    if (snapshots.length > 0) {
        const { error: insertSnapshotsError } = await supabase
            .from('stock_snapshots')
            .insert(snapshots);
        if (insertSnapshotsError) {
            throw insertSnapshotsError;
        }
    }

    const { error: updateItemError } = await supabase
        .from('items')
        .update({ stock_total: cleanStock })
        .eq('id', localItemId);
    if (updateItemError) {
        throw updateItemError;
    }

    await replaceInventoryBalance(
        supabase,
        localItemId,
        snapshots.map((s) => ({ warehouse_id: s.warehouse_id, qty: s.qty })),
        mappedWarehouseIds
    );

    return { updated: true };
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
    try {
        const { id } = params;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Get transfer from DB
        const { data: transfer, error: fetchError } = await supabase
            .from('transfer_orders')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !transfer) {
            return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
        }

        if (transfer.status === 'received') {
            return NextResponse.json({ error: 'Already received' }, { status: 400 });
        }

        const zohoClient = createZohoBooksClient();
        if (!zohoClient) {
            return NextResponse.json({ error: 'Zoho client not configured' }, { status: 500 });
        }

        // 2. Mark as Received in Zoho
        let zohoTransferOrderId = await resolveZohoTransferOrderId(zohoClient, transfer);
        if (!zohoTransferOrderId) {
            return NextResponse.json({
                error: 'Transferencia sin zoho_transfer_order_id válido',
                details: `id_local=${transfer.id} zoho_transfer_order_id=${transfer.zoho_transfer_order_id ?? 'null'} transfer_order_number=${transfer.transfer_order_number ?? 'null'}`
            }, { status: 400 });
        }

        let zohoRes: any;
        try {
            zohoRes = await zohoClient.markTransferOrderReceived(zohoTransferOrderId, transfer.date || null);
        } catch (error: any) {
            if (isInvalidUrlZohoError(error) && transfer.transfer_order_number) {
                const resolvedByNumber = await resolveZohoTransferOrderId(zohoClient, {
                    zoho_transfer_order_id: '',
                    transfer_order_number: transfer.transfer_order_number,
                });

                if (resolvedByNumber && resolvedByNumber !== zohoTransferOrderId) {
                    zohoTransferOrderId = resolvedByNumber;
                    zohoRes = await zohoClient.markTransferOrderReceived(zohoTransferOrderId, transfer.date || null);
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }

        if (zohoRes.code !== 0) {
            throw new Error(`Zoho Error: ${zohoRes.message}`);
        }

        // If we resolved a different Zoho ID, persist it for future operations.
        if (String(transfer.zoho_transfer_order_id || '') !== zohoTransferOrderId) {
            await supabase
                .from('transfer_orders')
                .update({ zoho_transfer_order_id: zohoTransferOrderId })
                .eq('id', id);
        }

        // 3. Update local transfer status
        const { error: updateError } = await supabase
            .from('transfer_orders')
            .update({
                status: 'received',
                received_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateError) throw updateError;

        // 4. Immediate stock sync for line items after receive (do not wait only for webhook)
        const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        const syncErrors: string[] = [];
        const syncedItems: string[] = [];

        if (orgId) {
            const { data: warehouses } = await supabase
                .from('warehouses')
                .select('id, zoho_warehouse_id, active')
                .not('zoho_warehouse_id', 'is', null);

            const warehouseMap = new Map(
                (warehouses || []).map((w: any) => [String(w.zoho_warehouse_id), { id: w.id, active: !!w.active }])
            );
            const mappedWarehouseIds = Array.from(new Set((warehouses || []).map((w: any) => w.id)));

            const lineItems = Array.isArray(transfer.line_items) ? transfer.line_items : [];
            const zohoIdsFromLines = new Set<string>();

            for (const line of lineItems) {
                const zohoItemId = String(line?.zoho_item_id || line?.item_id || '').trim();
                if (zohoItemId) zohoIdsFromLines.add(zohoItemId);
            }

            for (const zohoItemId of zohoIdsFromLines) {
                try {
                    const result = await syncItemStockFromZoho(
                        supabase,
                        zohoItemId,
                        warehouseMap,
                        mappedWarehouseIds,
                        orgId
                    );
                    if (result.updated) {
                        syncedItems.push(zohoItemId);
                    } else if (result.reason) {
                        syncErrors.push(`${zohoItemId}: ${result.reason}`);
                    }
                } catch (error: any) {
                    syncErrors.push(`${zohoItemId}: ${error?.message || 'sync_error'}`);
                }
            }
        }

        return NextResponse.json({
            success: true,
            syncedItems,
            syncErrors,
        });

    } catch (error: any) {
        console.error('Error receiving transfer:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
