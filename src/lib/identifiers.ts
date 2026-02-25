import { createHash } from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

/**
 * Creates a stable UUID-looking identifier from an external ID.
 * We use this to persist providers that don't expose UUIDs (e.g. Zoho user_id).
 */
export function deterministicUuidFromExternalId(source: string, externalId: string): string {
    const seed = `${source}:${externalId}`.trim();
    const hash = createHash('sha1').update(seed).digest('hex').slice(0, 32).split('');

    // UUIDv5 shape (version + variant bits)
    hash[12] = '5';
    const variant = parseInt(hash[16], 16);
    hash[16] = ((variant & 0x3) | 0x8).toString(16);

    const hex = hash.join('');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join('-');
}

export function normalizeSalespersonId(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (isUuid(trimmed)) return trimmed.toLowerCase();
    return deterministicUuidFromExternalId('zoho_salesperson', trimmed);
}
