import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { deterministicUuidFromExternalId } from '@/lib/identifiers';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import { fetchZohoSalespeople } from '@/lib/zoho/salespeople';

export const dynamic = 'force-dynamic';

function parseBoolean(raw: string | null, fallback = false): boolean {
    if (raw === null || raw === undefined) return fallback;
    const value = String(raw).trim().toLowerCase();
    if (!value) return fallback;
    if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(value)) return true;
    if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(value)) return false;
    return fallback;
}

function toSalespeoplePayload(rows: Array<{
    salespersonId: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
}>) {
    return rows
        .filter((u) => u.active)
        .map((u) => {
            const key = u.salespersonId || u.userId;
            return {
                id: deterministicUuidFromExternalId('zoho_salesperson', String(key || '')),
                zoho_user_id: String(u.userId || u.salespersonId || ''),
                zoho_salesperson_id: String(u.salespersonId || ''),
                name: u.name,
                email: u.email || '',
                role: u.role || 'Salesperson',
                photo_url: null,
            };
        });
}

async function loadSalespeople(params: {
    search?: string;
    forceRefresh?: boolean;
}) {
    const organizationId = (process.env.ZOHO_BOOKS_ORGANIZATION_ID || '').trim();
    if (!organizationId) {
        return {
            ok: false as const,
            status: 500,
            payload: { error: 'Falta ZOHO_BOOKS_ORGANIZATION_ID' },
        };
    }

    const auth: any = await getZohoAccessToken();
    if (!auth || auth.error || !auth.accessToken || !auth.apiDomain) {
        return {
            ok: false as const,
            status: 500,
            payload: { error: 'No se pudo autenticar con Zoho' },
        };
    }

    const rows = await fetchZohoSalespeople(
        { accessToken: auth.accessToken, apiDomain: auth.apiDomain },
        organizationId,
        {
            forceRefresh: params.forceRefresh === true,
            allowStaleOnError: true,
        }
    );

    let users = toSalespeoplePayload(rows);
    const search = String(params.search || '').trim().toLowerCase();
    if (search) {
        users = users.filter((u) =>
            u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
        );
    }

    return {
        ok: true as const,
        status: 200,
        payload: {
            salespeople: users,
            synced: params.forceRefresh === true,
        },
    };
}

// GET /api/ventas/salespeople — Fetch active users from Zoho Books
export async function GET(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';
        const forceRefresh = parseBoolean(searchParams.get('force_refresh')) || parseBoolean(searchParams.get('sync'));
        const result = await loadSalespeople({
            search,
            forceRefresh,
        });
        if (!result.ok) {
            return NextResponse.json(result.payload, { status: result.status });
        }
        return NextResponse.json(result.payload);
    } catch (error: any) {
        console.error('Salespeople API error:', error);
        return NextResponse.json({ error: error.message || 'No se pudieron cargar vendedores.' }, { status: 500 });
    }
}

// POST /api/ventas/salespeople — Manual sync button
export async function POST(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        let body: any = {};
        try {
            body = await req.json();
        } catch {
            body = {};
        }

        const forceRefresh = true;
        const search = String(body?.search || '').trim();
        const result = await loadSalespeople({
            search,
            forceRefresh,
        });
        if (!result.ok) {
            return NextResponse.json(result.payload, { status: result.status });
        }
        return NextResponse.json({
            ...result.payload,
            message: 'Vendedores sincronizados.',
        });
    } catch (error: any) {
        console.error('Salespeople sync API error:', error);
        return NextResponse.json({ error: error.message || 'No se pudieron sincronizar vendedores.' }, { status: 500 });
    }
}
