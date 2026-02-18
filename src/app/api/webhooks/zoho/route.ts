import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import {
    normalizeItemId,
    normalizeItemState,
    syncItemStock,
} from '@/lib/zoho/sync-logic';

// Service Role Client for Webhooks (Bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';

function getSystemStatus() {
    return {
        has_org_id: !!process.env.ZOHO_BOOKS_ORGANIZATION_ID,
        has_client_id: !!process.env.ZOHO_BOOKS_CLIENT_ID,
        has_client_secret: !!process.env.ZOHO_BOOKS_CLIENT_SECRET,
        has_refresh_token: !!process.env.ZOHO_BOOKS_REFRESH_TOKEN,
        has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_supabase_anon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        has_supabase_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
}

// =============================================
// Helper: Collect Item IDs from ANY Payload Structure
// =============================================
function collectItemIdsFromPayload(payload: any): string[] {
    const ids = new Set<string>();

    const addId = (value: unknown) => {
        const id = normalizeItemId(value);
        if (id) ids.add(id);
    };

    const visit = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        if (typeof node !== 'object') return;

        // Specialized handling for known structures
        if (node.line_items && Array.isArray(node.line_items)) {
            node.line_items.forEach((line: any) => {
                addId(line.item_id || line.itemId || line.zoho_item_id || line.product_id);
            });
        }
        if (node.adjustment_details && Array.isArray(node.adjustment_details)) {
            node.adjustment_details.forEach((line: any) => {
                addId(line.item_id || line.itemId);
            });
        }

        for (const [key, value] of Object.entries(node)) {
            const normalizedKey = key.toLowerCase();
            if (normalizedKey === 'item_id' || normalizedKey === 'itemid' || normalizedKey === 'zoho_item_id' || normalizedKey === 'product_id') {
                addId(value);
            }
            // Recurse, but avoid infinite loops or huge depth if possible (for now simple recursion)
            if (typeof value === 'object' && value !== null) {
                visit(value);
            }
        }
    };

    visit(payload);
    return Array.from(ids);
}


// =============================================
// Main Webhook Handler
// =============================================
export async function POST(request: NextRequest) {
    const debugLog: string[] = [];
    const systemStatus = getSystemStatus();

    try {
        const { searchParams } = new URL(request.url);
        const secret = searchParams.get('secret');

        // Optional Secret Check
        if (secret && process.env.ZOHO_WEBHOOK_SECRET && secret !== process.env.ZOHO_WEBHOOK_SECRET) {
            return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
        }

        const contentType = request.headers.get('content-type') || '';
        let payload: any = {};

        if (contentType.includes('application/json')) {
            payload = await request.json();
        } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const jsonString = formData.get('JSONString');
            if (jsonString && typeof jsonString === 'string') {
                payload = JSON.parse(jsonString);
            }
        }

        const payloadKeys = Object.keys(payload);
        debugLog.push(`Payload received. Keys: ${payloadKeys.join(', ')}`);

        // Use Service Role Client
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Cargar bodegas (needed for sync logic)
        const { data: warehouses } = await supabase.from('warehouses').select('id, zoho_warehouse_id, active').not('zoho_warehouse_id', 'is', null);
        const warehousesData = warehouses || [];
        const warehouseMap = new Map(warehousesData.map((w: any) => [String(w.zoho_warehouse_id), { id: w.id, active: w.active }]));

        // 2. Identify Event Type
        // We look for specific top-level keys that Zoho sends
        const isBill = payload.bill || payloadKeys.includes('bill');
        const isTransfer = payload.transfer_order || payload.transferorder || payloadKeys.includes('transfer_order');
        const isAdjustment = payload.inventory_adjustment || payload.stockadjustment || payloadKeys.includes('inventory_adjustment');
        const isSalesOrder = payload.salesorder || payload.sales_order;
        const isInvoice = payload.invoice;
        const isItemEvent = payload.item || payload.item_id;

        debugLog.push(`Event Type Detected: Bill=${!!isBill}, Transfer=${!!isTransfer}, Adjust=${!!isAdjustment}, SO=${!!isSalesOrder}, Inv=${!!isInvoice}`);

        // 3. Extract ALL Item IDs involved
        // This is the safety net: ANY item ID found in the payload gets synced.
        const allItemIds = collectItemIdsFromPayload(payload);
        debugLog.push(`Extracted ${allItemIds.length} unique Item IDs to sync`);

        // --- SPECIAL HANDLING: Transfer Order Upsert ---
        // (Keep existing logic but ensure we sync items too)
        const transferOrder = payload.transfer_order || payload.transferorder;
        if (transferOrder) {
            const fromId = warehouseMap.get(String(transferOrder.from_location_id || transferOrder.from_warehouse_id))?.id;
            const toId = warehouseMap.get(String(transferOrder.to_location_id || transferOrder.to_warehouse_id))?.id;
            const status = transferOrder.status === 'received' ? 'received' : 'in_transit';

            const { error: upsertError } = await supabase.from('transfer_orders').upsert({
                zoho_transfer_order_id: transferOrder.transfer_order_id,
                transfer_order_number: transferOrder.transfer_order_number,
                date: transferOrder.date,
                from_warehouse_id: fromId,
                to_warehouse_id: toId,
                status: status,
                line_items: transferOrder.line_items,
                received_at: status === 'received' ? new Date().toISOString() : null
            }, { onConflict: 'zoho_transfer_order_id' });

            if (upsertError) debugLog.push(`Transfer upsert error: ${upsertError.message}`);
            else debugLog.push('Transfer Order upserted locally');
        }

        // 4. EXECUTE SYNC for all extracted items
        const processed = [];
        const errors = [];

        for (const zohoId of allItemIds) {
            try {
                // syncItemStock fetches fresh data from Zoho and updates Supabase
                await syncItemStock(zohoId, supabase, warehouseMap, debugLog);
                processed.push(zohoId);
            } catch (err: any) {
                errors.push({ id: zohoId, error: err.message });
                debugLog.push(`Failed to sync item ${zohoId}: ${err.message}`);
            }
        }

        return NextResponse.json({
            success: true,
            processedCount: processed.length,
            errorCount: errors.length,
            debug: debugLog
        });

    } catch (error) {
        debugLog.push(`FATAL: ${error instanceof Error ? error.message : 'Unknown'}`);
        return NextResponse.json({ error: 'Webhook processing failed', debug: debugLog }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ status: 'active', systemStatus: getSystemStatus() });
}
