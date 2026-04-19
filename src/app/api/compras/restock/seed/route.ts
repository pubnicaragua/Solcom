import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: Request) {
  try {
    const { rows } = await request.json(); // Se espera un array con el formato que lanza restock-calculator

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Payload inválido o vacío' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const eventsToInsert: any[] = [];
    const dateNow = new Date();

    // Obtener los items locales mapeados por SKU o Nombre (ya que el excel no tiene IDs de zoho nativos a la mano)
    const skus = rows.map(r => String(r.producto).split(' ')[0]); // asumiendo que el SKU es la primer palabra del título del producto
    const { data: localItems } = await supabase.from('items').select('id, name, sku');
    
    // Conseguir una warehouse genérica
    const { data: warehouses } = await supabase.from('warehouses').select('id').eq('active', true).limit(1);
    const warehouseId = warehouses?.[0]?.id;

    if (!warehouseId) {
        return NextResponse.json({ error: 'No tienes almacenes (warehouses) configurados localmente.' }, { status: 400 });
    }

    let itemsMatched = 0;

    for (const row of rows) {
      // Buscar el ID del item local haciendo match de texto
      const cleanProductName = String(row.producto).trim().toLowerCase();
      
      const localItem = localItems?.find(i => 
        i.sku === cleanProductName || 
        cleanProductName.includes(String(i.sku).toLowerCase()) ||
        cleanProductName === String(i.name).trim().toLowerCase()
      );

      if (localItem && row.restock_promedio_unid > 0) {
        itemsMatched++;
        
        // Vamos a distribuir "artificialmente" el restock total (que es en realidad el promedio x 4 o x 5)
        // El row tiene "restock_promedio_unid". Esto significa que en el mes se vendieron = restock_promedio_unid * 4
        const totalVentasHistoricas = Math.round(row.restock_promedio_unid * 4);
        
        // Simular que esa venta ocurrió hace 15 días para que quede dentro del filtro de las últimas 4 semanas
        const historicalDate = new Date(dateNow);
        historicalDate.setDate(historicalDate.getDate() - 15);

        eventsToInsert.push({
            idempotency_key: `seed-history-${localItem.id}-${Date.now()}`,
            source: 'excel_seed',
            event_type: 'sale',
            item_id: localItem.id,
            warehouse_id: warehouseId,
            qty_delta: -totalVentasHistoricas, // La salida
            payload: { seeder_note: 'Inyectado desde viejo Excel Manual' },
            external_ts: historicalDate.toISOString()
        });
      }
    }

    if (eventsToInsert.length > 0) {
        const { error: insertErr } = await supabase.from('inventory_events').insert(eventsToInsert);
        if (insertErr) {
            console.error('Error insertando eventos históricos:', insertErr);
            return NextResponse.json({ error: 'Falla al inyectar: ' + insertErr.message }, { status: 500 });
        }
    }

    return NextResponse.json({ 
        success: true, 
        message: `Se inyectaron datos históricos para ${itemsMatched} productos. Proyectando ${eventsToInsert.length} ventas falsas hacia el pasado.` 
    });

  } catch (error) {
    console.error('[Seeder] Error general:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
