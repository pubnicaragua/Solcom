import { createHash, randomUUID } from 'crypto';
import {
    isRedisRestConfigured,
    redisAcquireLock,
    redisGetJson,
    redisReleaseLock,
    redisSetJson,
} from '@/lib/redis/rest';
import { isSalesZohoRedisGuardsEnabled } from '@/lib/ventas/feature-flags';

export interface ZohoSalesperson {
    salespersonId: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
}

interface ZohoAuthPayload {
    accessToken: string;
    apiDomain: string;
}

export interface FetchZohoSalespeopleOptions {
    forceRefresh?: boolean;
    allowStaleOnError?: boolean;
}

type SalespeopleCacheEntry = {
    rows: ZohoSalesperson[];
    expiresAt: number;
    inFlight: Promise<ZohoSalesperson[]> | null;
};

const SALESPEOPLE_CACHE_TTL_MS = 5 * 60_000;
const SALESPEOPLE_REDIS_LOCK_TTL_SEC = 12;
const salespeopleCacheByOrg = new Map<string, SalespeopleCacheEntry>();

function asText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function asBool(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return fallback;
        if (['true', '1', 'yes', 'active', 'enabled'].includes(normalized)) return true;
        if (['false', '0', 'no', 'inactive', 'disabled'].includes(normalized)) return false;
    }
    return fallback;
}

function inferActive(raw: any): boolean {
    const status = asText(raw?.status || raw?.user_org_status || raw?.salesperson_status).toLowerCase();
    if (status) {
        if (['active', 'enabled'].includes(status)) return true;
        if (['inactive', 'disabled'].includes(status)) return false;
    }
    if (raw?.is_active !== undefined) return asBool(raw.is_active, true);
    if (raw?.active !== undefined) return asBool(raw.active, true);
    return true;
}

function inferName(raw: any): string {
    const directName = asText(
        raw?.salesperson_name ||
        raw?.name ||
        raw?.display_name ||
        raw?.full_name
    );
    if (directName) return directName;

    const firstName = asText(raw?.first_name);
    const lastName = asText(raw?.last_name);
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) return fullName;

    return '';
}

function normalizeSalesperson(raw: any): ZohoSalesperson | null {
    const salespersonId = asText(raw?.salesperson_id || raw?.sales_person_id);
    const userId = asText(raw?.user_id || raw?.id || raw?.iamuid);
    const name = inferName(raw);
    const email = asText(raw?.email || raw?.email_id);
    const role = asText(raw?.user_role || raw?.role || 'Salesperson');
    const active = inferActive(raw);

    if (!name) return null;
    if (!salespersonId && !userId) return null;

    return {
        salespersonId,
        userId,
        name,
        email,
        role,
        active,
    };
}

async function fetchZohoEndpoint(auth: ZohoAuthPayload, endpoint: string, organizationId: string): Promise<{ ok: boolean; data: any; error: string }> {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${auth.apiDomain}${endpoint}${separator}organization_id=${encodeURIComponent(organizationId)}`;
    const response = await fetch(url, {
        headers: { Authorization: `Zoho-oauthtoken ${auth.accessToken}` },
        cache: 'no-store',
    });

    const raw = await response.text();
    if (!response.ok) {
        return {
            ok: false,
            data: null,
            error: `${response.status} - ${raw.slice(0, 240)}`,
        };
    }

    try {
        const data = raw ? JSON.parse(raw) : {};
        if (data?.code !== undefined && data?.code !== 0) {
            return {
                ok: false,
                data: null,
                error: `${data?.code} - ${asText(data?.message) || 'Zoho error'}`,
            };
        }
        return { ok: true, data, error: '' };
    } catch {
        return {
            ok: false,
            data: null,
            error: `JSON inválido: ${raw.slice(0, 240)}`,
        };
    }
}

function dedupeSalespeople(rows: ZohoSalesperson[]): ZohoSalesperson[] {
    const dedup = new Map<string, ZohoSalesperson>();
    for (const row of rows) {
        const key = row.salespersonId || row.userId;
        if (!key) continue;
        const existing = dedup.get(key);
        if (!existing || (!existing.active && row.active)) {
            dedup.set(key, row);
        }
    }
    return Array.from(dedup.values());
}

function selectPreferredRows(rows: ZohoSalesperson[]): ZohoSalesperson[] {
    const active = rows.filter((row) => row.active);
    return active.length > 0 ? active : rows;
}

function redisGuardsEnabled(): boolean {
    return isSalesZohoRedisGuardsEnabled() && isRedisRestConfigured();
}

function hashOrgId(organizationId: string): string {
    return createHash('sha1').update(String(organizationId || '').trim()).digest('hex').slice(0, 24);
}

function redisCacheKey(organizationId: string): string {
    return `zoho:books:salespeople:cache:${hashOrgId(organizationId)}`;
}

function redisLockKey(organizationId: string): string {
    return `zoho:books:salespeople:lock:${hashOrgId(organizationId)}`;
}

function readInMemoryCache(organizationId: string): SalespeopleCacheEntry | null {
    return salespeopleCacheByOrg.get(organizationId) || null;
}

function writeInMemoryCache(organizationId: string, rows: ZohoSalesperson[], ttlMs = SALESPEOPLE_CACHE_TTL_MS) {
    salespeopleCacheByOrg.set(organizationId, {
        rows,
        expiresAt: Date.now() + Math.max(1_000, ttlMs),
        inFlight: null,
    });
}

async function readRedisCache(organizationId: string): Promise<ZohoSalesperson[] | null> {
    if (!redisGuardsEnabled()) return null;
    const result = await redisGetJson<{ rows?: unknown }>(redisCacheKey(organizationId));
    if (result.error || !result.value) return null;
    const rows = (result.value as any)?.rows;
    if (!Array.isArray(rows)) return null;
    const normalized = dedupeSalespeople(
        rows
            .map((row: any) => normalizeSalesperson(row))
            .filter(Boolean) as ZohoSalesperson[]
    );
    if (!normalized.length) return null;
    return selectPreferredRows(normalized);
}

async function writeRedisCache(organizationId: string, rows: ZohoSalesperson[]) {
    if (!redisGuardsEnabled()) return;
    await redisSetJson({
        key: redisCacheKey(organizationId),
        value: { rows },
        ttlSeconds: Math.ceil(SALESPEOPLE_CACHE_TTL_MS / 1000),
    });
}

async function fetchSalespeopleFromZoho(auth: ZohoAuthPayload, organizationId: string): Promise<ZohoSalesperson[]> {
    const errors: string[] = [];

    const salespersonsResult = await fetchZohoEndpoint(auth, '/books/v3/salespersons', organizationId);
    if (salespersonsResult.ok) {
        const salespersonsRaw = Array.isArray(salespersonsResult.data?.salespersons)
            ? salespersonsResult.data.salespersons
            : [];

        const normalized = dedupeSalespeople(
            salespersonsRaw
                .map((row: any) => normalizeSalesperson(row))
                .filter(Boolean) as ZohoSalesperson[]
        );

        if (normalized.length > 0) return selectPreferredRows(normalized);
    } else {
        errors.push(`salespersons: ${salespersonsResult.error}`);
    }

    const usersResult = await fetchZohoEndpoint(auth, '/books/v3/users', organizationId);
    if (usersResult.ok) {
        const usersRaw = Array.isArray(usersResult.data?.users)
            ? usersResult.data.users
            : [];

        const normalized = dedupeSalespeople(
            usersRaw
                .map((row: any) => normalizeSalesperson(row))
                .filter(Boolean) as ZohoSalesperson[]
        );

        if (normalized.length > 0) return selectPreferredRows(normalized);
    } else {
        errors.push(`users: ${usersResult.error}`);
    }

    throw new Error(`No se pudieron obtener vendedores de Zoho (${errors.join(' | ') || 'sin detalle'})`);
}

export async function fetchZohoSalespeople(
    auth: ZohoAuthPayload,
    organizationId: string,
    options: FetchZohoSalespeopleOptions = {}
): Promise<ZohoSalesperson[]> {
    const forceRefresh = options.forceRefresh === true;
    const allowStaleOnError = options.allowStaleOnError !== false;
    const normalizedOrgId = String(organizationId || '').trim();

    if (!normalizedOrgId) {
        throw new Error('organizationId inválido para obtener vendedores de Zoho.');
    }

    const now = Date.now();
    const existing = readInMemoryCache(normalizedOrgId);

    if (!forceRefresh && existing?.rows?.length && now < existing.expiresAt) {
        return existing.rows;
    }

    if (!forceRefresh && existing?.inFlight) {
        return existing.inFlight;
    }

    if (!forceRefresh) {
        const redisRows = await readRedisCache(normalizedOrgId);
        if (redisRows && redisRows.length > 0) {
            writeInMemoryCache(normalizedOrgId, redisRows);
            return redisRows;
        }
    }

    const staleRows = existing?.rows || [];

    const refreshPromise = (async () => {
        let lockOwner = '';
        let lockAcquired = false;

        if (redisGuardsEnabled()) {
            lockOwner = randomUUID();
            const lock = await redisAcquireLock({
                key: redisLockKey(normalizedOrgId),
                owner: lockOwner,
                ttlSeconds: SALESPEOPLE_REDIS_LOCK_TTL_SEC,
            });
            lockAcquired = lock.acquired;

            if (!lockAcquired && !forceRefresh) {
                for (let attempt = 0; attempt < 8; attempt += 1) {
                    const redisRows = await readRedisCache(normalizedOrgId);
                    if (redisRows && redisRows.length > 0) {
                        writeInMemoryCache(normalizedOrgId, redisRows);
                        return redisRows;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 140 + Math.floor(Math.random() * 120)));
                }
            }
        }

        try {
            const freshRows = await fetchSalespeopleFromZoho(auth, normalizedOrgId);
            writeInMemoryCache(normalizedOrgId, freshRows);
            await writeRedisCache(normalizedOrgId, freshRows);
            return freshRows;
        } finally {
            if (lockAcquired) {
                await redisReleaseLock({
                    key: redisLockKey(normalizedOrgId),
                    owner: lockOwner,
                });
            }
        }
    })();

    salespeopleCacheByOrg.set(normalizedOrgId, {
        rows: staleRows,
        expiresAt: existing?.expiresAt || 0,
        inFlight: refreshPromise,
    });

    try {
        return await refreshPromise;
    } catch (error) {
        if (allowStaleOnError && staleRows.length > 0) {
            return staleRows;
        }
        throw error;
    } finally {
        const snapshot = readInMemoryCache(normalizedOrgId);
        if (snapshot?.inFlight === refreshPromise) {
            salespeopleCacheByOrg.set(normalizedOrgId, {
                rows: snapshot.rows,
                expiresAt: snapshot.expiresAt,
                inFlight: null,
            });
        }
    }
}
