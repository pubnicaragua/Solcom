export type ZohoSerialRow = {
    serial_id: string;
    serial_code: string;
};

export type ZohoSerialPayload = {
    success: true;
    total_found: number;
    serials: ZohoSerialRow[];
};

type SerialCacheEntry = {
    payload: ZohoSerialPayload;
    expiresAt: number;
};

const serialCache = new Map<string, SerialCacheEntry>();
const serialInFlight = new Map<string, Promise<ZohoSerialPayload>>();

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function buildZohoSerialCacheKey(itemId: string, warehouseId: string): string {
    return `${normalizeText(itemId)}::${normalizeText(warehouseId)}`;
}

export function getCachedZohoSerialPayload(cacheKey: string): ZohoSerialPayload | null {
    const entry = serialCache.get(cacheKey);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
        serialCache.delete(cacheKey);
        return null;
    }
    return entry.payload;
}

export function setCachedZohoSerialPayload(
    cacheKey: string,
    payload: ZohoSerialPayload,
    ttlMs: number
): void {
    serialCache.set(cacheKey, {
        payload,
        expiresAt: Date.now() + Math.max(500, Math.floor(ttlMs)),
    });
}

export function getZohoSerialInFlight(cacheKey: string): Promise<ZohoSerialPayload> | null {
    return serialInFlight.get(cacheKey) || null;
}

export function setZohoSerialInFlight(cacheKey: string, requestPromise: Promise<ZohoSerialPayload>): void {
    serialInFlight.set(cacheKey, requestPromise);
}

export function clearZohoSerialInFlight(cacheKey: string): void {
    serialInFlight.delete(cacheKey);
}

export function invalidateZohoSerialCacheKey(itemId: string, warehouseId: string): boolean {
    const key = buildZohoSerialCacheKey(itemId, warehouseId);
    const deleted = serialCache.delete(key);
    serialInFlight.delete(key);
    return deleted;
}

export function invalidateZohoSerialCacheByItem(itemId: string): number {
    const normalizedItemId = normalizeText(itemId);
    if (!normalizedItemId) return 0;

    let cleared = 0;
    for (const key of Array.from(serialCache.keys())) {
        if (key.startsWith(`${normalizedItemId}::`)) {
            if (serialCache.delete(key)) cleared += 1;
            serialInFlight.delete(key);
        }
    }
    return cleared;
}

export function invalidateZohoSerialCacheByItemIds(itemIds: string[]): number {
    let total = 0;
    for (const itemId of itemIds || []) {
        total += invalidateZohoSerialCacheByItem(itemId);
    }
    return total;
}
