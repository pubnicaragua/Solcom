
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createZohoBooksClient } from '@/lib/zoho/books-client';

export const dynamic = 'force-dynamic';

// GET: List transfer orders
export async function GET(request: Request) {
    try {
        const supabase = createServerClient();
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        let query = supabase
            .from('transfer_orders')
            .select(`
        *,
        from_warehouse:warehouses!from_warehouse_id(name, code),
        to_warehouse:warehouses!to_warehouse_id(name, code)
      `)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error listing transfers:', error);
        // Return empty array if table doesn't exist yet to avoid crashing UI
        if (error.code === '42P01') return NextResponse.json([]);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create transfer order
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { date, from_warehouse_id, to_warehouse_id, line_items, notes } = body;

        if (!from_warehouse_id || !to_warehouse_id || !line_items?.length) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const supabase = createServerClient();
        const zohoClient = createZohoBooksClient();

        if (!zohoClient) {
            return NextResponse.json({ error: 'Zoho client not configured' }, { status: 500 });
        }

        // 1. Get Zoho IDs for warehouses
        const { data: warehouses } = await supabase
            .from('warehouses')
            .select('id, zoho_warehouse_id')
            .in('id', [from_warehouse_id, to_warehouse_id]);

        const fromWh = warehouses?.find(w => w.id === from_warehouse_id);
        const toWh = warehouses?.find(w => w.id === to_warehouse_id);

        if (!fromWh?.zoho_warehouse_id || !toWh?.zoho_warehouse_id) {
            return NextResponse.json({ error: 'Warehouses not synced with Zoho' }, { status: 400 });
        }

        // 2. Prepare Zoho Payload
        const zohoPayload = {
            date,
            from_location_id: fromWh.zoho_warehouse_id,
            to_location_id: toWh.zoho_warehouse_id,
            line_items: line_items.map((item: any) => ({
                item_id: item.zoho_item_id, // Must be Zoho Item ID
                quantity_transfer: item.quantity,
                unit: 'qty' // Simplified
            })),
            is_intransit_order: true // Important for 2-step flow
        };

        // 3. Create in Zoho
        console.log('Creates transfer in Zoho:', JSON.stringify(zohoPayload));
        const zohoRes = await zohoClient.createTransferOrder(zohoPayload);

        if (zohoRes.code !== 0) {
            throw new Error(`Zoho Error: ${zohoRes.message}`);
        }

        const zohoTransfer = zohoRes.transfer_order;

        // 4. Save to Supabase
        const { data: inserted, error: dbError } = await supabase
            .from('transfer_orders')
            .insert({
                zoho_transfer_order_id: zohoTransfer.transfer_order_id,
                transfer_order_number: zohoTransfer.transfer_order_number,
                date,
                from_warehouse_id,
                to_warehouse_id,
                status: 'in_transit',
                line_items,
                notes,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (dbError) {
            console.error('Error saving to DB:', dbError);
            // We don't rollback Zoho (complex), just return warning? 
            // Or throw.
            return NextResponse.json({ warning: 'Created in Zoho but failed to save locally', zohoTransfer }, { status: 200 });
        }

        return NextResponse.json(inserted);

    } catch (error: any) {
        console.error('Error creating transfer:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
