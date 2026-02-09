import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface ZohoItemData {
    item_id?: string;
    sku?: string;
    name?: string;
    stock_on_hand?: number;
    actual_available_stock?: number;
    purchase_rate?: number;
    category_name?: string;
    status?: string;
    custom_field_hash?: {
        cf_color?: string;
        cf_estado?: string;
        [key: string]: any;
    };
    [key: string]: any;
}

interface ZohoWebhookPayload {
    // Zoho puede enviar datos en diferentes formatos
    item?: ZohoItemData;
    data?: ZohoItemData;
    module?: string;
    action?: string;
    event_type?: string;
    [key: string]: any;
}

export async function POST(request: NextRequest) {
    try {
        const payload: ZohoWebhookPayload = await request.json();

        console.log('Zoho Webhook received:', JSON.stringify(payload, null, 2));

        const supabase = createServerClient();

        // Zoho envía los datos del item en payload.item
        const itemData = payload.item || payload.data || payload;

        // Verificar si tenemos datos de un item
        const zohoItemId = itemData.item_id;

        if (!zohoItemId) {
            console.log('No item_id found in payload, skipping...');
            return NextResponse.json({
                success: true,
                message: 'Webhook recibido pero sin item_id',
                received_keys: Object.keys(payload)
            });
        }

        // Extraer campos personalizados
        const customFields = itemData.custom_field_hash || {};
        const cfColor = customFields.cf_color || itemData.cf_color || null;
        const cfEstado = customFields.cf_estado || itemData.cf_estado || null;

        // Preparar payload para Supabase
        const itemPayload = {
            sku: itemData.sku || `NO-SKU-${zohoItemId}`,
            name: itemData.name || 'Sin nombre',
            category: itemData.category_name || null,
            color: cfColor,
            state: cfEstado,
            zoho_item_id: zohoItemId,
            stock_total: itemData.actual_available_stock ?? itemData.stock_on_hand ?? 0,
            price: itemData.purchase_rate ?? null,
        };

        console.log('Processing item:', zohoItemId, 'with payload:', itemPayload);

        // Si el item está inactivo, eliminarlo
        if (itemData.status === 'inactive') {
            const { error: deleteError } = await supabase
                .from('items')
                .delete()
                .eq('zoho_item_id', zohoItemId);

            if (deleteError) {
                console.error('Error deleting item:', deleteError);
                return NextResponse.json({ error: deleteError.message }, { status: 500 });
            }

            console.log('Item deleted:', zohoItemId);
            return NextResponse.json({
                success: true,
                action: 'deleted',
                item_id: zohoItemId
            });
        }

        // Intentar update primero
        const { data: updated, error: updateError } = await supabase
            .from('items')
            .update(itemPayload)
            .eq('zoho_item_id', zohoItemId)
            .select('id');

        if (updateError) {
            console.error('Error updating item:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        if (updated && updated.length > 0) {
            console.log('Item updated:', zohoItemId);
            return NextResponse.json({
                success: true,
                action: 'updated',
                item_id: zohoItemId,
                supabase_id: updated[0].id
            });
        }

        // No existe, insertar nuevo
        const { data: inserted, error: insertError } = await supabase
            .from('items')
            .insert(itemPayload)
            .select('id');

        if (insertError) {
            console.error('Error inserting item:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        console.log('Item inserted:', zohoItemId);
        return NextResponse.json({
            success: true,
            action: 'inserted',
            item_id: zohoItemId,
            supabase_id: inserted?.[0]?.id
        });

    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json(
            { error: 'Error procesando webhook', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// GET para verificar que el endpoint existe
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        message: 'Zoho webhook endpoint activo',
        timestamp: new Date().toISOString()
    });
}
