import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { InventorySyncService } from '@/lib/zoho/inventory-sync';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { item_id, from_warehouse_id, to_warehouse_id, quantity, reason } = await request.json();

    // Validaciones
    if (!item_id || !from_warehouse_id || !to_warehouse_id || !quantity || quantity <= 0) {
      return NextResponse.json(
        { error: 'Datos inválidos o incompletos' },
        { status: 400 }
      );
    }

    if (from_warehouse_id === to_warehouse_id) {
      return NextResponse.json(
        { error: 'Las bodegas de origen y destino deben ser diferentes' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const syncService = new InventorySyncService();

    // 1. Verificar stock disponible en bodega origen
    const { data: fromStock } = await supabase
      .from('stock_snapshots')
      .select('qty')
      .eq('item_id', item_id)
      .eq('warehouse_id', from_warehouse_id)
      .single();

    if (!fromStock || fromStock.qty < quantity) {
      return NextResponse.json(
        { error: 'Stock insuficiente en bodega de origen' },
        { status: 400 }
      );
    }

    // 2. Realizar transferencia en ERP
    const transferResult = await performERPTransfer(
      supabase, 
      item_id, 
      from_warehouse_id, 
      to_warehouse_id, 
      quantity
    );

    if (!transferResult.success) {
      return NextResponse.json(
        { error: 'Error en transferencia ERP', details: transferResult.error },
        { status: 500 }
      );
    }

    // 3. Sincronizar con Zoho Books
    const syncResult = await syncService.syncTransferToZoho({
      item_id,
      from_warehouse_id,
      to_warehouse_id,
      quantity,
      reason: reason || 'Transferencia entre bodegas'
    });

    // 4. Respuesta final
    return NextResponse.json({
      success: true,
      transfer_id: transferResult.transfer_id,
      zoho_sync: syncResult.success,
      zoho_adjustment_id: syncResult.zoho_adjustment_id,
      sync_error: syncResult.error,
      message: syncResult.success 
        ? 'Transferencia completada y sincronizada con Zoho Books'
        : 'Transferencia completada en ERP. Error en sincronización con Zoho Books'
    });

  } catch (error: any) {
    console.error('Transfer error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}

async function performERPTransfer(
  supabase: any,
  item_id: string,
  from_warehouse_id: string,
  to_warehouse_id: string,
  quantity: number
): Promise<{ success: boolean; transfer_id?: string; error?: string }> {
  try {
    // Iniciar transacción
    const { data: transferRecord } = await supabase
      .from('stock_movements')
      .insert({
        item_id,
        from_warehouse_id,
        to_warehouse_id,
        quantity,
        movement_type: 'transfer',
        status: 'completed',
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (!transferRecord) {
      throw new Error('No se pudo crear registro de transferencia');
    }

    // Actualizar stock en bodega origen
    const { error: fromError } = await supabase
      .from('stock_snapshots')
      .update({ 
        qty: supabase.rpc('decrement_stock', { 
          item_id, 
          warehouse_id: from_warehouse_id, 
          decrement_amount: quantity 
        }),
        synced_at: new Date().toISOString()
      })
      .eq('item_id', item_id)
      .eq('warehouse_id', from_warehouse_id);

    if (fromError) throw fromError;

    // Actualizar o crear stock en bodega destino
    const { data: toStock } = await supabase
      .from('stock_snapshots')
      .select('qty')
      .eq('item_id', item_id)
      .eq('warehouse_id', to_warehouse_id)
      .single();

    if (toStock) {
      // Actualizar existente
      const { error: toError } = await supabase
        .from('stock_snapshots')
        .update({ 
          qty: toStock.qty + quantity,
          synced_at: new Date().toISOString()
        })
        .eq('item_id', item_id)
        .eq('warehouse_id', to_warehouse_id);

      if (toError) throw toError;
    } else {
      // Crear nuevo registro
      const { error: createError } = await supabase
        .from('stock_snapshots')
        .insert({
          item_id,
          warehouse_id: to_warehouse_id,
          qty: quantity,
          source_ts: new Date().toISOString(),
          synced_at: new Date().toISOString()
        });

      if (createError) throw createError;
    }

    return {
      success: true,
      transfer_id: transferRecord.id
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}
