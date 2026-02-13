import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { createZohoBooksClient } from '@/lib/zoho/books-client';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function isMissingRelationError(error: any): boolean {
  return String(error?.code || '') === '42P01';
}

function isRlsOrPermissionError(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42501' || message.includes('row-level security') || message.includes('permission denied');
}

function isUpsertConstraintError(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P10' || message.includes('no unique or exclusion constraint');
}

function createServiceClientIfAvailable() {
  if (!supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
}

function sanitizeZohoName(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

async function persistTransferOrder(
  supabase: any,
  payload: any
): Promise<{ data: any | null; error: any | null }> {
  const upsertResult = await supabase
    .from('transfer_orders')
    .upsert(payload, { onConflict: 'zoho_transfer_order_id' })
    .select()
    .single();

  if (!upsertResult.error) {
    return { data: upsertResult.data, error: null };
  }

  if (!isUpsertConstraintError(upsertResult.error)) {
    return { data: null, error: upsertResult.error };
  }

  const { data: existing, error: selectError } = await supabase
    .from('transfer_orders')
    .select('id')
    .eq('zoho_transfer_order_id', payload.zoho_transfer_order_id)
    .maybeSingle();

  if (selectError) {
    return { data: null, error: selectError };
  }

  if (existing?.id) {
    const updateResult = await supabase
      .from('transfer_orders')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    return { data: updateResult.data || null, error: updateResult.error || null };
  }

  const insertResult = await supabase
    .from('transfer_orders')
    .insert(payload)
    .select()
    .single();
  return { data: insertResult.data || null, error: insertResult.error || null };
}

function normalizeSerialInput(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? '').trim())
      .filter(Boolean)
      .join(',');
  }
  return String(value ?? '')
    .replace(/[\n;]/g, ',')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(',');
}

function serialArray(serialNumberValue?: string): string[] {
  if (!serialNumberValue) return [];
  return serialNumberValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function serialCount(serialNumberValue?: string): number {
  return serialArray(serialNumberValue).length;
}

function extractLocationSerials(location: any): string[] {
  const raw = location?.serial_numbers;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((entry: any) => {
        if (typeof entry === 'string') return entry.trim();
        return String(
          entry?.serial_number ??
          entry?.serial_number_formatted ??
          entry?.serial ??
          ''
        ).trim();
      })
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function isSerialTracked(detail: any): boolean {
  return Boolean(
    detail?.track_serial_number ??
    detail?.is_serial_number_tracking_enabled ??
    detail?.is_serial_number_enabled ??
    detail?.is_serial_number
  );
}

async function getAvailableInOrigin(
  supabase: any,
  warehouseId: string,
  itemId: string
): Promise<number> {
  try {
    const { data, error } = await (supabase.from as any)('inventory_balance')
      .select('qty_on_hand')
      .eq('warehouse_id', warehouseId)
      .eq('item_id', itemId)
      .maybeSingle();

    if (!error) return Number(data?.qty_on_hand ?? 0);
    if (!isMissingRelationError(error)) throw error;
  } catch (error) {
    console.warn('[inventory/transfer] inventory_balance unavailable, fallback snapshots', error);
  }

  const { data: snapRows, error: snapError } = await supabase
    .from('stock_snapshots')
    .select('qty, synced_at')
    .eq('warehouse_id', warehouseId)
    .eq('item_id', itemId)
    .order('synced_at', { ascending: false })
    .limit(1);

  if (snapError) throw snapError;
  return Number(snapRows?.[0]?.qty ?? 0);
}

export async function POST(request: Request) {
  try {
    const {
      item_id,
      from_warehouse_id,
      to_warehouse_id,
      quantity,
      reason,
      serial_number_value,
      serial_numbers,
      serials,
    } = await request.json();

    if (!item_id || !from_warehouse_id || !to_warehouse_id || !quantity) {
      return NextResponse.json(
        { error: 'Datos inválidos o incompletos' },
        { status: 400 }
      );
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { error: 'La cantidad debe ser mayor a 0' },
        { status: 400 }
      );
    }
    const normalizedSerials = normalizeSerialInput(serial_number_value ?? serial_numbers ?? serials);
    const normalizedSerialCount = serialCount(normalizedSerials);
    if (normalizedSerialCount > 0 && normalizedSerialCount !== qty) {
      return NextResponse.json(
        { error: `Seriales inválidos: cantidad=${qty}, seriales=${normalizedSerialCount}` },
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
    const zohoClient = createZohoBooksClient();

    if (!zohoClient) {
      return NextResponse.json({ error: 'Zoho client no configurado' }, { status: 500 });
    }

    // 1) Validate warehouses + item
    const [{ data: warehouses, error: whError }, { data: item, error: itemError }] = await Promise.all([
      supabase
        .from('warehouses')
        .select('id, code, name, zoho_warehouse_id')
        .in('id', [from_warehouse_id, to_warehouse_id]),
      supabase
        .from('items')
        .select('id, name, sku, zoho_item_id')
        .eq('id', item_id)
        .maybeSingle(),
    ]);

    if (whError) {
      return NextResponse.json({ error: whError.message }, { status: 500 });
    }
    if (itemError || !item) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }
    if (!item.zoho_item_id) {
      return NextResponse.json({ error: 'El producto no tiene zoho_item_id' }, { status: 400 });
    }

    const fromWh = (warehouses || []).find((w: any) => w.id === from_warehouse_id);
    const toWh = (warehouses || []).find((w: any) => w.id === to_warehouse_id);

    if (!fromWh?.zoho_warehouse_id || !toWh?.zoho_warehouse_id) {
      return NextResponse.json({ error: 'Bodegas no mapeadas en Zoho' }, { status: 400 });
    }

    // 2) Validate available stock in source warehouse
    const available = await getAvailableInOrigin(supabase, from_warehouse_id, item_id);
    if (qty > available) {
      return NextResponse.json(
        { error: `Stock insuficiente en origen. Disponible ${available}, solicitado ${qty}` },
        { status: 400 }
      );
    }

    // 3) Create transfer order in Zoho
    let zohoItemName = sanitizeZohoName(item.name || item.sku || item.id || 'ITEM');
    let zohoItemUnit = '';
    let zohoSerialTracked = false;
    try {
      const detail = await zohoClient.getItemDetails(String(item.zoho_item_id));
      if (detail?.name) {
        zohoItemName = sanitizeZohoName(detail.name);
      }
      if (detail?.unit) {
        zohoItemUnit = sanitizeZohoName(detail.unit);
      }
      zohoSerialTracked = isSerialTracked(detail);
    } catch (error) {
      console.warn(`[inventory/transfer] getItemDetails failed for ${item.zoho_item_id}`, error);
    }

    if ((zohoSerialTracked || normalizedSerialCount > 0) && normalizedSerialCount !== qty) {
      return NextResponse.json(
        { error: `El item requiere seriales válidos. Debes enviar ${qty} serial(es).` },
        { status: 400 }
      );
    }

    if (normalizedSerialCount > 0) {
      try {
        const getItemLocationDetails = (zohoClient as any).getItemLocationDetails;
        if (typeof getItemLocationDetails !== 'function') {
          console.warn('[inventory/transfer] getItemLocationDetails not available in client, skipping serial-location validation');
        } else {
          const locations = await getItemLocationDetails.call(zohoClient, String(item.zoho_item_id));
        const sourceLocation = (locations || []).find(
          (loc: any) => String(loc?.location_id) === String(fromWh.zoho_warehouse_id)
        );
        const availableSerials = extractLocationSerials(sourceLocation);
        if (availableSerials.length > 0) {
          const missing = serialArray(normalizedSerials).filter((serial) => !availableSerials.includes(serial));
          if (missing.length > 0) {
            return NextResponse.json(
              { error: `Serial(es) no disponibles en bodega origen: ${missing.join(', ')}` },
              { status: 400 }
            );
          }
        }
        }
      } catch (error) {
        console.warn(`[inventory/transfer] serial validation skipped for ${item.zoho_item_id}`, error);
      }
    }

    const lineItem: any = {
      item_id: item.zoho_item_id,
      name: zohoItemName,
      quantity_transfer: qty,
    };
    if (zohoItemUnit) {
      lineItem.unit = zohoItemUnit;
    }
    if (normalizedSerials) {
      // Zoho endpoints vary by module/version. Send both forms.
      lineItem.serial_number_value = normalizedSerials;
      lineItem.serial_numbers = serialArray(normalizedSerials);
    }

    const zohoPayload = {
      date: new Date().toISOString().slice(0, 10),
      from_location_id: fromWh.zoho_warehouse_id,
      to_location_id: toWh.zoho_warehouse_id,
      line_items: [lineItem],
      is_intransit_order: true,
    };

    const zohoRes = await zohoClient.createTransferOrder(zohoPayload);
    if (zohoRes.code !== 0 || !zohoRes.transfer_order) {
      return NextResponse.json({ error: zohoRes.message || 'Error creando transferencia en Zoho' }, { status: 500 });
    }

    const zohoTransfer = zohoRes.transfer_order;

    // 4) Persist transfer order locally (will be updated by webhook too)
    const lineItems = [
      {
        local_item_id: item.id,
        zoho_item_id: item.zoho_item_id,
        name: item.name,
        sku: item.sku,
        quantity: qty,
        serial_number_value: normalizedSerials || null,
      },
    ];

    const localPayload = {
      zoho_transfer_order_id: zohoTransfer.transfer_order_id,
      transfer_order_number: zohoTransfer.transfer_order_number,
      date: zohoTransfer.date || new Date().toISOString().slice(0, 10),
      from_warehouse_id,
      to_warehouse_id,
      status: zohoTransfer.status || 'in_transit',
      line_items: lineItems,
    };

    let { data: transferRow, error: insertError } = await persistTransferOrder(supabase, localPayload);

    if (insertError && isRlsOrPermissionError(insertError)) {
      const admin = createServiceClientIfAvailable();
      if (admin) {
        const retry = await persistTransferOrder(admin, localPayload);
        transferRow = retry.data;
        insertError = retry.error;
      }
    }

    if (insertError) {
      if (isRlsOrPermissionError(insertError)) {
        return NextResponse.json(
          {
            success: true,
            local_saved: false,
            warning: 'Transferencia creada en Zoho. Guardado local bloqueado por RLS.',
            transfer_id: null,
            zoho_transfer_order_id: zohoTransfer.transfer_order_id,
            transfer_order_number: zohoTransfer.transfer_order_number,
            status: zohoTransfer.status || 'in_transit',
          }
        );
      }
      return NextResponse.json(
        {
          error: 'Transferencia creada en Zoho pero falló guardado local',
          details: insertError.message,
          code: insertError.code || null,
          zoho_transfer: zohoTransfer,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      transfer_id: transferRow?.id || null,
      zoho_transfer_order_id: zohoTransfer.transfer_order_id,
      transfer_order_number: zohoTransfer.transfer_order_number,
      status: zohoTransfer.status || 'in_transit',
      message: 'Transferencia creada en Zoho y registrada en ERP (en tránsito).',
    });
  } catch (error: any) {
    console.error('Transfer error:', error);
    const rawMessage = String(error?.message || '');
    if (rawMessage.includes('"code":2205') || rawMessage.toLowerCase().includes('número de serie')) {
      return NextResponse.json(
        {
          error: 'Serial inválido o no disponible en la bodega origen. Usa seriales existentes en Zoho y uno por unidad.',
          details: rawMessage,
          code: 2205,
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error?.message || 'Unknown' },
      { status: 500 }
    );
  }
}
