import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = createServerClient();

        // 1. All warehouses in Supabase
        const { data: dbWarehouses } = await supabase
            .from('warehouses')
            .select('*')
            .order('code');

        // 2. Fetch warehouses from Zoho
        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        let zohoWarehouses: any[] = [];

        const auth = await getZohoAccessToken();
        if (!('error' in auth) && organizationId) {
            const { accessToken, apiDomain } = auth;
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const url = `${apiDomain}/inventory/v1/warehouses?organization_id=${organizationId}&page=${page}&per_page=200`;
                const response = await fetch(url, {
                    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                    cache: 'no-store',
                });

                if (response.ok) {
                    const result = await response.json();
                    zohoWarehouses.push(...(result.warehouses || []));
                    hasMore = result.page_context?.has_more_page || false;
                    page++;
                } else {
                    hasMore = false;
                }
            }
        }

        return NextResponse.json({
            supabase: {
                total: dbWarehouses?.length || 0,
                active: dbWarehouses?.filter((w: any) => w.active).length || 0,
                inactive: dbWarehouses?.filter((w: any) => !w.active).length || 0,
                warehouses: dbWarehouses?.map((w: any) => ({
                    id: w.id,
                    code: w.code,
                    name: w.name,
                    active: w.active,
                    zoho_warehouse_id: w.zoho_warehouse_id,
                })),
            },
            zoho: {
                total: zohoWarehouses.length,
                warehouses: zohoWarehouses.map((w: any) => ({
                    warehouse_id: w.warehouse_id,
                    warehouse_name: w.warehouse_name,
                    status: w.status,
                    is_primary: w.is_primary,
                })),
            },
        });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
    }
}
