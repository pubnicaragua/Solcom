export const SERIAL_RESERVATION_TTL_MINUTES = 120;

export type SerialReservationErrorCode =
    | 'SERIAL_ALREADY_RESERVED'
    | 'SERIAL_NOT_RESERVED'
    | 'SERIAL_RESERVATION_EXPIRED';

export interface SerialReservationRow {
    id: string;
    sales_order_id: string;
    item_id: string;
    serial_code: string;
    line_warehouse_id: string | null;
    line_zoho_warehouse_id: string | null;
    status: 'reserved' | 'consumed' | 'released' | 'expired';
    expires_at: string | null;
}

export class SerialReservationError extends Error {
    code: SerialReservationErrorCode;
    status: number;
    details?: Record<string, any>;

    constructor(
        message: string,
        code: SerialReservationErrorCode,
        status = 409,
        details?: Record<string, any>
    ) {
        super(message);
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function normalizeSerialInput(value: unknown): string {
    if (Array.isArray(value)) {
        return value
            .map((entry) => normalizeText(entry))
            .filter(Boolean)
            .join(',');
    }
    return String(value ?? '')
        .replace(/[\n;]/g, ',')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join(',');
}

export function serialArray(value: unknown): string[] {
    return normalizeSerialInput(value)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function parseKeyValues(message: string): Record<string, string> {
    const details: Record<string, string> = {};
    const normalized = String(message || '').replace(/^.*?:/, '');
    for (const chunk of normalized.split(';')) {
        const [left, right] = chunk.split('=');
        if (!left || right == null) continue;
        details[left.trim()] = right.trim();
    }
    return details;
}

export function mapSerialReservationError(error: any): SerialReservationError {
    if (error instanceof SerialReservationError) return error;

    const raw = String(error?.message || 'Error de reserva de seriales');
    const message = raw.trim();
    const lower = message.toLowerCase();

    if (message.includes('SERIAL_ALREADY_RESERVED')) {
        const parsed = parseKeyValues(message);
        const serial = parsed.serial || '';
        const conflictOrderNumber = parsed.order_number || '';
        const conflictOrderId = parsed.order_id || '';
        const detailMessage = serial
            ? `El serial ${serial} ya está reservado${conflictOrderNumber ? ` por OV ${conflictOrderNumber}` : ''}.`
            : 'Uno o más seriales ya están reservados por otra orden.';
        return new SerialReservationError(
            detailMessage,
            'SERIAL_ALREADY_RESERVED',
            409,
            {
                serial,
                conflict_order_id: conflictOrderId || null,
                conflict_order_number: conflictOrderNumber || null,
            }
        );
    }

    if (message.includes('SERIAL_RESERVATION_EXPIRED') || lower.includes('reserva vencida')) {
        return new SerialReservationError(
            'Reserva vencida, vuelve a seleccionar seriales.',
            'SERIAL_RESERVATION_EXPIRED',
            409
        );
    }

    if (message.includes('SERIAL_NOT_RESERVED')) {
        return new SerialReservationError(
            'Los seriales seleccionados ya no están reservados para esta orden.',
            'SERIAL_NOT_RESERVED',
            409
        );
    }

    if (lower.includes('duplicate key') && lower.includes('idx_sales_order_serial_reservations_unique_active')) {
        return new SerialReservationError(
            'Uno o más seriales ya están reservados por otra orden.',
            'SERIAL_ALREADY_RESERVED',
            409
        );
    }

    return new SerialReservationError(
        message || 'Error de reserva de seriales.',
        'SERIAL_NOT_RESERVED',
        409
    );
}

export function buildReservationLines(items: any[]): Array<{
    item_id: string;
    serial_code: string;
    line_warehouse_id: string | null;
    line_zoho_warehouse_id: string | null;
}> {
    const lines = Array.isArray(items) ? items : [];
    const seen = new Set<string>();
    const result: Array<{
        item_id: string;
        serial_code: string;
        line_warehouse_id: string | null;
        line_zoho_warehouse_id: string | null;
    }> = [];

    for (const line of lines) {
        const itemId = normalizeText(line?.item_id);
        if (!itemId) continue;

        const lineWarehouseId = normalizeText(line?.line_warehouse_id) || null;
        const lineZohoWarehouseId = normalizeText(line?.line_zoho_warehouse_id) || null;
        const serials = serialArray(line?.serial_number_value ?? line?.serial_numbers ?? line?.serials);

        for (const serialCode of serials) {
            const key = `${itemId}::${serialCode}`;
            if (seen.has(key)) continue;
            seen.add(key);
            result.push({
                item_id: itemId,
                serial_code: serialCode,
                line_warehouse_id: lineWarehouseId,
                line_zoho_warehouse_id: lineZohoWarehouseId,
            });
        }
    }

    return result;
}

export async function expireSerialReservations(supabase: any): Promise<number> {
    const { data, error } = await supabase.rpc('fn_expire_serial_reservations');
    if (error) {
        console.warn('[serial-reservations] No se pudo ejecutar expiración:', error.message);
        return 0;
    }
    return Number(data || 0) || 0;
}

export async function replaceOrderSerialReservations(params: {
    supabase: any;
    orderId: string;
    userId: string | null;
    items: any[];
    ttlMinutes?: number;
}) {
    const reservationLines = buildReservationLines(params.items);
    const { data, error } = await params.supabase.rpc('fn_replace_order_serial_reservations', {
        p_order_id: params.orderId,
        p_user_id: params.userId || null,
        p_ttl_minutes: Math.max(1, Number(params.ttlMinutes || SERIAL_RESERVATION_TTL_MINUTES)),
        p_lines: reservationLines,
    });

    if (error) {
        throw mapSerialReservationError(error);
    }
    return data;
}

export async function releaseOrderSerialReservations(params: {
    supabase: any;
    orderId: string;
    reason?: string;
}) {
    const { data, error } = await params.supabase.rpc('fn_release_order_serial_reservations', {
        p_order_id: params.orderId,
        p_reason: params.reason || null,
    });
    if (error) {
        throw mapSerialReservationError(error);
    }
    return Number(data || 0) || 0;
}

export async function consumeOrderSerialReservations(params: {
    supabase: any;
    orderId: string;
    invoiceId?: string | null;
}) {
    const { data, error } = await params.supabase.rpc('fn_consume_order_serial_reservations', {
        p_order_id: params.orderId,
        p_invoice_id: params.invoiceId || null,
    });
    if (error) {
        throw mapSerialReservationError(error);
    }
    return Number(data || 0) || 0;
}

function buildReservationLookupKey(itemId: string, serialCode: string): string {
    return `${itemId}::${serialCode}`;
}

export async function getActiveOrderSerialReservations(params: {
    supabase: any;
    orderId: string;
}): Promise<SerialReservationRow[]> {
    await expireSerialReservations(params.supabase);

    const result = await params.supabase
        .from('sales_order_serial_reservations')
        .select('id, sales_order_id, item_id, serial_code, line_warehouse_id, line_zoho_warehouse_id, status, expires_at')
        .eq('sales_order_id', params.orderId)
        .eq('status', 'reserved')
        .order('reserved_at', { ascending: true });

    if (result.error) {
        throw new SerialReservationError(
            `No se pudieron leer reservas activas: ${result.error.message}`,
            'SERIAL_NOT_RESERVED',
            500
        );
    }

    return (result.data || []) as SerialReservationRow[];
}

export function applyReservedSerialsToItems(params: {
    items: any[];
    reservations: SerialReservationRow[];
}): any[] {
    const nextItems = (Array.isArray(params.items) ? params.items : []).map((item) => ({ ...item }));
    const byItem = new Map<string, string[]>();
    const byItemWarehouse = new Map<string, string[]>();

    for (const reservation of params.reservations || []) {
        const itemId = normalizeText(reservation?.item_id);
        const serial = normalizeText(reservation?.serial_code);
        if (!itemId || !serial) continue;

        if (!byItem.has(itemId)) {
            byItem.set(itemId, []);
        }
        byItem.get(itemId)!.push(serial);

        const key = `${itemId}::${normalizeText(reservation?.line_warehouse_id)}::${normalizeText(reservation?.line_zoho_warehouse_id)}`;
        if (!byItemWarehouse.has(key)) {
            byItemWarehouse.set(key, []);
        }
        byItemWarehouse.get(key)!.push(serial);
    }

    const consumeSerial = (pool: string[] | undefined, serial: string): boolean => {
        if (!pool || pool.length === 0) return false;
        const idx = pool.indexOf(serial);
        if (idx < 0) return false;
        pool.splice(idx, 1);
        return true;
    };

    for (const item of nextItems) {
        const itemId = normalizeText(item?.item_id);
        if (!itemId) continue;

        const quantity = Math.max(0, Math.round(Number(item?.quantity || 0)));
        if (quantity <= 0) {
            item.serial_number_value = '';
            continue;
        }

        const existing = serialArray(item?.serial_number_value ?? item?.serial_numbers ?? item?.serials);
        const uniqueExisting: string[] = [];
        for (const serial of existing) {
            if (uniqueExisting.includes(serial)) continue;
            uniqueExisting.push(serial);
        }

        const lineKey = `${itemId}::${normalizeText(item?.line_warehouse_id)}::${normalizeText(item?.line_zoho_warehouse_id)}`;
        const linePool = byItemWarehouse.get(lineKey);
        const fallbackPool = byItem.get(itemId);

        const selected: string[] = [];
        for (const serial of uniqueExisting) {
            const consumedFromLine = consumeSerial(linePool, serial);
            const consumedFromFallback = consumeSerial(fallbackPool, serial);
            if (consumedFromLine || consumedFromFallback) {
                selected.push(serial);
            }
            if (selected.length >= quantity) break;
        }

        while (selected.length < quantity) {
            let nextSerial = '';
            if (linePool && linePool.length > 0) {
                nextSerial = String(linePool.shift() || '').trim();
                if (nextSerial) {
                    consumeSerial(fallbackPool, nextSerial);
                }
            } else if (fallbackPool && fallbackPool.length > 0) {
                nextSerial = String(fallbackPool.shift() || '').trim();
            }
            if (!nextSerial) break;
            if (!selected.includes(nextSerial)) {
                selected.push(nextSerial);
            }
        }

        item.serial_number_value = selected.join(',');
        item.serial_numbers = selected;
    }

    return nextItems;
}

export async function assertSerialsReservedForOrder(params: {
    supabase: any;
    orderId: string;
    items: any[];
}) {
    await expireSerialReservations(params.supabase);

    const needed = buildReservationLines(params.items);
    if (needed.length === 0) return;

    const itemIds = Array.from(new Set(needed.map((line) => line.item_id)));
    const serialCodes = Array.from(new Set(needed.map((line) => line.serial_code)));

    const activeLookup = await params.supabase
        .from('sales_order_serial_reservations')
        .select('item_id, serial_code, sales_order_id, status, expires_at')
        .eq('status', 'reserved')
        .in('item_id', itemIds)
        .in('serial_code', serialCodes);

    if (activeLookup.error) {
        throw new SerialReservationError(
            `No se pudo validar reservas de seriales: ${activeLookup.error.message}`,
            'SERIAL_NOT_RESERVED',
            500
        );
    }

    const activeByPair = new Map<string, any>();
    for (const row of activeLookup.data || []) {
        const key = buildReservationLookupKey(String(row.item_id), String(row.serial_code));
        activeByPair.set(key, row);
    }

    const expiredLookup = await params.supabase
        .from('sales_order_serial_reservations')
        .select('item_id, serial_code, sales_order_id, status')
        .eq('status', 'expired')
        .eq('sales_order_id', params.orderId)
        .in('item_id', itemIds)
        .in('serial_code', serialCodes);

    const expiredByPair = new Set<string>();
    if (!expiredLookup.error) {
        for (const row of expiredLookup.data || []) {
            expiredByPair.add(buildReservationLookupKey(String(row.item_id), String(row.serial_code)));
        }
    }

    for (const line of needed) {
        const key = buildReservationLookupKey(line.item_id, line.serial_code);
        const active = activeByPair.get(key);
        if (!active) {
            if (expiredByPair.has(key)) {
                throw new SerialReservationError(
                    `Reserva vencida, vuelve a seleccionar seriales. Serial: ${line.serial_code}.`,
                    'SERIAL_RESERVATION_EXPIRED',
                    409,
                    { serial: line.serial_code, item_id: line.item_id }
                );
            }
            throw new SerialReservationError(
                `El serial ${line.serial_code} ya no está reservado para esta orden.`,
                'SERIAL_NOT_RESERVED',
                409,
                { serial: line.serial_code, item_id: line.item_id }
            );
        }
        if (String(active.sales_order_id) !== params.orderId) {
            throw new SerialReservationError(
                `El serial ${line.serial_code} ya fue reservado por otra orden.`,
                'SERIAL_NOT_RESERVED',
                409,
                { serial: line.serial_code, item_id: line.item_id }
            );
        }
    }
}
