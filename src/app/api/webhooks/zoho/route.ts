import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Tipos de eventos que Zoho puede enviar
type ZohoEventType = 'item.created' | 'item.updated' | 'item.deleted' | 'salesorder.created' | 'invoice.created';

interface ZohoWebhookPayload {
    event_type?: string;
    module?: string;
    action?: string;
    data?: {
        item_id?: string;
        sku?: string;
        name?: string;
        stock_on_hand?: number;
        purchase_rate?: number;
        category_name?: string;
        cf_color?: string;
        cf_estado?: string;
        status?: string;
        [key: string]: any;
    };
    [key: string]: any;
}

export async function POST(request: NextRequest) {
    try {
        const payload: ZohoWebhookPayload = await request.json();

        console.log('Zoho Webhook received:', JSON.stringify(payload, null, 2));

        const supabase = createServerClient();

        // Determinar el tipo de evento
        const module = payload.module?.toLowerCase() || '';
        const action = payload.action?.toLowerCase() || payload.event_type?.toLowerCase() || '';
        const data = payload.data || payload;

        // Manejar eventos de Items
        if (module === 'item' || module === 'items') {
            const zohoItemId = data.item_id;

            if (!zohoItemId) {
                return NextResponse.json({ error: 'item_id requerido' }, { status: 400 });
            }

            // Item creado o actualizado
            if (action === 'created' || action === 'updated' || action === 'item.created' || action === 'item.updated') {
                const itemPayload = {
                    sku: data.sku || `NO-SKU-${zohoItemId}`,
                    name: data.name || 'Sin nombre',
                    category: data.category_name || null,
                    color: data.cf_color || null,
                    state: data.cf_estado || null,
                    zoho_item_id: zohoItemId,
                    stock_total: data.stock_on_hand ?? 0,
                    price: data.purchase_rate ?? null,
                };

                // Intentar update primero, si no existe, insertar
                const { data: updated, error: updateError } = await supabase
                    .from('items')
                    .update(itemPayload)
                    .eq('zoho_item_id', zohoItemId)
                    .select('id');

                if (updateError) {
                    console.error('Error updating item:', updateError);
                    return NextResponse.json({ error: updateError.message }, { status: 500 });
                }

                if (!updated || updated.length === 0) {
                    // No existe, insertar nuevo
                    const { error: insertError } = await supabase
                        .from('items')
                        .insert(itemPayload);

                    if (insertError) {
                        console.error('Error inserting item:', insertError);
                        return NextResponse.json({ error: insertError.message }, { status: 500 });
                    }

                    return NextResponse.json({
                        success: true,
                        action: 'inserted',
                        item_id: zohoItemId
                    });
                }

                return NextResponse.json({
                    success: true,
                    action: 'updated',
                    item_id: zohoItemId
                });
            }

            // Item eliminado o desactivado
            if (action === 'deleted' || action === 'item.deleted' || data.status === 'inactive') {
                const { error: deleteError } = await supabase
                    .from('items')
                    .delete()
                    .eq('zoho_item_id', zohoItemId);

                if (deleteError) {
                    console.error('Error deleting item:', deleteError);
                    return NextResponse.json({ error: deleteError.message }, { status: 500 });
                }

                return NextResponse.json({
                    success: true,
                    action: 'deleted',
                    item_id: zohoItemId
                });
            }
        }

        // Manejar eventos de Sales Order / Invoice (actualizar stock)
        if (module === 'salesorder' || module === 'invoice') {
            // Cuando hay una venta, Zoho actualiza el stock automáticamente
            // Podríamos hacer una sync incremental de los items afectados
            const lineItems = data.line_items || [];

            for (const lineItem of lineItems) {
                const zohoItemId = lineItem.item_id;
                if (!zohoItemId) continue;

                // Actualizar solo el stock del item
                const { error } = await supabase
                    .from('items')
                    .update({ stock_total: lineItem.stock_on_hand ?? lineItem.quantity_available })
                    .eq('zoho_item_id', zohoItemId);

                if (error) {
                    console.error(`Error updating stock for item ${zohoItemId}:`, error);
                }
            }

            return NextResponse.json({
                success: true,
                action: 'stock_updated',
                items_affected: lineItems.length
            });
        }

        // Evento no manejado pero recibido correctamente
        return NextResponse.json({
            success: true,
            message: 'Webhook recibido pero no procesado',
            module,
            action
        });

    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json(
            { error: 'Error procesando webhook', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// GET para verificar que el endpoint existe (Zoho a veces hace ping)
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        message: 'Zoho webhook endpoint activo',
        timestamp: new Date().toISOString()
    });
}
