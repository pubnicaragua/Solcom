import { NextResponse } from 'next/server';
import { getZohoAccessToken } from '../../../../lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

type SerialRow = {
    serial_id: string;
    serial_code: string;
};

type SerialPayload = {
    success: true;
    total_found: number;
    serials: SerialRow[];
};

const SERIAL_CACHE_TTL_MS = 45_000;
const serialCache = new Map<string, { payload: SerialPayload; expiresAt: number }>();
const serialInFlight = new Map<string, Promise<SerialPayload>>();

class ZohoSerialsRequestError extends Error {
    status: number;
    body: string;

    constructor(status: number, body: string) {
        super(`Zoho serials request failed: ${status}`);
        this.status = status;
        this.body = body;
    }
}

function cacheKey(itemId: string, warehouseId: string): string {
    return `${itemId}::${warehouseId}`;
}

async function fetchSerialsFromZoho(
    auth: { accessToken: string; apiDomain: string },
    organizationId: string,
    itemId: string,
    warehouseId: string,
): Promise<SerialPayload> {
    const headers = { Authorization: `Zoho-oauthtoken ${auth.accessToken}` };
    const url = `${auth.apiDomain}/inventory/v1/items/serialnumbers?item_id=${itemId}&show_transacted_out=false&location_id=${warehouseId}&organization_id=${organizationId}`;
    const response = await fetch(url, { headers, cache: 'no-store' });

    if (!response.ok) {
        const errorText = await response.text();
        throw new ZohoSerialsRequestError(response.status, errorText);
    }

    const data = await response.json();
    const serialNumbers = data.serial_numbers || [];

    const availableSerials = serialNumbers
        .filter((s: any) => s.status === 'active')
        .map((s: any) => ({
            serial_id: s.serialnumber_id,
            serial_code: s.serialnumber,
        }));

    return {
        success: true,
        total_found: availableSerials.length,
        serials: availableSerials,
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const itemId = searchParams.get('item_id');
        const warehouseId = searchParams.get('warehouse_id');

        if (!itemId || !warehouseId) {
            return NextResponse.json(
                { error: 'Faltan parámetros requeridos: item_id y warehouse_id' },
                { status: 400 }
            );
        }

        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        if (!organizationId) {
            return NextResponse.json({ error: 'Falta configurar ZOHO_BOOKS_ORGANIZATION_ID' }, { status: 500 });
        }

        const key = cacheKey(itemId, warehouseId);
        const cached = serialCache.get(key);
        if (cached && Date.now() < cached.expiresAt) {
            return NextResponse.json(cached.payload);
        }

        if (serialInFlight.has(key)) {
            const payload = await serialInFlight.get(key)!;
            return NextResponse.json(payload);
        }

        const requestPromise = (async () => {
            const auth = await getZohoAccessToken();
            if ('error' in auth || !auth.accessToken) {
                console.error('[Zoho Serials Auth Error]:', auth);
                throw new Error('No se pudo obtener el token de Zoho');
            }

            try {
                const payload = await fetchSerialsFromZoho(auth, organizationId, itemId, warehouseId);
                serialCache.set(key, { payload, expiresAt: Date.now() + SERIAL_CACHE_TTL_MS });
                return payload;
            } catch (firstError) {
                if (firstError instanceof ZohoSerialsRequestError && firstError.status === 401) {
                    // Reintento una vez forzando refresh por si el token cacheado expiró.
                    const retryAuth = await getZohoAccessToken({ forceRefresh: true });
                    if ('error' in retryAuth || !retryAuth.accessToken) {
                        console.error('[Zoho Serials Auth Retry Error]:', retryAuth);
                        throw new Error('No se pudo refrescar token de Zoho');
                    }
                    const payload = await fetchSerialsFromZoho(retryAuth, organizationId, itemId, warehouseId);
                    serialCache.set(key, { payload, expiresAt: Date.now() + SERIAL_CACHE_TTL_MS });
                    return payload;
                }
                throw firstError;
            }
        })();

        serialInFlight.set(key, requestPromise);
        try {
            const payload = await requestPromise;
            return NextResponse.json(payload);
        } finally {
            serialInFlight.delete(key);
        }

    } catch (error: any) {
        if (error instanceof ZohoSerialsRequestError) {
            console.error('[Zoho Serials Error]:', error.body);
            return NextResponse.json({ error: 'Zoho API rechazó la solicitud' }, { status: error.status });
        }
        console.error('[Fetch Serials Catch Error]:', error.message);
        return NextResponse.json({ error: 'Error interno del servidor', details: error.message }, { status: 500 });
    }
}
