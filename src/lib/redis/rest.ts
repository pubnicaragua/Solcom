type RedisPrimitive = string | number | boolean | null;

type RedisResult<T = any> = {
    ok: boolean;
    result: T | null;
    error: string | null;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function resolveRedisConfig() {
    const url = normalizeText(process.env.UPSTASH_REDIS_REST_URL);
    const token = normalizeText(process.env.UPSTASH_REDIS_REST_TOKEN);
    const ready = Boolean(url && token);
    return { url, token, ready };
}

export function isRedisRestConfigured(): boolean {
    return resolveRedisConfig().ready;
}

export async function redisCommand<T = any>(args: RedisPrimitive[]): Promise<RedisResult<T>> {
    const { url, token, ready } = resolveRedisConfig();
    if (!ready) {
        return { ok: false, result: null, error: 'Redis REST no configurado.' };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            cache: 'no-store',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(args),
        });

        const raw = await response.text();
        if (!response.ok) {
            return { ok: false, result: null, error: `HTTP ${response.status}: ${raw.slice(0, 240)}` };
        }

        let data: any = null;
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            return { ok: false, result: null, error: `JSON inválido: ${raw.slice(0, 240)}` };
        }

        if (data?.error) {
            return { ok: false, result: null, error: String(data.error) };
        }

        return { ok: true, result: data?.result ?? null, error: null };
    } catch (error: any) {
        return { ok: false, result: null, error: String(error?.message || error || 'Error Redis REST') };
    }
}

export async function redisAcquireLock(params: {
    key: string;
    owner: string;
    ttlSeconds?: number;
}): Promise<{ acquired: boolean; error: string | null }> {
    const { key, owner, ttlSeconds = 8 } = params;
    const response = await redisCommand(['SET', key, owner, 'NX', 'EX', Math.max(1, Math.floor(ttlSeconds))]);
    if (!response.ok) {
        return { acquired: false, error: response.error };
    }
    return { acquired: response.result === 'OK', error: null };
}

export async function redisReleaseLock(params: {
    key: string;
    owner: string;
}): Promise<void> {
    const { key, owner } = params;
    // Lua guard: unlock only if current owner matches.
    await redisCommand([
        'EVAL',
        "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
        1,
        key,
        owner,
    ]);
}

export async function redisGetJson<T = any>(key: string): Promise<{ value: T | null; error: string | null }> {
    const response = await redisCommand<string | null>(['GET', key]);
    if (!response.ok) return { value: null, error: response.error };
    const raw = response.result;
    if (!raw) return { value: null, error: null };
    try {
        return { value: JSON.parse(String(raw)) as T, error: null };
    } catch {
        return { value: null, error: 'JSON inválido en Redis.' };
    }
}

export async function redisSetJson(params: {
    key: string;
    value: any;
    ttlSeconds: number;
}): Promise<{ ok: boolean; error: string | null }> {
    const { key, value, ttlSeconds } = params;
    const payload = JSON.stringify(value);
    const response = await redisCommand(['SET', key, payload, 'EX', Math.max(1, Math.floor(ttlSeconds))]);
    if (!response.ok) {
        return { ok: false, error: response.error };
    }
    return { ok: true, error: null };
}

export async function redisFixedWindowConsume(params: {
    keyPrefix: string;
    limitPerSecond: number;
}): Promise<{ allowed: boolean; retryAfterMs: number; error: string | null }> {
    const now = Date.now();
    const secondBucket = Math.floor(now / 1000);
    const key = `${params.keyPrefix}:${secondBucket}`;
    const limit = Math.max(1, Math.floor(params.limitPerSecond));

    const incr = await redisCommand<number>(['INCR', key]);
    if (!incr.ok) {
        return { allowed: true, retryAfterMs: 0, error: incr.error };
    }

    const count = Number(incr.result || 0);
    if (count <= 1) {
        await redisCommand(['EXPIRE', key, 2]);
    }

    if (count <= limit) {
        return { allowed: true, retryAfterMs: 0, error: null };
    }

    const msIntoSecond = now % 1000;
    const retryAfterMs = Math.max(20, 1000 - msIntoSecond);
    return { allowed: false, retryAfterMs, error: null };
}
