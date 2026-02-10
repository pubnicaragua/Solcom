import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku') || 'TEST-01';
    const type = searchParams.get('type') || 'item'; // 'item' or 'adjustment'

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

    let webhookPayload: any = {};

    if (type === 'item') {
        // Simulate Item Updated event
        webhookPayload = {
            item: {
                item_id: item.zoho_item_id,
                sku: item.sku,
                name: item.name + ' (TEST)',
                stock_on_hand: item.stock_total,
                status: 'active',
                custom_field_hash: {
                    cf_color: 'AZUL',
                    cf_estado: 'NUEVO'
                }
            }
        };
    } else {
        // Simulate Inventory Adjustment event
        webhookPayload = {
            inventory_adjustment: {
                adjustment_id: '999999',
                reason: 'Webhook Test',
                line_items: [
                    {
                        item_id: item.zoho_item_id,
                        sku: item.sku,
                        name: item.name,
                        quantity_adjusted: 5,
                    }
                ]
            }
        };
    }

    const baseUrl = request.url.split('/api/')[0];
    const webhookUrl = `${baseUrl}/api/webhooks/zoho`;

    console.log(`[TEST] Calling webhook (${type}) at ${webhookUrl} for item ${item.sku}`);

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
        test_type: type,
        item: { id: item.id, sku: item.sku, zoho_item_id: item.zoho_item_id },
        webhook_response: result,
        snapshots_after: snapshots?.length || 0,
        snapshot_details: snapshots,
    });
}
