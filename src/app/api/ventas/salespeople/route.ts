import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { deterministicUuidFromExternalId } from '@/lib/identifiers';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import { fetchZohoSalespeople } from '@/lib/zoho/salespeople';

export const dynamic = 'force-dynamic';

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

        const organizationId = (process.env.ZOHO_BOOKS_ORGANIZATION_ID || '').trim();
        if (!organizationId) {
            return NextResponse.json({ error: 'Falta ZOHO_BOOKS_ORGANIZATION_ID' }, { status: 500 });
        }

        const auth: any = await getZohoAccessToken();
        if (!auth || auth.error || !auth.accessToken || !auth.apiDomain) {
            return NextResponse.json({ error: 'No se pudo autenticar con Zoho' }, { status: 500 });
        }

        const rows = await fetchZohoSalespeople(
            { accessToken: auth.accessToken, apiDomain: auth.apiDomain },
            organizationId
        );

        // Filter active users only and apply search
        let users = rows
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

        if (search) {
            const s = search.toLowerCase();
            users = users.filter((u) =>
                u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)
            );
        }

        return NextResponse.json({ salespeople: users });
    } catch (error: any) {
        console.error('Salespeople API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
