import { createZohoBooksClient } from '@/lib/zoho/books-client';
import {
    replaceOrderSerialReservations,
    SerialReservationError,
} from '@/lib/ventas/serial-reservations';
import {
    PickTransitionError,
    transitionPickOrderStatus,
} from '@/lib/ventas/picking';

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function splitSerials(value: unknown): string[] {
    return Array.from(new Set(
        normalizeText(value)
            .split(/[\n,;]+/)
            .map((serial) => serial.trim())
            .filter(Boolean)
    ));
}

function isSerialTracked(detail: any): boolean {
    const value =
        detail?.track_serial_number ??
        detail?.is_serial_number_tracking_enabled ??
        detail?.is_serial_number_enabled ??
        detail?.is_serial_number;
    return value === true || value === 1 || String(value || '').toLowerCase() === 'true';
}

export async function resolveSerialTrackedItemIds(params: {
    supabase: any;
    items: any[];
}): Promise<Set<string>> {
    const itemIds = Array.from(new Set(
        (params.items || []).map((line) => normalizeText(line?.item_id)).filter(Boolean)
    ));
    const result = new Set<string>();
    if (!itemIds.length) return result;

    const lookup = await params.supabase
        .from('items')
        .select('id, zoho_item_id')
        .in('id', itemIds);
    if (lookup.error) return result;

    const zoho = createZohoBooksClient();
    if (!zoho) return result;

    await Promise.all((lookup.data || []).map(async (item: any) => {
        const zohoItemId = normalizeText(item?.zoho_item_id);
        if (!zohoItemId) return;
        try {
            const detail = await zoho.getItemDetails(zohoItemId);
            if (isSerialTracked(detail)) result.add(normalizeText(item.id));
        } catch (error: any) {
            console.warn(`[picking-serials] No se pudo determinar serialización de ${item.id}: ${error?.message || 'error'}`);
        }
    }));

    return result;
}

export async function syncSelectedScansToPickItems(params: {
    supabase: any;
    pickOrderId: string;
}): Promise<void> {
    const scans = await params.supabase
        .from('warehouse_pick_serial_scans')
        .select('pick_order_item_id, serial_code, scanned_at')
        .eq('pick_order_id', params.pickOrderId)
        .order('scanned_at', { ascending: true });
    if (scans.error) throw scans.error;

    const grouped = new Map<string, string[]>();
    for (const row of scans.data || []) {
        const itemId = normalizeText(row?.pick_order_item_id);
        const serial = normalizeText(row?.serial_code);
        if (!itemId || !serial) continue;
        const bucket = grouped.get(itemId) || [];
        bucket.push(serial);
        grouped.set(itemId, bucket);
    }

    const items = await params.supabase
        .from('warehouse_pick_order_items')
        .select('id')
        .eq('pick_order_id', params.pickOrderId);
    if (items.error) throw items.error;

    await Promise.all((items.data || []).map((item: any) =>
        params.supabase
            .from('warehouse_pick_order_items')
            .update({ serial_numbers_selected: (grouped.get(normalizeText(item.id)) || []).join(',') || null })
            .eq('id', item.id)
    ));
}

export async function markPickReadyWithScans(params: {
    supabase: any;
    pickOrderId: string;
    actorUserId: string;
    expectedRowVersion?: number | null;
}) {
    const pick = await params.supabase
        .from('warehouse_pick_orders')
        .select('id, sales_order_id')
        .eq('id', params.pickOrderId)
        .maybeSingle();
    if (pick.error) throw pick.error;
    if (!pick.data) {
        throw new PickTransitionError({
            message: 'Orden de alistamiento no encontrada.',
            status: 404,
            code: 'PICK_ORDER_NOT_FOUND',
        });
    }

    const items = await params.supabase
        .from('warehouse_pick_order_items')
        .select('id, sales_order_item_id, item_id, quantity, serials_required')
        .eq('pick_order_id', params.pickOrderId)
        .order('sort_order', { ascending: true });
    if (items.error) throw items.error;

    const scans = await params.supabase
        .from('warehouse_pick_serial_scans')
        .select('pick_order_item_id, serial_code')
        .eq('pick_order_id', params.pickOrderId);
    if (scans.error) throw scans.error;

    const byPickItem = new Map<string, string[]>();
    for (const scan of scans.data || []) {
        const key = normalizeText(scan?.pick_order_item_id);
        const serial = normalizeText(scan?.serial_code);
        if (!key || !serial) continue;
        const bucket = byPickItem.get(key) || [];
        bucket.push(serial);
        byPickItem.set(key, bucket);
    }

    const incomplete = (items.data || []).find((item: any) => {
        if (!item?.serials_required) return false;
        return (byPickItem.get(normalizeText(item.id)) || []).length !== Math.round(Number(item.quantity || 0));
    });
    if (incomplete) {
        const selected = (byPickItem.get(normalizeText(incomplete.id)) || []).length;
        throw new PickTransitionError({
            message: `Faltan seriales por escanear. Requeridos: ${Math.round(Number(incomplete.quantity || 0))}, seleccionados: ${selected}.`,
            status: 409,
            code: 'PICK_SERIALS_INCOMPLETE',
        });
    }

    const orderItems = await params.supabase
        .from('sales_order_items')
        .select('*')
        .eq('order_id', pick.data.sales_order_id)
        .order('sort_order', { ascending: true });
    if (orderItems.error) throw orderItems.error;

    const serialsBySalesOrderItem = new Map<string, string>();
    for (const pickItem of items.data || []) {
        const salesOrderItemId = normalizeText(pickItem?.sales_order_item_id);
        if (!salesOrderItemId || !pickItem?.serials_required) continue;
        serialsBySalesOrderItem.set(
            salesOrderItemId,
            (byPickItem.get(normalizeText(pickItem.id)) || []).join(',')
        );
    }
    const reservationItems = (orderItems.data || []).map((item: any) => ({
        ...item,
        serial_number_value: serialsBySalesOrderItem.has(normalizeText(item.id))
            ? serialsBySalesOrderItem.get(normalizeText(item.id))
            : item.serial_number_value,
    }));

    try {
        await replaceOrderSerialReservations({
            supabase: params.supabase,
            orderId: pick.data.sales_order_id,
            userId: params.actorUserId,
            items: reservationItems,
        });
    } catch (error) {
        if (error instanceof SerialReservationError) throw error;
        throw error;
    }

    for (const [salesOrderItemId, serialNumberValue] of serialsBySalesOrderItem.entries()) {
        const update = await params.supabase
            .from('sales_order_items')
            .update({ serial_number_value: serialNumberValue || null })
            .eq('id', salesOrderItemId);
        if (update.error) throw update.error;
    }

    await syncSelectedScansToPickItems({
        supabase: params.supabase,
        pickOrderId: params.pickOrderId,
    });

    return transitionPickOrderStatus({
        supabase: params.supabase,
        pickOrderId: params.pickOrderId,
        action: 'ready',
        actorUserId: params.actorUserId,
        expectedRowVersion: params.expectedRowVersion,
    });
}

export function serialList(value: unknown): string[] {
    return splitSerials(value);
}
