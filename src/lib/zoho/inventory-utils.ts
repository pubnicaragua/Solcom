function normalizeDomain(raw: string): string | null {
    const value = raw.trim().replace(/^['"]|['"]$/g, '');
    if (!value) return null;
    try {
        const parsed = new URL(value.includes('://') ? value : `https://${value}`);
        return parsed.origin;
    } catch {
        return null;
    }
}

function authDomainCandidates(rawDomain: string | undefined): string[] {
    const candidates: string[] = [];
    const normalized = rawDomain ? normalizeDomain(rawDomain) : null;
    if (normalized) {
        candidates.push(normalized);
    }

    const fallbacks = [
        'https://accounts.zoho.com',
        'https://accounts.zoho.eu',
        'https://accounts.zoho.in',
        'https://accounts.zoho.com.au',
        'https://accounts.zoho.jp',
    ];
    for (const domain of fallbacks) {
        if (!candidates.includes(domain)) {
            candidates.push(domain);
        }
    }
    return candidates;
}

export async function getZohoAccessToken() {
    const clientId = (process.env.ZOHO_BOOKS_CLIENT_ID || '').trim();
    const clientSecret = (process.env.ZOHO_BOOKS_CLIENT_SECRET || '').trim();
    const refreshToken = (process.env.ZOHO_BOOKS_REFRESH_TOKEN || '').trim();

    if (!clientId || !clientSecret || !refreshToken) {
        return { error: 'Configuración de Zoho Books incompleta' };
    }

    const domains = authDomainCandidates(process.env.ZOHO_AUTH_DOMAIN);
    const errors: string[] = [];

    for (const authDomain of domains) {
        const response = await fetch(`${authDomain}/oauth/v2/token`, {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
            }),
        });

        const rawText = await response.text();
        if (!response.ok) {
            const snippet = rawText.slice(0, 140).replace(/\s+/g, ' ').trim();
            errors.push(`${authDomain} -> ${response.status}: ${snippet}`);
            continue;
        }

        let data: any;
        try {
            data = JSON.parse(rawText);
        } catch {
            errors.push(`${authDomain} -> 200: invalid JSON response`);
            continue;
        }

        if (!data?.access_token) {
            const snippet = JSON.stringify(data).slice(0, 140);
            errors.push(`${authDomain} -> 200 without access_token: ${snippet}`);
            continue;
        }

        return {
            accessToken: data.access_token as string,
            apiDomain: (data.api_domain as string) || 'https://www.zohoapis.com',
            authDomainUsed: authDomain,
        };
    }

    return {
        error: `Zoho auth failed on all domains. Attempts: ${errors.join(' | ')}`,
    };
}

export class AuthExpiredError extends Error {
    constructor() {
        super('Zoho access token expired');
        this.name = 'AuthExpiredError';
    }
}

export async function fetchItemLocations(
    accessToken: string,
    apiDomain: string,
    organizationId: string,
    itemId: string
) {
    const url = `${apiDomain}/inventory/v1/items/${itemId}/locationdetails?organization_id=${organizationId}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        const errorText = await response.text();

        // 401 can be true token expiry OR permission/org issues.
        if (response.status === 401) {
            let parsed: any = null;
            try {
                parsed = JSON.parse(errorText);
            } catch {
                parsed = null;
            }

            const message = String(parsed?.message || errorText || '').toLowerCase();
            const code = parsed?.code ?? null;
            const isExpired =
                message.includes('expired') ||
                message.includes('invalid oauth') ||
                message.includes('invalid token');

            if (isExpired) {
                throw new AuthExpiredError();
            }

            throw new Error(
                `Zoho Inventory unauthorized (possible org/scope issue): ${code ?? 'unknown'} - ${parsed?.message || errorText}`
            );
        }

        // 404 = artículo eliminado o no existe en Zoho; tratamos como sin ubicaciones
        if (response.status === 404) {
            return [];
        }
        throw new Error(`Zoho Inventory item error: ${response.status} - ${errorText}`);
    }

    const rawText = await response.text();
    if (!rawText) {
        return [];
    }

    let result: any;
    try {
        result = JSON.parse(rawText);
    } catch {
        throw new Error(`Zoho Inventory item error: invalid JSON response: ${rawText.substring(0, 200)}`);
    }

    return result.item_location_details?.locations || [];
}
