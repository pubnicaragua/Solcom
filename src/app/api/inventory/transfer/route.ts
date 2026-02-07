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

    // 1. Transferir stock en Supabase (funcion SQL transaccional)
    const { data: transferId, error: transferError } = await (supabase.rpc as any)('transfer_stock', {
      p_item_id: item_id,
      p_from_warehouse_id: from_warehouse_id,
      p_to_warehouse_id: to_warehouse_id,
      p_quantity: quantity,
      p_reason: reason || null
    });

    if (transferError) {
      return NextResponse.json(
        { error: transferError.message || 'Error en transferencia' },
        { status: 400 }
      );
    }

    // 2. Sincronizar con Zoho Books
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
      transfer_id: transferId,
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
