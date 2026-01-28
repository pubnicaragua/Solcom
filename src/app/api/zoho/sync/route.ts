import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { syncRequestSchema } from '@/lib/validators/inventory';

const MOCK_DATA = [
  { ItemID: 'ITEM001', SKU: 'SKU-001', Name: 'Laptop Dell Inspiron 15', Color: 'Negro', State: 'nuevo', WarehouseCode: 'X1', Quantity: 15, LastUpdated: new Date().toISOString() },
  { ItemID: 'ITEM002', SKU: 'SKU-002', Name: 'Monitor LG 24"', Color: 'Gris', State: 'nuevo', WarehouseCode: 'X1', Quantity: 8, LastUpdated: new Date().toISOString() },
  { ItemID: 'ITEM003', SKU: 'SKU-003', Name: 'Teclado Logitech', Color: 'Negro', State: 'nuevo', WarehouseCode: 'X4', Quantity: 25, LastUpdated: new Date().toISOString() },
  { ItemID: 'ITEM004', SKU: 'SKU-004', Name: 'Mouse Inalámbrico', Color: 'Blanco', State: 'nuevo', WarehouseCode: 'X4', Quantity: 30, LastUpdated: new Date().toISOString() },
  { ItemID: 'ITEM005', SKU: 'SKU-005', Name: 'Impresora HP LaserJet', Color: null, State: 'usado', WarehouseCode: 'X5', Quantity: 3, LastUpdated: new Date().toISOString() },
  { ItemID: 'ITEM006', SKU: 'SKU-006', Name: 'Router TP-Link', Color: 'Negro', State: 'nuevo', WarehouseCode: 'X5', Quantity: 12, LastUpdated: new Date().toISOString() },
  { ItemID: 'ITEM007', SKU: 'SKU-007', Name: 'Webcam Logitech C920', Color: 'Negro', State: 'nuevo', WarehouseCode: 'X1', Quantity: 6, LastUpdated: new Date().toISOString() },
  { ItemID: 'ITEM008', SKU: 'SKU-008', Name: 'Auriculares Sony', Color: 'Azul', State: 'nuevo', WarehouseCode: 'X4', Quantity: 18, LastUpdated: new Date().toISOString() },
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = syncRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    let itemsProcessed = 0;

    for (const zohoItem of MOCK_DATA) {
      let warehouse: any = await supabase
        .from('warehouses')
        .select('id')
        .eq('code', zohoItem.WarehouseCode)
        .single();

      if (!warehouse.data) {
        const { data: newWarehouse } = await supabase
          .from('warehouses')
          .insert({
            code: zohoItem.WarehouseCode,
            name: `Bodega ${zohoItem.WarehouseCode}`,
            active: true,
          } as any)
          .select()
          .single();

        warehouse = { data: newWarehouse, error: null } as any;
      }

      if (!warehouse.data) continue;

      let item: any = await supabase
        .from('items')
        .select('id')
        .eq('sku', zohoItem.SKU)
        .single();

      if (!item.data) {
        const { data: newItem } = await supabase
          .from('items')
          .insert({
            sku: zohoItem.SKU,
            name: zohoItem.Name,
            color: zohoItem.Color,
            state: zohoItem.State,
            zoho_item_id: zohoItem.ItemID,
          } as any)
          .select()
          .single();

        item = { data: newItem, error: null } as any;
      }

      if (!item.data) continue;

      await supabase.from('stock_snapshots').insert({
        warehouse_id: warehouse.data.id,
        item_id: item.data.id,
        qty: zohoItem.Quantity,
        source_ts: zohoItem.LastUpdated,
        synced_at: new Date().toISOString(),
      } as any);

      itemsProcessed++;
    }

    return NextResponse.json({
      success: true,
      itemsProcessed,
      message: `Sincronización completada: ${itemsProcessed} items procesados`,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Error en sincronización', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
