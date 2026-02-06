import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { productId, warehouseId, quantity } = await request.json();

    if (!productId || !warehouseId || quantity === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (quantity < 0) {
      return NextResponse.json(
        { error: 'Quantity cannot be negative' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data: existingSnapshot } = await supabase
      .from('stock_snapshots')
      .select('id')
      .eq('item_id', productId)
      .eq('warehouse_id', warehouseId)
      .single();

    if (existingSnapshot) {
      const { error } = await supabase
        .from('stock_snapshots')
        .update({
          qty: quantity,
          synced_at: new Date().toISOString(),
        })
        .eq('id', existingSnapshot.id);

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
    } else {
      const { error } = await supabase
        .from('stock_snapshots')
        .insert({
          item_id: productId,
          warehouse_id: warehouseId,
          qty: quantity,
          synced_at: new Date().toISOString(),
        });

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
