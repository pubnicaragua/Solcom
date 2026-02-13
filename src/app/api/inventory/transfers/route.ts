import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function normalizeQty(line: any): number {
  const value = line?.quantity ?? line?.quantity_transfer ?? line?.qty ?? 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function missingNotesColumn(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return message.includes("could not find the 'notes' column of 'transfer_orders'");
}

export async function GET() {
  try {
    const supabase = createServerClient();

    const selectWithNotes = `
        id,
        transfer_order_number,
        date,
        status,
        notes,
        line_items,
        created_at,
        received_at,
        from_warehouse:warehouses!transfer_orders_from_warehouse_id_fkey(code, name),
        to_warehouse:warehouses!transfer_orders_to_warehouse_id_fkey(code, name)
      `;

    const selectWithoutNotes = `
        id,
        transfer_order_number,
        date,
        status,
        line_items,
        created_at,
        received_at,
        from_warehouse:warehouses!transfer_orders_from_warehouse_id_fkey(code, name),
        to_warehouse:warehouses!transfer_orders_to_warehouse_id_fkey(code, name)
      `;

    let { data, error } = await supabase
      .from('transfer_orders')
      .select(selectWithNotes)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error && missingNotesColumn(error)) {
      const retry = await supabase
        .from('transfer_orders')
        .select(selectWithoutNotes)
        .order('created_at', { ascending: false })
        .limit(200);
      data = retry.data as any;
      error = retry.error as any;
    }

    if (error) {
      throw error;
    }

    const rows: any[] = [];
    for (const transfer of data || []) {
      const lineItems = Array.isArray(transfer.line_items) ? transfer.line_items : [];
      if (lineItems.length === 0) {
        rows.push({
          id: transfer.id,
          quantity: 0,
          reason: transfer.notes || null,
          status: transfer.status || null,
          created_at: transfer.created_at,
          item_name: 'Sin detalle',
          sku: '—',
          from_code: transfer.from_warehouse?.code || '—',
          from_name: transfer.from_warehouse?.name || 'Origen desconocido',
          to_code: transfer.to_warehouse?.code || '—',
          to_name: transfer.to_warehouse?.name || 'Destino desconocido',
        });
        continue;
      }

      for (let idx = 0; idx < lineItems.length; idx += 1) {
        const line: any = lineItems[idx] || {};
        rows.push({
          id: `${transfer.id}:${idx}`,
          quantity: normalizeQty(line),
          reason: transfer.notes || null,
          status: transfer.status || null,
          created_at: transfer.created_at,
          item_name: line?.name || line?.item_name || 'Producto',
          sku: line?.sku || '—',
          from_code: transfer.from_warehouse?.code || '—',
          from_name: transfer.from_warehouse?.name || 'Origen desconocido',
          to_code: transfer.to_warehouse?.code || '—',
          to_name: transfer.to_warehouse?.name || 'Destino desconocido',
        });
      }
    }

    return NextResponse.json({
      data: rows,
    });
  } catch (error) {
    console.error('Transfers error:', error);
    return NextResponse.json(
      { error: 'Error al obtener transferencias', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
