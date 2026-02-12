import { NextResponse } from 'next/server';
import { createZohoBooksClient } from '@/lib/zoho/books-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku');

    if (!sku) {
        return NextResponse.json({ error: 'SKU parameter is required' }, { status: 400 });
    }

    const client = createZohoBooksClient();
    if (!client) {
        return NextResponse.json({ error: 'Zoho Client configuration missing' }, { status: 500 });
    }

    try {
        const items = await client.fetchItems();
        const item = items.find((i: any) => i.sku === sku);

        if (!item) {
            return NextResponse.json({ error: 'Item not found in Zoho', sku }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            item: {
                item_id: item.item_id,
                sku: item.sku,
                name: item.name,
                stock_on_hand: item.stock_on_hand,
                available_stock: item.available_stock,
                actual_available_stock: item.actual_available_stock,
                // Dump all keys to see what's actually there if types are wrong
                all_keys: Object.keys(item)
            }
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
