
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createZohoBooksClient } from '@/lib/zoho/books-client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
    try {
        const { id } = params;
        const supabase = createServerClient();

        // 1. Get transfer from DB
        const { data: transfer, error: fetchError } = await supabase
            .from('transfer_orders')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !transfer) {
            return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
        }

        if (transfer.status === 'received') {
            return NextResponse.json({ error: 'Already received' }, { status: 400 });
        }

        const zohoClient = createZohoBooksClient();
        if (!zohoClient) {
            return NextResponse.json({ error: 'Zoho client not configured' }, { status: 500 });
        }

        // 2. Mark as Received in Zoho
        const zohoRes = await zohoClient.markTransferOrderReceived(transfer.zoho_transfer_order_id, 'receive');

        if (zohoRes.code !== 0) {
            throw new Error(`Zoho Error: ${zohoRes.message}`);
        }

        // 3. Update DB
        const { error: updateError } = await supabase
            .from('transfer_orders')
            .update({
                status: 'received',
                received_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateError) throw updateError;

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error receiving transfer:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
