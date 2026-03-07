import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getZohoAccessToken } from '../../../../lib/zoho/inventory-utils';
import {
    buildZohoSerialCacheKey,
    clearZohoSerialInFlight,
    getCachedZohoSerialPayload,
    getZohoSerialInFlight,
    setCachedZohoSerialPayload,
    setZohoSerialInFlight,
} from '@/lib/zoho/serial-cache';
import type { ZohoSerialPayload } from '@/lib/zoho/serial-cache';

export const dynamic = 'force-dynamic';

const SERIAL_CACHE_TTL_MS = 15_000;

class ZohoSerialsRequestError extends Error {
    status: number;
    body: string;

    constructor(status: number, body: string) {
        super(`Zoho serials request failed: ${status}`);
        this.status = status;
        this.body = body;
    }
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

async function resolveLocalItemId(
    supabase: any,
    localItemIdParam: string | null,
    zohoItemId: string
): Promise<string | null> {
    const byParam = normalizeText(localItemIdParam);
    if (byParam) return byParam;

    const lookup = await supabase
        .from('items')
        .select('id')
        .eq('zoho_item_id', zohoItemId)
        .limit(1)
        .maybeSingle();

    if (lookup.error) {
        return null;
    }

    return normalizeText(lookup.data?.id) || null;
}

async function filterReservedSerials(params: {
    supabase: any;
    payload: ZohoSerialPayload;
    localItemId: string | null;
    salesOrderId: string | null;
}): Promise<ZohoSerialPayload> {
    const { supabase, payload, localItemId, salesOrderId } = params;
    if (!localItemId || !Array.isArray(payload.serials) || payload.serials.length === 0) {
        return payload;
    }

    try {
        await supabase.rpc('fn_expire_serial_reservations');
    } catch {
        // Si falla expiración local, no bloqueamos la respuesta de Zoho.
    }

    const reservations = await supabase
        .from('sales_order_serial_reservations')
        .select('serial_code, sales_order_id')
        .eq('item_id', localItemId)
        .eq('status', 'reserved');

    if (reservations.error) {
        return payload;
    }

    const keepOrderId = normalizeText(salesOrderId);
    const blocked = new Set<string>();
    for (const row of reservations.data || []) {
        const serialCode = normalizeText(row?.serial_code);
        if (!serialCode) continue;
        const ownerOrderId = normalizeText(row?.sales_order_id);
        if (keepOrderId && ownerOrderId === keepOrderId) continue;
        blocked.add(serialCode);
    }

    if (blocked.size === 0) return payload;

    const filteredSerials = payload.serials.filter((serial) => !blocked.has(normalizeText(serial.serial_code)));
    return {
        success: true,
        total_found: filteredSerials.length,
        serials: filteredSerials,
    };
}

async function fetchSerialsFromZoho(
    auth: { accessToken: string; apiDomain: string },
    organizationId: string,
    itemId: string,
    warehouseId: string,
): Promise<ZohoSerialPayload> {
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
        const itemId = normalizeText(searchParams.get('item_id'));
        const warehouseId = normalizeText(searchParams.get('warehouse_id'));
        const localItemIdParam = normalizeText(searchParams.get('local_item_id'));
        const salesOrderId = searchParams.get('sales_order_id');

        if (!warehouseId || (!itemId && !localItemIdParam)) {
            return NextResponse.json(
                { error: 'Faltan parámetros requeridos: warehouse_id y (item_id o local_item_id)' },
                { status: 400 }
            );
        }

        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        if (!organizationId) {
            return NextResponse.json({ error: 'Falta configurar ZOHO_BOOKS_ORGANIZATION_ID' }, { status: 500 });
        }

        const supabase = createRouteHandlerClient({ cookies });

        let effectiveZohoItemId = itemId;
        if (!effectiveZohoItemId && localItemIdParam) {
            const localItemLookup = await supabase
                .from('items')
                .select('id, zoho_item_id')
                .eq('id', localItemIdParam)
                .maybeSingle();

            if (localItemLookup.error) {
                return NextResponse.json(
                    { error: `No se pudo resolver zoho_item_id para local_item_id: ${localItemLookup.error.message}` },
                    { status: 500 }
                );
            }

            effectiveZohoItemId = normalizeText(localItemLookup.data?.zoho_item_id);
            if (!effectiveZohoItemId) {
                return NextResponse.json({
                    success: true,
                    total_found: 0,
                    serials: [],
                });
            }
        }

        const key = buildZohoSerialCacheKey(effectiveZohoItemId, warehouseId);
        const cached = getCachedZohoSerialPayload(key);

        let basePayload: ZohoSerialPayload | null = null;
        if (cached) {
            basePayload = cached;
        } else if (getZohoSerialInFlight(key)) {
            basePayload = await getZohoSerialInFlight(key)!;
        } else {
            const requestPromise = (async () => {
                const auth = await getZohoAccessToken();
                if ('error' in auth || !auth.accessToken) {
                    console.error('[Zoho Serials Auth Error]:', auth);
                    throw new Error('No se pudo obtener el token de Zoho');
                }

                try {
                    const payload = await fetchSerialsFromZoho(auth, organizationId, effectiveZohoItemId, warehouseId);
                    setCachedZohoSerialPayload(key, payload, SERIAL_CACHE_TTL_MS);
                    return payload;
                } catch (firstError) {
                    if (firstError instanceof ZohoSerialsRequestError && firstError.status === 401) {
                        // Reintento una vez forzando refresh por si el token cacheado expiró.
                        const retryAuth = await getZohoAccessToken({ forceRefresh: true });
                        if ('error' in retryAuth || !retryAuth.accessToken) {
                            console.error('[Zoho Serials Auth Retry Error]:', retryAuth);
                            throw new Error('No se pudo refrescar token de Zoho');
                        }
                        const payload = await fetchSerialsFromZoho(retryAuth, organizationId, effectiveZohoItemId, warehouseId);
                        setCachedZohoSerialPayload(key, payload, SERIAL_CACHE_TTL_MS);
                        return payload;
                    }
                    throw firstError;
                }
            })();

            setZohoSerialInFlight(key, requestPromise);
            try {
                basePayload = await requestPromise;
            } finally {
                clearZohoSerialInFlight(key);
            }
        }

        const payload = basePayload || { success: true, total_found: 0, serials: [] };
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json(payload);
        }

        const localItemId = await resolveLocalItemId(supabase, localItemIdParam, effectiveZohoItemId);
        const filteredPayload = await filterReservedSerials({
            supabase,
            payload,
            localItemId,
            salesOrderId,
        });

        return NextResponse.json(filteredPayload);
    } catch (error: any) {
        if (error instanceof ZohoSerialsRequestError) {
            console.error('[Zoho Serials Error]:', error.body);
            return NextResponse.json({ error: 'Zoho API rechazó la solicitud' }, { status: error.status });
        }
        console.error('[Fetch Serials Catch Error]:', error.message);
        return NextResponse.json({ error: 'Error interno del servidor', details: error.message }, { status: 500 });
    }
}
