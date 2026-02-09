import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getZohoAccessToken, fetchItemLocations } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        let itemId = searchParams.get('itemId');
        const sku = searchParams.get('sku');

        const supabase = createServerClient(); // Import local supabase client

        if (!itemId && sku) {
            // Try to find itemId by SKU in local DB
            const { data: item } = await supabase
                .from('items')
                .select('zoho_item_id')
                .eq('sku', sku)
                .single();

            if (item?.zoho_item_id) {
                itemId = item.zoho_item_id;
            } else {
                return NextResponse.json({ error: `Start by syncing items. SKU ${sku} not found locally.` }, { status: 404 });
            }
        }

        if (!itemId) {
            return NextResponse.json({ error: 'itemId or sku query param required' }, { status: 400 });
        }

        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        if (!organizationId) {
            return NextResponse.json({ error: 'ZOHO_BOOKS_ORGANIZATION_ID missing' }, { status: 500 });
        }

        const auth = await getZohoAccessToken();
        if ('error' in auth) {
            return NextResponse.json(auth, { status: 500 });
        }

        // 1. Fetch raw locations
        const { accessToken, apiDomain } = auth;
        const url = `${apiDomain}/inventory/v1/items/${itemId}/locationdetails?organization_id=${organizationId}`;

        const response = await fetch(url, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            cache: 'no-store',
        });

        const rawText = await response.text();
        let json;
        try {
            json = JSON.parse(rawText);
        } catch (e) {
            json = { error: 'Invalid JSON', raw: rawText };
        }

        // 2. Fetch local data
        const { data: localItem } = await supabase
            .from('items')
            .select('*')
            .eq('zoho_item_id', itemId)
            .single();

        const { data: localWarehouses } = await supabase
            .from('warehouses')
            .select('*');

        let localSnapshots: any[] = [];
        if (localItem?.id) {
            const { data } = await supabase
                .from('stock_snapshots')
                .select('*')
                .eq('item_id', localItem.id);
            localSnapshots = data || [];
        }

        return NextResponse.json({
            itemId,
            organizationId,
            url,
            zohoStatus: response.status,
            zohoData: json,
            supabase: {
                item: localItem,
                warehouses: localWarehouses,
                snapshots: localSnapshots
            }
        });

    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
