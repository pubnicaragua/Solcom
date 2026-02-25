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

export async function fetchZohoSalespeople(auth: ZohoAuthPayload, organizationId: string): Promise<ZohoSalesperson[]> {
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

        const active = normalized.filter((row) => row.active);
        if (active.length > 0) return active;
        if (normalized.length > 0) return normalized;
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

        const active = normalized.filter((row) => row.active);
        if (active.length > 0) return active;
        if (normalized.length > 0) return normalized;
    } else {
        errors.push(`users: ${usersResult.error}`);
    }

    throw new Error(`No se pudieron obtener vendedores de Zoho (${errors.join(' | ') || 'sin detalle'})`);
}
