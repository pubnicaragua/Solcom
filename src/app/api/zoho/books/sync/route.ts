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
            const missing = [];
            if (!process.env.ZOHO_BOOKS_CLIENT_ID) missing.push('ZOHO_BOOKS_CLIENT_ID');
            if (!process.env.ZOHO_BOOKS_CLIENT_SECRET) missing.push('ZOHO_BOOKS_CLIENT_SECRET');
            if (!process.env.ZOHO_BOOKS_REFRESH_TOKEN) missing.push('ZOHO_BOOKS_REFRESH_TOKEN');
            if (!process.env.ZOHO_BOOKS_ORGANIZATION_ID) missing.push('ZOHO_BOOKS_ORGANIZATION_ID');

            return NextResponse.json(
                { error: 'Configuración de Zoho Books incompleta', missing },
                { status: 500 }
            );
        }


        const supabase = createServerClient();
        const zohoItems = await zohoClient.fetchItems();
        console.log(`[SYNC] Total Zoho Items fetched: ${zohoItems.length}`);

        const defaultWarehouseCode = 'X1';
        let warehouseId: string | null = null;


        const warehouseQuery: any = await supabase
            .from('warehouses')
            .select('id')
            .eq('code', defaultWarehouseCode)
            .single();

        if (warehouseQuery.data) {
            warehouseId = warehouseQuery.data.id;
        } else {
            const { data: newWarehouse }: any = await supabase
                .from('warehouses')
                .insert({
                    code: defaultWarehouseCode,
                    name: `Bodega ${defaultWarehouseCode}`,
                    active: true,
                } as any)
                .select('id')
                .single();
            warehouseId = newWarehouse?.id ?? null;
        }

        if (!warehouseId) {
            throw new Error("No se pudo obtener la bodega por defecto");
        }


        const BATCH_SIZE = 100;
        let itemsProcessed = 0;

        for (let i = 0; i < zohoItems.length; i += BATCH_SIZE) {
            const batch = zohoItems.slice(i, i + BATCH_SIZE);
            const batchSkus = batch.map(item => item.sku || `NO-SKU-${item.item_id}`);


            const { data: existingItems } = await supabase
                .from('items')
                .select('id, sku')
                .in('sku', batchSkus);

            const existingMap = new Map((existingItems || []).map(item => [item.sku, item.id]));

            const toInsert: any[] = [];
            const toUpdate: { id: string; name: string; category: string | null; color: string | null; state: string | null; marca: string | null }[] = [];

            for (const zItem of batch) {
                const sku = zItem.sku || `NO-SKU-${zItem.item_id}`;
                const existingId = existingMap.get(sku);


                const brandValue = zItem.brand || (zItem as any).cf_marca || (zItem as any).cf_Marca || null;

                const itemData = {
                    name: zItem.name,
                    category: zItem.category_name || null,
                    color: (zItem as any).cf_color || null,
                    state: (zItem as any).cf_estado || null,
                    marca: brandValue,
                };

                if (existingId) {
                    toUpdate.push({ id: existingId, ...itemData });
                } else {
                    toInsert.push({
                        sku,
                        zoho_item_id: zItem.item_id,
                        ...itemData,
                    });
                }
            }

            // Insert new items
            if (toInsert.length > 0) {
                const { data: newItems } = await supabase
                    .from('items')
                    .insert(toInsert)
                    .select('id, sku');

                if (newItems) {
                    newItems.forEach(item => existingMap.set(item.sku, item.id));
                }
            }

            // Update existing items with color, state, and brand
            for (const item of toUpdate) {
                await supabase
                    .from('items')
                    .update({
                        name: item.name,
                        category: item.category,
                        color: item.color,
                        state: item.state,
                        marca: item.marca
                    })
                    .eq('id', item.id);
            }


            const snapshotPayload = [];
            for (const zItem of batch) {
                const sku = zItem.sku || `NO-SKU-${zItem.item_id}`;
                const dbId = existingMap.get(sku);
                const qty = zItem.stock_on_hand;

                // Skip items without a valid qty value
                if (dbId && qty !== null && qty !== undefined) {
                    snapshotPayload.push({
                        warehouse_id: warehouseId,
                        item_id: dbId,
                        qty: qty,
                        source_ts: zItem.last_modified_time || new Date().toISOString(),
                        synced_at: new Date().toISOString(),
                    });
                }
            }

            if (snapshotPayload.length > 0) {
                const itemIds = snapshotPayload.map(s => s.item_id);

                await supabase
                    .from('stock_snapshots')
                    .delete()
                    .eq('warehouse_id', warehouseId)
                    .in('item_id', itemIds);

                const { error: snapError } = await supabase
                    .from('stock_snapshots')
                    .insert(snapshotPayload);

                if (!snapError) {
                    itemsProcessed += snapshotPayload.length;
                }
            }

            console.log(`[SYNC] Batch ${i}-${i + batch.length}: ${toInsert.length} new, ${toUpdate.length} existing`);
        }

        return NextResponse.json({
            success: true,
            itemsProcessed,
            message: `Sincronización de Zoho Books completada: ${itemsProcessed} items procesados`,
        });
    } catch (error) {
        console.error('Zoho Books sync error:', error);
        return NextResponse.json(
            { error: 'Error en sincronización de Zoho Books', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}