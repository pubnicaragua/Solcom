import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getZohoAccessToken, fetchItemLocations } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

function getSystemStatus() {
    return {
        has_org_id: !!process.env.ZOHO_BOOKS_ORGANIZATION_ID,
        has_client_id: !!process.env.ZOHO_BOOKS_CLIENT_ID,
        has_client_secret: !!process.env.ZOHO_BOOKS_CLIENT_SECRET,
        has_refresh_token: !!process.env.ZOHO_BOOKS_REFRESH_TOKEN,
        has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_supabase_anon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };
}

// =============================================
// Helper: sincronizar stock de UN item por zoho_item_id
// =============================================
async function syncItemStock(
    zohoItemId: string,
    supabase: any,
    warehouseMap: Map<string, { id: string; active: boolean }>,
    debugLog: string[]
): Promise<{ snapshotsCreated: number; stockTotal: number }> {
    const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    if (!organizationId) {
        debugLog.push(`[syncItemStock] ERROR: No ZOHO_BOOKS_ORGANIZATION_ID`);
        return { snapshotsCreated: 0, stockTotal: 0 };
    }

    const auth = await getZohoAccessToken();
    if ('error' in auth) {
        debugLog.push(`[syncItemStock] ERROR auth: ${(auth as any).error}`);
        return { snapshotsCreated: 0, stockTotal: 0 };
    }

    try {
        const locations = await fetchItemLocations(
            auth.accessToken,
            auth.apiDomain,
            organizationId,
            zohoItemId
        );
        debugLog.push(`[syncItemStock] ${zohoItemId}: ${locations.length} locations`);

        const { data: itemRows } = await supabase
            .from('items')
            .select('id')
            .eq('zoho_item_id', zohoItemId)
            .limit(1);

        const supabaseItemId = itemRows?.[0]?.id;
        if (!supabaseItemId) {
            debugLog.push(`[syncItemStock] WARN: Item ${zohoItemId} not in DB`);
            return { snapshotsCreated: 0, stockTotal: 0 };
        }

        let stockTotal = 0;
        for (const loc of locations) {
            const wh = warehouseMap.get(String(loc.location_id));
            if (wh?.active) {
                stockTotal += (loc.location_stock_on_hand ?? 0);
            }
        }

        await supabase.from('items').update({ stock_total: stockTotal }).eq('id', supabaseItemId);
        await supabase.from('stock_snapshots').delete().eq('item_id', supabaseItemId);

        const snapshots = [];
        for (const loc of locations) {
            const wh = warehouseMap.get(String(loc.location_id));
            if (!wh) continue;
            snapshots.push({
                warehouse_id: wh.id,
                item_id: supabaseItemId,
                qty: loc.location_stock_on_hand ?? loc.location_available_stock ?? 0,
                source_ts: new Date().toISOString(),
                synced_at: new Date().toISOString(),
            });
        }

        let snapshotsCreated = 0;
        if (snapshots.length > 0) {
            const { error } = await supabase.from('stock_snapshots').insert(snapshots);
            if (!error) snapshotsCreated = snapshots.length;
        }

        return { snapshotsCreated, stockTotal };
    } catch (err) {
        debugLog.push(`[syncItemStock] ERROR fatal: ${err instanceof Error ? err.message : 'Unknown'}`);
        return { snapshotsCreated: 0, stockTotal: 0 };
    }
}

// =============================================
// Main Webhook Handler
// =============================================
export async function POST(request: NextRequest) {
    const debugLog: string[] = [];
    const systemStatus = getSystemStatus();

    try {
        const payload = await request.json();
        const payloadKeys = Object.keys(payload);
        debugLog.push(`Payload received. Keys: ${payloadKeys.join(', ')}`);

        const supabase = createServerClient();

        // 1. Cargar bodegas
        const { data: warehouses } = await supabase.from('warehouses').select('id, zoho_warehouse_id, active').not('zoho_warehouse_id', 'is', null);
        const warehousesData = warehouses || [];
        const warehouseMap = new Map(warehousesData.map((w: any) => [String(w.zoho_warehouse_id), { id: w.id, active: w.active }]));
        debugLog.push(`Warehouses in DB: ${warehousesData.length}`);

        // 2. Determinar tipo de evento
        const isItemEvent = payloadKeys.includes('item') || payloadKeys.includes('data');
        const isInventoryAdjustment = payloadKeys.includes('inventory_adjustment') || payloadKeys.includes('stockadjustment') || payload.module?.includes('adjustment');
        const isCommonStockEvent = payloadKeys.includes('salesorder') || payloadKeys.includes('purchaseorder') || payloadKeys.includes('invoice') || payloadKeys.includes('bill') || payloadKeys.includes('transferorder');

        // --- Caso A: Item Event ---
        if (isItemEvent && !isInventoryAdjustment && !isCommonStockEvent) {
            debugLog.push('Routing to ITEM EVENT handler');
            const itemData = payload.item || payload.data || payload;
            const zohoItemId = String(itemData.item_id || '');

            if (!zohoItemId) {
                return NextResponse.json({ success: true, message: 'No item_id', debug: debugLog, systemStatus });
            }

            const customFields = itemData.custom_field_hash || {};
            const itemPayload = {
                sku: itemData.sku || `NO-SKU-${zohoItemId}`,
                name: itemData.name || 'Sin nombre',
                color: customFields.cf_color || null,
                state: customFields.cf_estado || null,
                zoho_item_id: zohoItemId,
                price: itemData.purchase_rate ?? null,
            };

            const { data: updated } = await supabase.from('items').update(itemPayload).eq('zoho_item_id', zohoItemId).select('id');
            let supabaseId = updated?.[0]?.id;

            if (!supabaseId) {
                const { data: inserted } = await supabase.from('items').insert(itemPayload).select('id');
                supabaseId = inserted?.[0]?.id;
            }

            if (supabaseId) {
                const result = await syncItemStock(zohoItemId, supabase, warehouseMap, debugLog);
                return NextResponse.json({ success: true, type: 'item', action: 'synced', supabase_id: supabaseId, snapshots: result.snapshotsCreated, debug: debugLog, systemStatus });
            }
        }

        // --- Caso B: Stock Events (Adjustments, Sales, etc) ---
        if (isInventoryAdjustment || isCommonStockEvent) {
            debugLog.push(`Routing to STOCK EVENT handler (isAdj=${isInventoryAdjustment})`);

            const eventData = payload.inventory_adjustment || payload.stockadjustment ||
                payload.salesorder || payload.purchaseorder ||
                payload.invoice || payload.bill ||
                payload.transferorder || payload;

            const lineItems: any[] = eventData.line_items || [];

            // Si no hay line items pero hay un item_id directo (ajuste de un solo item)
            let uniqueItemIds = [...new Set(lineItems.map((li: any) => String(li.item_id)).filter(Boolean))];
            if (uniqueItemIds.length === 0 && eventData.item_id) {
                uniqueItemIds = [String(eventData.item_id)];
            }

            debugLog.push(`Items to sync: ${uniqueItemIds.length}`);

            let totalSnapshots = 0;
            for (const zohoId of uniqueItemIds) {
                const result = await syncItemStock(zohoId, supabase, warehouseMap, debugLog);
                totalSnapshots += result.snapshotsCreated;
            }

            return NextResponse.json({
                success: true,
                type: isInventoryAdjustment ? 'adjustment' : 'stock_event',
                items_synced: uniqueItemIds.length,
                snapshots_created: totalSnapshots,
                debug: debugLog,
                systemStatus
            });
        }

        // Si no detectamos el tipo, registrar llaves y devolver
        debugLog.push(`WARN: Event type not recognized. Payload module: ${payload.module}`);
        return NextResponse.json({ success: true, message: 'Evento no reconocido', debug: debugLog, systemStatus });

    } catch (error) {
        debugLog.push(`FATAL: ${error instanceof Error ? error.message : 'Unknown'}`);
        return NextResponse.json({ error: 'Webhook processing failed', debug: debugLog, systemStatus }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ status: 'active', systemStatus: getSystemStatus() });
}
