import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncItemStock } from '@/lib/zoho/sync-logic';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const zohoItemId = searchParams.get('id');

    if (!zohoItemId) return NextResponse.json({ error: 'Missing id param' });

    const debugLog: string[] = [];
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Auth
    const auth = await getZohoAccessToken();
    if (!auth || 'error' in auth) return NextResponse.json({ error: 'Auth failed' });

    // Warehouse Map
    const { data: warehouses } = await supabase.from('warehouses').select('id, code, active, zoho_warehouse_id');
    const warehouseMap = new Map<string, { id: string; active: boolean }>();
    warehouses?.forEach(w => {
        warehouseMap.set(w.id, { id: w.id, active: w.active });
        if (w.zoho_warehouse_id) warehouseMap.set(String(w.zoho_warehouse_id), { id: w.id, active: w.active });
    });

    const authData = { accessToken: auth.accessToken, apiDomain: auth.apiDomain };

    // Sync
    await syncItemStock(zohoItemId, supabase, warehouseMap, debugLog, authData);

    return NextResponse.json({ success: true, log: debugLog });
}
