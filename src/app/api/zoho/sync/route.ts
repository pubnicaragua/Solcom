import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { syncRequestSchema } from '@/lib/validators/inventory';

export const dynamic = 'force-dynamic';

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

    const zohoClient = createZohoBooksClient();
    if (!zohoClient) {
      return NextResponse.json(
        { error: 'Configuración de Zoho Books incompleta' },
        { status: 500 }
      );
    }

    const supabase = createServerClient();

    // 1. Fetch ALL data first (Parallel)
    const [zohoItems, { data: dbItems }, { data: dbWarehouses }] = await Promise.all([
      zohoClient.fetchItems(),
      supabase.from('items').select('id, sku, zoho_item_id'),
      supabase.from('warehouses').select('id, code')
    ]);

    if (!zohoItems?.length) {
      return NextResponse.json({ success: true, message: 'No items found in Zoho.', itemsProcessed: 0 });
    }

    // 2. Map existing data for quick lookup
    const itemMap = new Map(dbItems?.map((i: any) => [i.sku, i.id]));
    const warehouseMap = new Map(dbWarehouses?.map((w: any) => [w.code, w.id]));

    // Ensure default warehouse exists
    const defaultWarehouseCode = 'X1';
    let defaultWarehouseId = warehouseMap.get(defaultWarehouseCode);

    if (!defaultWarehouseId) {
      const { data: newWh } = await supabase.from('warehouses').insert({
        code: defaultWarehouseCode,
        name: `Bodega ${defaultWarehouseCode}`,
        active: true,
      }).select('id').single();
      if (newWh) defaultWarehouseId = newWh.id;
    }

    if (!defaultWarehouseId) throw new Error('Could not resolve Default Warehouse');

    // 3. Prepare Bulk Upserts for Items
    const itemsToUpsert = zohoItems.map((zItem: any) => ({
      sku: zItem.sku,
      name: zItem.name,
      purchase_rate: zItem.purchase_rate || 0,
      price: zItem.rate || 0,
      zoho_item_id: zItem.item_id,
      updated_at: new Date().toISOString()
    }));

    // Upsert items in batches of 1000
    for (let i = 0; i < itemsToUpsert.length; i += 1000) {
      const batch = itemsToUpsert.slice(i, i + 1000);
      const { error } = await supabase.from('items').upsert(batch, { onConflict: 'sku' });
      if (error) console.error('Error upserting items batch:', error);
    }

    // 4. Re-fetch items to get new IDs after upsert
    const { data: refreshedItems } = await supabase.from('items').select('id, sku');
    const finalItemMap = new Map(refreshedItems?.map((i: any) => [i.sku, i.id]));

    // 5. Prepare Bulk Snapshots
    const snapshotsToInsert: any[] = [];
    const itemIdsToClean: string[] = [];

    for (const zItem of zohoItems) {
      const itemId = finalItemMap.get(zItem.sku);
      if (!itemId) continue;

      itemIdsToClean.push(itemId);

      snapshotsToInsert.push({
        warehouse_id: defaultWarehouseId,
        item_id: itemId,
        qty: zItem.available_stock ?? zItem.actual_available_stock ?? zItem.stock_on_hand,
        source_ts: zItem.last_modified_time,
        synced_at: new Date().toISOString(),
      });
    }

    // 6. Bulk Delete old snapshots (in batches)
    // Deleting by item_id is safer than truncating connection-wide if we run in parallel mostly
    // Ideally we'd use a transaction, but Supabase HTTP/JS client doesn't support it easily.
    // Instead of deleting 1-by-1, we delete where item_id in large list.

    // Optimized: If we are doing a FULL sync, maybe just wipe the table? 
    // User already has a reset tool. Let's try to be safe but fast.
    // Chunk distinct item IDs to delete
    const distinctItemIds = [...new Set(itemIdsToClean)];
    for (let i = 0; i < distinctItemIds.length; i += 1000) {
      const batch = distinctItemIds.slice(i, i + 1000);
      await supabase.from('stock_snapshots').delete().in('item_id', batch);
    }

    // 7. Bulk Insert (in batches)
    let opsCount = 0;
    for (let i = 0; i < snapshotsToInsert.length; i += 1000) {
      const batch = snapshotsToInsert.slice(i, i + 1000);
      const { error } = await supabase.from('stock_snapshots').insert(batch);
      if (!error) opsCount += batch.length;
      else console.error('Error inserting snapshots batch:', error);
    }

    return NextResponse.json({
      success: true,
      itemsProcessed: opsCount,
      message: `Sincronización OPTIMIZADA completada: ${opsCount} snapshots generados`,
    });

  } catch (error) {
    console.error('Zoho Books sync error:', error);
    return NextResponse.json(
      { error: 'Error en sincronización', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}