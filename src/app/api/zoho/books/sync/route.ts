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
        let itemsProcessed = 0;

        for (const zohoItem of zohoItems) {
            // En Zoho Books, los items no tienen WarehouseCode directo por defecto 
            // como en Creator (depende de la configuración). 
            // Por ahora usaremos una bodega por defecto 'MAIN' o la primera que encontremos.
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

            if (!warehouseId) continue;

            let itemId: string | null = null;

            const itemQuery: any = await supabase
                .from('items')
                .select('id')
                .eq('sku', zohoItem.sku)
                .single();

            if (itemQuery.data) {
                itemId = itemQuery.data.id;
            } else {
                const { data: newItem }: any = await supabase
                    .from('items')
                    .insert({
                        sku: zohoItem.sku,
                        name: zohoItem.name,
                        zoho_item_id: zohoItem.item_id,
                    } as any)
                    .select('id')
                    .single();

                itemId = newItem?.id ?? null;
            }

            if (!itemId) continue;

            await supabase.from('stock_snapshots').insert({
                warehouse_id: warehouseId,
                item_id: itemId,
                qty: zohoItem.stock_on_hand,
                source_ts: zohoItem.last_modified_time,
                synced_at: new Date().toISOString(),
            } as any);

            itemsProcessed++;
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