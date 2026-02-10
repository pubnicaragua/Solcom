import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku') || 'CABLE-USB-C';

    const supabase = createServerClient();

    // Get item with zoho_item_id
    const { data: item } = await supabase
        .from('items')
        .select('id, sku, name, zoho_item_id, stock_total')
        .eq('sku', sku)
        .single();

    if (!item) {
        return NextResponse.json({ error: `Item not found: ${sku}` });
    }

    // Simulate webhook call to local endpoint
    const webhookPayload = {
        item: {
            item_id: item.zoho_item_id,
            sku: item.sku,
            name: item.name,
            stock_on_hand: item.stock_total,
            status: 'active',
        }
    };

    const baseUrl = request.url.split('/api/')[0];
    const webhookUrl = `${baseUrl}/api/webhooks/zoho`;

    console.log(`[TEST] Calling webhook at ${webhookUrl} with item ${item.sku} (zoho_id: ${item.zoho_item_id})`);

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
    });

    const result = await response.json();

    // Check snapshots after webhook
    const { data: snapshots } = await supabase
        .from('stock_snapshots')
        .select('warehouse_id, qty, synced_at')
        .eq('item_id', item.id)
        .order('synced_at', { ascending: false })
        .limit(20);

    return NextResponse.json({
        item: { id: item.id, sku: item.sku, zoho_item_id: item.zoho_item_id },
        webhook_response: result,
        snapshots_after: snapshots?.length || 0,
        snapshot_details: snapshots,
    });
}
