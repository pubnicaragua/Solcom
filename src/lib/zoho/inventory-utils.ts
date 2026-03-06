import { createZohoBooksClient } from '@/lib/zoho/books-client';

type ZohoAuthSuccess = {
    accessToken: string;
    apiDomain: string;
    authDomainUsed: string;
};

type ZohoAuthError = {
    error: string;
};

export async function getZohoAccessToken(options: { forceRefresh?: boolean } = {}): Promise<ZohoAuthSuccess | ZohoAuthError> {
    try {
        const client = createZohoBooksClient();
        if (!client) {
            return { error: 'Configuración de Zoho Books incompleta' };
        }
        const auth = await client.getAuthContext({ forceRefresh: options.forceRefresh === true });
        return {
            accessToken: auth.accessToken,
            apiDomain: auth.apiDomain,
            authDomainUsed: auth.authDomainUsed,
        };
    } catch (error: any) {
        return {
            error: String(error?.message || error || 'No se pudo autenticar con Zoho Books'),
        };
    }
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
