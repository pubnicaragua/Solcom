import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = createServerClient();

        // 1. Total items
        const { count: total, error: countError } = await supabase
            .from('items')
            .select('*', { count: 'exact', head: true });

        // 2. Buscar duplicados por SKU
        const { data: duplicateSkus, error: skuError } = await supabase.rpc('detect_duplicate_skus'); // Si existiera la función RPC, pero mejor lo hago manual con JS por ahora si no puedo crear funciones

        // Como no puedo crear funciones RPC fácilmente sin migraciones, traeré items sospechosos
        // Traer todos los items (solo ID y SKU) para analizar en memoria (si son 1563 es manejable)
        const { data: allItems, error: itemsError } = await supabase
            .from('items')
            .select('id, sku, zoho_item_id, name, stock_total')
            .order('sku');

        if (itemsError) throw itemsError;

        const skuMap = new Map<string, any>();
        const zohoIdMap = new Map<string, any>();
        const duplicates: any[] = [];
        const itemsWithoutZohoId: any[] = [];

        // Analizar duplicados
        (allItems || []).forEach(item => {
            // Chequear SKU duplicado
            const sku = item.sku || 'UNKNOWN';
            if (skuMap.has(sku)) {
                duplicates.push({
                    type: 'DUPLICATE_SKU',
                    sku: sku,
                    items: [skuMap.get(sku), item]
                });
            } else {
                skuMap.set(sku, item);
            }

            // Chequear Zoho ID duplicado
            if (item.zoho_item_id) {
                if (zohoIdMap.has(item.zoho_item_id)) {
                    duplicates.push({
                        type: 'DUPLICATE_ZOHO_ID',
                        zoho_id: item.zoho_item_id,
                        items: [zohoIdMap.get(item.zoho_item_id), item]
                    });
                } else {
                    zohoIdMap.set(item.zoho_item_id, item);
                }
            } else {
                itemsWithoutZohoId.push(item);
            }
        });

        return NextResponse.json({
            total_in_db: total,
            total_fetched: allItems?.length,
            duplicates_found: duplicates.length,
            items_without_zoho_id: itemsWithoutZohoId.length,
            duplicates,
            items_without_zoho_id_list: itemsWithoutZohoId
        });

    } catch (error) {
        return NextResponse.json(
            { error: 'Error en diagnóstico', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
