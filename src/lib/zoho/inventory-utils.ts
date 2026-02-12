export async function getZohoAccessToken() {
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        return { error: 'Configuración de Zoho Books incompleta' };
    }

    const authDomain = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';
    const response = await fetch(`${authDomain}/oauth/v2/token`, {
        method: 'POST',
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

    if (!response.ok) {
        const errorText = await response.text();
        return { error: `Zoho auth failed: ${response.status} - ${errorText}` };
    }

    const data = await response.json();
    return {
        accessToken: data.access_token as string,
        apiDomain: (data.api_domain as string) || 'https://www.zohoapis.com',
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
