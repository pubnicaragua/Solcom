import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const auth = await getZohoAccessToken();
        if ('error' in auth) return NextResponse.json(auth);

        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        const url = `${auth.apiDomain}/inventory/v1/warehouses?organization_id=${organizationId}`;

        const response = await fetch(url, {
            headers: { Authorization: `Zoho-oauthtoken ${auth.accessToken}` },
            cache: 'no-store',
        });

        const zohoData = await response.json();

        const supabase = createServerClient();
        const { data: localWarehouses } = await supabase.from('warehouses').select('*');

        return NextResponse.json({
            zoho: zohoData.warehouses.map((w: any) => ({
                id: w.warehouse_id,
                name: w.warehouse_name,
                status: w.status
            })),
            supabase: localWarehouses?.map((w: any) => ({
                id: w.id,
                zoho_id: w.zoho_warehouse_id,
                code: w.code,
                name: w.name,
                active: w.active
            }))
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message });
    }
}
