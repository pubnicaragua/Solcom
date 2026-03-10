import { isSalesPickingFlowEnabled } from '@/lib/ventas/feature-flags';

export type WarehousePickPriority = 'urgent' | 'normal';
export type WarehousePickStatus =
    | 'queued'
    | 'claimed'
    | 'picking'
    | 'ready'
    | 'completed_floor'
    | 'completed_dispatch'
    | 'cancelled';

export type WarehousePickAction = 'claim' | 'start' | 'ready' | 'complete';

type PickOrderRow = {
    id: string;
    sales_order_id: string;
    sales_order_number?: string | null;
    warehouse_id?: string | null;
    customer_id?: string | null;
    salesperson_id?: string | null;
    salesperson_name?: string | null;
    delivery_requested?: boolean;
    delivery_method?: string | null;
    priority?: WarehousePickPriority;
    status?: WarehousePickStatus;
    total?: number;
    assigned_user_id?: string | null;
    queued_at?: string | null;
    claimed_at?: string | null;
    started_at?: string | null;
    ready_at?: string | null;
    completed_at?: string | null;
    cancelled_at?: string | null;
    row_version?: number | null;
    created_at?: string | null;
    updated_at?: string | null;
};

type PickOrderItemSnapshot = {
    id: string;
    item_id: string | null;
    description: string;
    quantity: number;
    serials_required: boolean;
    serial_numbers_requested: string | null;
    serial_numbers_selected: string | null;
    sort_order: number;
};

const ACTIVE_PICK_STATUSES = new Set<WarehousePickStatus>(['queued', 'claimed', 'picking', 'ready']);
const COMPLETED_PICK_STATUSES = new Set<WarehousePickStatus>(['completed_floor', 'completed_dispatch']);

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeInteger(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return null;
    return parsed;
}

function extractMissingColumn(message: string): string | null {
    const text = String(message || '');
    let match = text.match(/Could not find the '([^']+)' column/i);
    if (match?.[1]) return match[1];
    match = text.match(/column "?([a-zA-Z0-9_]+)"? does not exist/i);
    if (match?.[1]) return match[1];
    return null;
}

function isMissingRelation(message: string, relation: string): boolean {
    const text = String(message || '').toLowerCase();
    const rel = String(relation || '').toLowerCase();
    if (!rel) return false;
    return (
        text.includes(rel) &&
        (
            text.includes('does not exist') ||
            text.includes('could not find the table') ||
            text.includes('relation') ||
            text.includes('schema cache')
        )
    );
}

export function isMissingPickingInfraError(error: unknown): boolean {
    const message = String((error as any)?.message || error || '');
    return (
        isMissingRelation(message, 'warehouse_pick_orders') ||
        isMissingRelation(message, 'warehouse_pick_order_items') ||
        isMissingRelation(message, 'warehouse_pick_events')
    );
}

function sortQueueRows(rows: PickOrderRow[]): PickOrderRow[] {
    return [...rows].sort((a, b) => {
        const prA = a.priority === 'urgent' ? 0 : 1;
        const prB = b.priority === 'urgent' ? 0 : 1;
        if (prA !== prB) return prA - prB;
        const qA = normalizeText(a.queued_at) || normalizeText(a.created_at) || '';
        const qB = normalizeText(b.queued_at) || normalizeText(b.created_at) || '';
        if (qA !== qB) return qA < qB ? -1 : 1;
        const idA = normalizeText(a.id);
        const idB = normalizeText(b.id);
        if (!idA || !idB) return 0;
        return idA < idB ? -1 : 1;
    });
}

function toPickStatus(value: unknown, fallback: WarehousePickStatus = 'queued'): WarehousePickStatus {
    const text = normalizeText(value).toLowerCase();
    if (
        text === 'queued' ||
        text === 'claimed' ||
        text === 'picking' ||
        text === 'ready' ||
        text === 'completed_floor' ||
        text === 'completed_dispatch' ||
        text === 'cancelled'
    ) {
        return text;
    }
    return fallback;
}

function toPickPriority(value: unknown): WarehousePickPriority {
    return normalizeText(value).toLowerCase() === 'urgent' ? 'urgent' : 'normal';
}

function inferDeliveryRequested(order: {
    delivery_requested?: unknown;
    delivery_method?: unknown;
}): boolean {
    if (typeof order.delivery_requested === 'boolean') {
        return order.delivery_requested;
    }
    const method = normalizeText(order.delivery_method).toLowerCase();
    if (!method) return false;
    if (method.includes('envio') || method.includes('delivery') || method.includes('reparto') || method.includes('domicilio')) {
        return true;
    }
    return false;
}

export function derivePickPriority(deliveryRequested: boolean): WarehousePickPriority {
    return deliveryRequested ? 'normal' : 'urgent';
}

function hasSerialRequirement(serialNumberValue: unknown): boolean {
    return normalizeText(serialNumberValue).length > 0;
}

async function upsertPickOrderWithFallback(supabase: any, payload: Record<string, any>): Promise<{ data: PickOrderRow | null; error: any }> {
    const mutable = { ...payload };
    let retry = 0;
    while (retry < 12) {
        const result = await supabase
            .from('warehouse_pick_orders')
            .upsert(mutable, { onConflict: 'sales_order_id' })
            .select('*')
            .maybeSingle();
        if (!result.error || result.data) {
            return { data: (result.data || null) as PickOrderRow | null, error: null };
        }

        const missingColumn = extractMissingColumn(result.error?.message || '');
        if (missingColumn && Object.prototype.hasOwnProperty.call(mutable, missingColumn)) {
            delete mutable[missingColumn];
            retry += 1;
            continue;
        }
        return { data: null, error: result.error };
    }

    return { data: null, error: new Error('No se pudo guardar warehouse_pick_orders por columnas faltantes.') };
}

async function updatePickOrderWithFallback(
    supabase: any,
    id: string,
    patch: Record<string, any>,
    options?: {
        expectedStatus?: WarehousePickStatus | null;
        expectedAssignedNull?: boolean;
        expectedRowVersion?: number | null;
    }
): Promise<{ data: PickOrderRow | null; error: any }> {
    const mutable = { ...patch };
    let retry = 0;
    while (retry < 12) {
        let query = supabase
            .from('warehouse_pick_orders')
            .update(mutable)
            .eq('id', id);

        if (options?.expectedStatus) {
            query = query.eq('status', options.expectedStatus);
        }
        if (options?.expectedAssignedNull === true) {
            query = query.is('assigned_user_id', null);
        }
        if (typeof options?.expectedRowVersion === 'number') {
            query = query.eq('row_version', options.expectedRowVersion);
        }

        const result = await query.select('*').maybeSingle();
        if (!result.error || result.data) {
            return { data: (result.data || null) as PickOrderRow | null, error: null };
        }
        const missingColumn = extractMissingColumn(result.error?.message || '');
        if (missingColumn && Object.prototype.hasOwnProperty.call(mutable, missingColumn)) {
            delete mutable[missingColumn];
            retry += 1;
            continue;
        }
        return { data: null, error: result.error };
    }
    return { data: null, error: new Error('No se pudo actualizar warehouse_pick_orders por columnas faltantes.') };
}

async function insertPickItemsWithFallback(supabase: any, rows: Array<Record<string, any>>): Promise<{ error: any }> {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { error: null };
    }
    const mutableRows = rows.map((row) => ({ ...row }));
    let retry = 0;
    while (retry < 12) {
        const result = await supabase
            .from('warehouse_pick_order_items')
            .insert(mutableRows);

        if (!result.error) return { error: null };
        const missingColumn = extractMissingColumn(result.error?.message || '');
        if (!missingColumn) return { error: result.error };

        let removed = false;
        for (const row of mutableRows) {
            if (Object.prototype.hasOwnProperty.call(row, missingColumn)) {
                delete row[missingColumn];
                removed = true;
            }
        }
        if (!removed) return { error: result.error };
        retry += 1;
    }
    return { error: new Error('No se pudo insertar warehouse_pick_order_items por columnas faltantes.') };
}

async function insertPickEvent(params: {
    supabase: any;
    pickOrderId: string;
    salesOrderId: string | null;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actorUserId?: string | null;
    eventData?: Record<string, any> | null;
}): Promise<void> {
    const {
        supabase,
        pickOrderId,
        salesOrderId,
        eventType,
        fromStatus = null,
        toStatus = null,
        actorUserId = null,
        eventData = null,
    } = params;

    const result = await supabase
        .from('warehouse_pick_events')
        .insert({
            pick_order_id: pickOrderId,
            sales_order_id: salesOrderId || null,
            event_type: eventType,
            from_status: fromStatus,
            to_status: toStatus,
            actor_user_id: actorUserId || null,
            event_data: eventData || {},
        });

    if (result.error && !isMissingPickingInfraError(result.error)) {
        console.warn('[picking] No se pudo insertar evento:', result.error.message);
    }
}

async function replacePickOrderItemsSnapshot(params: {
    supabase: any;
    pickOrderId: string;
    items: any[];
}): Promise<{ error: any }> {
    const { supabase, pickOrderId, items } = params;

    const deleteResult = await supabase
        .from('warehouse_pick_order_items')
        .delete()
        .eq('pick_order_id', pickOrderId);

    if (deleteResult.error) {
        return { error: deleteResult.error };
    }

    const snapshots = (Array.isArray(items) ? items : []).map((line: any, index: number) => ({
        pick_order_id: pickOrderId,
        sales_order_item_id: normalizeText(line?.id) || null,
        item_id: normalizeText(line?.item_id) || null,
        description: normalizeText(line?.description) || 'Artículo',
        quantity: Math.max(0, normalizeNumber(line?.quantity, 0)),
        serials_required: hasSerialRequirement(line?.serial_number_value),
        serial_numbers_requested: normalizeText(line?.serial_number_value) || null,
        serial_numbers_selected: null,
        sort_order: index,
    }));

    return insertPickItemsWithFallback(supabase, snapshots);
}

export async function upsertPickOrderFromSalesOrder(params: {
    supabase: any;
    salesOrderId: string;
    actorUserId?: string | null;
    reason?: string | null;
}): Promise<{ skipped: boolean; pickOrder: PickOrderRow | null; error: any }> {
    const { supabase, salesOrderId, actorUserId = null, reason = null } = params;
    if (!isSalesPickingFlowEnabled()) {
        return { skipped: true, pickOrder: null, error: null };
    }

    const orderLookup = await supabase
        .from('sales_orders')
        .select('id, order_number, status, warehouse_id, customer_id, salesperson_id, salesperson_name, delivery_requested, delivery_method, total')
        .eq('id', salesOrderId)
        .maybeSingle();

    if (orderLookup.error) {
        if (isMissingPickingInfraError(orderLookup.error)) {
            return { skipped: true, pickOrder: null, error: orderLookup.error };
        }
        return { skipped: false, pickOrder: null, error: orderLookup.error };
    }

    const order = orderLookup.data;
    if (!order) {
        return { skipped: true, pickOrder: null, error: null };
    }

    const orderStatus = normalizeText(order.status).toLowerCase();
    if (orderStatus !== 'confirmada') {
        return { skipped: true, pickOrder: null, error: null };
    }

    const itemsLookup = await supabase
        .from('sales_order_items')
        .select('id, item_id, description, quantity, serial_number_value, sort_order')
        .eq('order_id', salesOrderId)
        .order('sort_order', { ascending: true });

    if (itemsLookup.error) {
        return { skipped: false, pickOrder: null, error: itemsLookup.error };
    }

    const existingLookup = await supabase
        .from('warehouse_pick_orders')
        .select('*')
        .eq('sales_order_id', salesOrderId)
        .maybeSingle();

    if (existingLookup.error && !isMissingPickingInfraError(existingLookup.error)) {
        return { skipped: false, pickOrder: null, error: existingLookup.error };
    }

    const existing = (existingLookup.data || null) as PickOrderRow | null;
    const now = new Date().toISOString();
    const deliveryRequested = inferDeliveryRequested(order || {});
    const priority = derivePickPriority(deliveryRequested);
    const existingStatus = existing ? toPickStatus(existing.status, 'queued') : null;
    const requeued = existingStatus === 'cancelled';

    const nextStatus: WarehousePickStatus = requeued
        ? 'queued'
        : (existingStatus || 'queued');

    const payload: Record<string, any> = {
        sales_order_id: salesOrderId,
        sales_order_number: normalizeText(order.order_number) || null,
        warehouse_id: normalizeText(order.warehouse_id) || null,
        customer_id: normalizeText(order.customer_id) || null,
        salesperson_id: normalizeText(order.salesperson_id) || null,
        salesperson_name: normalizeText(order.salesperson_name) || null,
        delivery_requested: deliveryRequested,
        delivery_method: normalizeText(order.delivery_method) || null,
        priority,
        status: nextStatus,
        total: Math.max(0, normalizeNumber(order.total, 0)),
        assigned_user_id: requeued
            ? null
            : (normalizeText(existing?.assigned_user_id) || null),
        queued_at: requeued
            ? now
            : (normalizeText(existing?.queued_at) || now),
        claimed_at: requeued ? null : (normalizeText(existing?.claimed_at) || null),
        started_at: requeued ? null : (normalizeText(existing?.started_at) || null),
        ready_at: requeued ? null : (normalizeText(existing?.ready_at) || null),
        completed_at: requeued ? null : (normalizeText(existing?.completed_at) || null),
        cancelled_at: null,
        last_synced_from_order_at: now,
        updated_at: now,
    };

    const upsertResult = await upsertPickOrderWithFallback(supabase, payload);
    if (upsertResult.error || !upsertResult.data) {
        return { skipped: false, pickOrder: null, error: upsertResult.error || new Error('No se pudo guardar orden de alistamiento.') };
    }

    const pickOrder = upsertResult.data;
    const itemsError = await replacePickOrderItemsSnapshot({
        supabase,
        pickOrderId: pickOrder.id,
        items: itemsLookup.data || [],
    });
    if (itemsError.error) {
        return { skipped: false, pickOrder, error: itemsError.error };
    }

    const eventType = !existing
        ? 'pick_order_created'
        : requeued
            ? 'pick_order_requeued'
            : 'pick_order_synced';

    await insertPickEvent({
        supabase,
        pickOrderId: pickOrder.id,
        salesOrderId,
        eventType,
        fromStatus: existingStatus,
        toStatus: toPickStatus(pickOrder.status, 'queued'),
        actorUserId,
        eventData: {
            reason: normalizeText(reason) || null,
            sales_order_number: normalizeText(order.order_number) || null,
        },
    });

    return { skipped: false, pickOrder, error: null };
}

export async function cancelPickOrderForSalesOrder(params: {
    supabase: any;
    salesOrderId: string;
    actorUserId?: string | null;
    reason?: string | null;
}): Promise<{ skipped: boolean; pickOrder: PickOrderRow | null; error: any }> {
    const { supabase, salesOrderId, actorUserId = null, reason = null } = params;
    if (!isSalesPickingFlowEnabled()) {
        return { skipped: true, pickOrder: null, error: null };
    }

    const pickLookup = await supabase
        .from('warehouse_pick_orders')
        .select('*')
        .eq('sales_order_id', salesOrderId)
        .maybeSingle();

    if (pickLookup.error) {
        if (isMissingPickingInfraError(pickLookup.error)) {
            return { skipped: true, pickOrder: null, error: pickLookup.error };
        }
        return { skipped: false, pickOrder: null, error: pickLookup.error };
    }

    const pickOrder = (pickLookup.data || null) as PickOrderRow | null;
    if (!pickOrder) {
        return { skipped: true, pickOrder: null, error: null };
    }

    const currentStatus = toPickStatus(pickOrder.status, 'queued');
    if (currentStatus === 'cancelled' || COMPLETED_PICK_STATUSES.has(currentStatus)) {
        return { skipped: true, pickOrder, error: null };
    }

    const now = new Date().toISOString();
    const updateResult = await updatePickOrderWithFallback(
        supabase,
        pickOrder.id,
        {
            status: 'cancelled',
            assigned_user_id: null,
            cancelled_at: now,
            updated_at: now,
        },
        {
            expectedStatus: currentStatus,
            expectedRowVersion: normalizeInteger(pickOrder.row_version),
        }
    );

    if (updateResult.error || !updateResult.data) {
        return { skipped: false, pickOrder: null, error: updateResult.error || new Error('No se pudo cancelar alistamiento.') };
    }

    await insertPickEvent({
        supabase,
        pickOrderId: pickOrder.id,
        salesOrderId,
        eventType: 'pick_order_cancelled',
        fromStatus: currentStatus,
        toStatus: 'cancelled',
        actorUserId,
        eventData: {
            reason: normalizeText(reason) || null,
        },
    });

    return { skipped: false, pickOrder: updateResult.data, error: null };
}

export function computePickQueuePositionMap(rows: PickOrderRow[]): Map<string, number> {
    const byWarehouse = new Map<string, PickOrderRow[]>();
    for (const row of rows) {
        const status = toPickStatus(row.status, 'queued');
        if (status !== 'queued') continue;
        const warehouseId = normalizeText(row.warehouse_id) || '__none__';
        const bucket = byWarehouse.get(warehouseId) || [];
        bucket.push({
            ...row,
            status,
            priority: toPickPriority(row.priority),
        });
        byWarehouse.set(warehouseId, bucket);
    }

    const positionMap = new Map<string, number>();
    for (const [, bucket] of byWarehouse) {
        const sorted = sortQueueRows(bucket);
        sorted.forEach((row, index) => {
            const id = normalizeText(row.id);
            if (id) {
                positionMap.set(id, index + 1);
            }
        });
    }
    return positionMap;
}

export async function enrichSalesOrdersWithPickInfo(params: {
    supabase: any;
    orders: any[];
}): Promise<any[]> {
    const { supabase } = params;
    const orders = Array.isArray(params.orders) ? params.orders : [];
    if (!orders.length) return orders;

    const orderIds = Array.from(new Set(
        orders
            .map((row) => normalizeText(row?.id))
            .filter(Boolean)
    ));
    if (!orderIds.length || !isSalesPickingFlowEnabled()) {
        return orders.map((row) => ({
            ...row,
            pick_status: null,
            pick_queue_position: null,
            pick_assigned_to: null,
        }));
    }

    const pickLookup = await supabase
        .from('warehouse_pick_orders')
        .select('id, sales_order_id, warehouse_id, status, priority, assigned_user_id, queued_at, claimed_at, started_at, ready_at, completed_at, cancelled_at, row_version')
        .in('sales_order_id', orderIds);

    if (pickLookup.error) {
        if (!isMissingPickingInfraError(pickLookup.error)) {
            console.warn('[picking] No se pudo enriquecer OV con pick info:', pickLookup.error.message);
        }
        return orders.map((row) => ({
            ...row,
            pick_status: null,
            pick_queue_position: null,
            pick_assigned_to: null,
        }));
    }

    const picks = (pickLookup.data || []) as PickOrderRow[];
    const pickByOrderId = new Map<string, PickOrderRow>();
    for (const row of picks) {
        const key = normalizeText(row.sales_order_id);
        if (!key) continue;
        pickByOrderId.set(key, row);
    }
    const queuePositionMap = computePickQueuePositionMap(picks);

    const assignedIds = Array.from(new Set(
        picks
            .map((row) => normalizeText(row.assigned_user_id))
            .filter(Boolean)
    ));
    let assignedById = new Map<string, { id: string; full_name: string | null; email: string | null }>();
    if (assignedIds.length > 0) {
        const userLookup = await supabase
            .from('user_profiles')
            .select('id, full_name, email')
            .in('id', assignedIds);
        if (!userLookup.error) {
            assignedById = new Map(
                (userLookup.data || []).map((row: any) => [
                    normalizeText(row?.id),
                    {
                        id: normalizeText(row?.id),
                        full_name: normalizeText(row?.full_name) || null,
                        email: normalizeText(row?.email) || null,
                    },
                ])
            );
        }
    }

    return orders.map((row) => {
        const orderId = normalizeText(row?.id);
        const pick = pickByOrderId.get(orderId);
        if (!pick) {
            return {
                ...row,
                pick_status: null,
                pick_queue_position: null,
                pick_assigned_to: null,
            };
        }
        const pickId = normalizeText(pick.id);
        const assignedId = normalizeText(pick.assigned_user_id);
        const assigned = assignedId ? assignedById.get(assignedId) || { id: assignedId, full_name: null, email: null } : null;
        return {
            ...row,
            pick_status: toPickStatus(pick.status, 'queued'),
            pick_queue_position: pickId ? (queuePositionMap.get(pickId) || null) : null,
            pick_assigned_to: assigned,
            pick_row_version: normalizeInteger(pick.row_version),
        };
    });
}

export class PickTransitionError extends Error {
    status: number;
    code: string;
    details: Record<string, any> | null;

    constructor(params: { message: string; status: number; code: string; details?: Record<string, any> | null }) {
        super(params.message);
        this.name = 'PickTransitionError';
        this.status = params.status;
        this.code = params.code;
        this.details = params.details || null;
    }
}

function assertAssignedToActor(params: {
    pickOrder: PickOrderRow;
    actorUserId: string;
}) {
    const assignedUserId = normalizeText(params.pickOrder.assigned_user_id);
    if (!assignedUserId) {
        throw new PickTransitionError({
            message: 'La orden no tiene asignado responsable de bodega.',
            status: 409,
            code: 'PICK_NOT_ASSIGNED',
        });
    }
    if (assignedUserId !== params.actorUserId) {
        throw new PickTransitionError({
            message: 'La orden está asignada a otro usuario de bodega.',
            status: 409,
            code: 'PICK_ASSIGNED_TO_OTHER',
            details: {
                assigned_user_id: assignedUserId,
            },
        });
    }
}

export async function transitionPickOrderStatus(params: {
    supabase: any;
    pickOrderId: string;
    action: WarehousePickAction;
    actorUserId: string;
    expectedRowVersion?: number | null;
}): Promise<PickOrderRow> {
    const {
        supabase,
        pickOrderId,
        action,
        actorUserId,
        expectedRowVersion = null,
    } = params;

    if (!isSalesPickingFlowEnabled()) {
        throw new PickTransitionError({
            message: 'El flujo de alistamiento está deshabilitado.',
            status: 404,
            code: 'PICKING_DISABLED',
        });
    }

    const lookup = await supabase
        .from('warehouse_pick_orders')
        .select('*')
        .eq('id', pickOrderId)
        .maybeSingle();

    if (lookup.error) {
        if (isMissingPickingInfraError(lookup.error)) {
            throw new PickTransitionError({
                message: 'Falta migración de alistamiento. Ejecuta warehouse-picking-v1.sql.',
                status: 500,
                code: 'PICKING_MIGRATION_REQUIRED',
            });
        }
        throw new PickTransitionError({
            message: lookup.error.message || 'No se pudo leer la orden de alistamiento.',
            status: 500,
            code: 'PICKING_LOOKUP_FAILED',
        });
    }

    const current = (lookup.data || null) as PickOrderRow | null;
    if (!current) {
        throw new PickTransitionError({
            message: 'Orden de alistamiento no encontrada.',
            status: 404,
            code: 'PICK_ORDER_NOT_FOUND',
        });
    }

    const currentStatus = toPickStatus(current.status, 'queued');
    const currentVersion = normalizeInteger(current.row_version);
    if (
        typeof expectedRowVersion === 'number' &&
        currentVersion !== null &&
        expectedRowVersion !== currentVersion
    ) {
        throw new PickTransitionError({
            message: 'El documento fue modificado por otro usuario. Recarga antes de guardar.',
            status: 409,
            code: 'VERSION_CONFLICT',
            details: {
                expected_row_version: expectedRowVersion,
                current_row_version: currentVersion,
                resource_id: pickOrderId,
            },
        });
    }

    const now = new Date().toISOString();
    let toStatus: WarehousePickStatus = currentStatus;
    const patch: Record<string, any> = {
        updated_at: now,
    };

    if (action === 'claim') {
        if (currentStatus !== 'queued') {
            throw new PickTransitionError({
                message: 'Solo se pueden tomar órdenes en cola.',
                status: 409,
                code: 'PICK_INVALID_STATE',
                details: { status: currentStatus },
            });
        }
        if (normalizeText(current.assigned_user_id)) {
            throw new PickTransitionError({
                message: 'La orden ya fue tomada por otro usuario.',
                status: 409,
                code: 'PICK_ALREADY_CLAIMED',
            });
        }
        toStatus = 'claimed';
        patch.status = toStatus;
        patch.assigned_user_id = actorUserId;
        patch.claimed_at = now;
    } else if (action === 'start') {
        if (currentStatus !== 'claimed') {
            throw new PickTransitionError({
                message: 'Solo se puede iniciar una orden tomada.',
                status: 409,
                code: 'PICK_INVALID_STATE',
                details: { status: currentStatus },
            });
        }
        assertAssignedToActor({ pickOrder: current, actorUserId });
        toStatus = 'picking';
        patch.status = toStatus;
        patch.started_at = normalizeText(current.started_at) || now;
    } else if (action === 'ready') {
        if (currentStatus !== 'picking') {
            throw new PickTransitionError({
                message: 'Solo se puede marcar lista una orden en alistamiento.',
                status: 409,
                code: 'PICK_INVALID_STATE',
                details: { status: currentStatus },
            });
        }
        assertAssignedToActor({ pickOrder: current, actorUserId });
        toStatus = 'ready';
        patch.status = toStatus;
        patch.ready_at = now;
    } else if (action === 'complete') {
        if (currentStatus !== 'ready') {
            throw new PickTransitionError({
                message: 'Solo se puede completar una orden lista.',
                status: 409,
                code: 'PICK_INVALID_STATE',
                details: { status: currentStatus },
            });
        }
        assertAssignedToActor({ pickOrder: current, actorUserId });
        toStatus = current.delivery_requested ? 'completed_dispatch' : 'completed_floor';
        patch.status = toStatus;
        patch.completed_at = now;
    }

    const updateResult = await updatePickOrderWithFallback(
        supabase,
        pickOrderId,
        patch,
        {
            expectedStatus: currentStatus,
            expectedAssignedNull: action === 'claim',
            expectedRowVersion: currentVersion,
        }
    );

    if (updateResult.error) {
        throw new PickTransitionError({
            message: updateResult.error.message || 'No se pudo actualizar la orden de alistamiento.',
            status: 500,
            code: 'PICK_UPDATE_FAILED',
        });
    }

    if (!updateResult.data) {
        throw new PickTransitionError({
            message: 'La orden fue modificada por otro usuario. Recarga e intenta nuevamente.',
            status: 409,
            code: 'VERSION_CONFLICT',
            details: {
                expected_row_version: currentVersion,
                resource_id: pickOrderId,
            },
        });
    }

    await insertPickEvent({
        supabase,
        pickOrderId,
        salesOrderId: normalizeText(current.sales_order_id) || null,
        eventType: `pick_order_${action}`,
        fromStatus: currentStatus,
        toStatus,
        actorUserId,
        eventData: {
            action,
        },
    });

    return updateResult.data;
}

export function isActivePickStatus(status: unknown): boolean {
    return ACTIVE_PICK_STATUSES.has(toPickStatus(status, 'queued'));
}

export function mapPickStatusLabel(status: unknown): string {
    const normalized = toPickStatus(status, 'queued');
    if (normalized === 'queued') return 'En cola';
    if (normalized === 'claimed') return 'Tomada';
    if (normalized === 'picking') return 'En proceso';
    if (normalized === 'ready') return 'Lista';
    if (normalized === 'completed_floor') return 'Completada piso';
    if (normalized === 'completed_dispatch') return 'Completada despacho';
    return 'Cancelada';
}

export async function getPickOrderById(params: {
    supabase: any;
    pickOrderId: string;
}): Promise<{ data: PickOrderRow | null; error: any }> {
    const result = await params.supabase
        .from('warehouse_pick_orders')
        .select('*')
        .eq('id', params.pickOrderId)
        .maybeSingle();

    if (result.error) return { data: null, error: result.error };
    return { data: (result.data || null) as PickOrderRow | null, error: null };
}

export async function getPickOrderItems(params: {
    supabase: any;
    pickOrderIds: string[];
}): Promise<{ data: Map<string, PickOrderItemSnapshot[]>; error: any }> {
    const ids = Array.from(new Set((params.pickOrderIds || []).map((id) => normalizeText(id)).filter(Boolean)));
    if (!ids.length) return { data: new Map(), error: null };

    const result = await params.supabase
        .from('warehouse_pick_order_items')
        .select('id, pick_order_id, item_id, description, quantity, serials_required, serial_numbers_requested, serial_numbers_selected, sort_order')
        .in('pick_order_id', ids)
        .order('sort_order', { ascending: true });

    if (result.error) return { data: new Map(), error: result.error };
    const grouped = new Map<string, PickOrderItemSnapshot[]>();
    for (const row of (result.data || [])) {
        const key = normalizeText((row as any)?.pick_order_id);
        if (!key) continue;
        const bucket = grouped.get(key) || [];
        bucket.push({
            id: normalizeText((row as any)?.id),
            item_id: normalizeText((row as any)?.item_id) || null,
            description: normalizeText((row as any)?.description) || 'Artículo',
            quantity: Math.max(0, normalizeNumber((row as any)?.quantity, 0)),
            serials_required: Boolean((row as any)?.serials_required),
            serial_numbers_requested: normalizeText((row as any)?.serial_numbers_requested) || null,
            serial_numbers_selected: normalizeText((row as any)?.serial_numbers_selected) || null,
            sort_order: Math.max(0, normalizeNumber((row as any)?.sort_order, 0)),
        });
        grouped.set(key, bucket);
    }
    return { data: grouped, error: null };
}
