
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

type RequestedLine = {
    local_item_id: string;
    quantity: number;
    name?: string;
    sku?: string;
    serial_number_value?: string;
};

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

    // Fallback for environments missing unique constraint on zoho_transfer_order_id.
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
        .map((s) => s.trim())
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

async function getOriginStockMap(
    supabase: any,
    warehouseId: string,
    itemIds: string[]
): Promise<Map<string, number>> {
    const uniqueIds = Array.from(new Set(itemIds.filter(Boolean)));
    const stockMap = new Map<string, number>();
    if (uniqueIds.length === 0) return stockMap;

    try {
        const { data, error } = await (supabase.from as any)('inventory_balance')
            .select('item_id, qty_on_hand')
            .eq('warehouse_id', warehouseId)
            .in('item_id', uniqueIds);

        if (!error) {
            for (const row of data || []) {
                stockMap.set(row.item_id, Number(row.qty_on_hand ?? 0));
            }
            for (const id of uniqueIds) {
                if (!stockMap.has(id)) stockMap.set(id, 0);
            }
            return stockMap;
        }
        if (!isMissingRelationError(error)) {
            throw error;
        }
    } catch (error) {
        console.warn('[transfers] inventory_balance check failed, using stock_snapshots fallback', error);
    }

    // Legacy fallback: latest snapshot by item in source warehouse
    const { data: snaps, error: snapError } = await supabase
        .from('stock_snapshots')
        .select('item_id, qty, synced_at')
        .eq('warehouse_id', warehouseId)
        .in('item_id', uniqueIds)
        .order('synced_at', { ascending: false });

    if (snapError) throw snapError;

    for (const snap of snaps || []) {
        if (!stockMap.has(snap.item_id)) {
            stockMap.set(snap.item_id, Number(snap.qty ?? 0));
        }
    }
    for (const id of uniqueIds) {
        if (!stockMap.has(id)) stockMap.set(id, 0);
    }
    return stockMap;
}

// GET: List transfer orders
export async function GET(request: Request) {
    try {
        const supabase = createServerClient();
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        let query = supabase
            .from('transfer_orders')
            .select(`
        *,
        from_warehouse:warehouses!from_warehouse_id(name, code),
        to_warehouse:warehouses!to_warehouse_id(name, code)
      `)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error listing transfers:', error);
        // Return empty array if table doesn't exist yet to avoid crashing UI
        if (error.code === '42P01') return NextResponse.json([]);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create transfer order
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { date, from_warehouse_id, to_warehouse_id, line_items, notes } = body;

        if (!from_warehouse_id || !to_warehouse_id || !line_items?.length) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (from_warehouse_id === to_warehouse_id) {
            return NextResponse.json({ error: 'La bodega origen y destino deben ser distintas' }, { status: 400 });
        }

        const supabase = createServerClient();
        const zohoClient = createZohoBooksClient();

        if (!zohoClient) {
            return NextResponse.json({ error: 'Zoho client not configured' }, { status: 500 });
        }

        // 1. Get Zoho IDs for warehouses
        const { data: warehouses } = await supabase
            .from('warehouses')
            .select('id, zoho_warehouse_id')
            .in('id', [from_warehouse_id, to_warehouse_id]);

        const fromWh = warehouses?.find(w => w.id === from_warehouse_id);
        const toWh = warehouses?.find(w => w.id === to_warehouse_id);

        if (!fromWh?.zoho_warehouse_id || !toWh?.zoho_warehouse_id) {
            return NextResponse.json({ error: 'Warehouses not synced with Zoho' }, { status: 400 });
        }

        // 2. Normalize and validate line items
        const requestedLines: RequestedLine[] = (line_items || []).map((raw: any) => ({
            local_item_id: String(raw?.id || raw?.item_id || '').trim(),
            quantity: Number(raw?.quantity ?? raw?.qty ?? 0),
            name: raw?.name,
            sku: raw?.sku,
            serial_number_value: normalizeSerialInput(
                raw?.serial_number_value ?? raw?.serial_numbers ?? raw?.serials
            ) || undefined,
        })).filter((line: RequestedLine) => line.local_item_id.length > 0);

        if (requestedLines.length === 0) {
            return NextResponse.json({ error: 'No hay productos válidos para transferir' }, { status: 400 });
        }

        for (const line of requestedLines) {
            if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
                return NextResponse.json({ error: `Cantidad inválida para item ${line.local_item_id}` }, { status: 400 });
            }
            const count = serialCount(line.serial_number_value);
            if (count > 0 && count !== line.quantity) {
                return NextResponse.json({
                    error: `Seriales inválidos para ${line.local_item_id}: cantidad=${line.quantity}, seriales=${count}`,
                }, { status: 400 });
            }
        }

        const localItemIds = requestedLines.map((line) => line.local_item_id);
        const { data: itemRows, error: itemError } = await supabase
            .from('items')
            .select('id, name, sku, zoho_item_id')
            .in('id', localItemIds);

        if (itemError) {
            return NextResponse.json({ error: itemError.message }, { status: 500 });
        }

        const itemMap = new Map((itemRows || []).map((item: any) => [item.id, item]));
        const missingItems = requestedLines.filter((line) => !itemMap.has(line.local_item_id));
        if (missingItems.length > 0) {
            return NextResponse.json({ error: `Items no encontrados: ${missingItems.map((x) => x.local_item_id).join(', ')}` }, { status: 400 });
        }

        const stockByItem = await getOriginStockMap(supabase, from_warehouse_id, localItemIds);
        for (const line of requestedLines) {
            const available = Number(stockByItem.get(line.local_item_id) ?? 0);
            if (line.quantity > available) {
                const item = itemMap.get(line.local_item_id);
                return NextResponse.json({
                    error: `Stock insuficiente para ${item?.sku || line.local_item_id}: solicitado ${line.quantity}, disponible ${available}`,
                }, { status: 400 });
            }
        }

        const normalizedLines = requestedLines.map((line) => {
            const item = itemMap.get(line.local_item_id);
            return {
                local_item_id: line.local_item_id,
                zoho_item_id: item?.zoho_item_id || null,
                name: item?.name || line.name || '',
                sku: item?.sku || line.sku || '',
                quantity: line.quantity,
                serial_number_value: line.serial_number_value || null,
            };
        });

        const lineWithoutZoho = normalizedLines.find((line: any) => !line.zoho_item_id);
        if (lineWithoutZoho) {
            return NextResponse.json({
                error: `El producto ${lineWithoutZoho.sku || lineWithoutZoho.local_item_id} no tiene zoho_item_id`,
            }, { status: 400 });
        }

        const zohoMetaByItemId = new Map<string, { name?: string; unit?: string; serialTracked?: boolean }>();
        const uniqueZohoItemIds = Array.from(new Set(normalizedLines.map((line: any) => String(line.zoho_item_id))));
        for (const zohoItemId of uniqueZohoItemIds) {
            try {
                const detail = await zohoClient.getItemDetails(zohoItemId);
                if (detail) {
                    zohoMetaByItemId.set(zohoItemId, {
                        name: detail.name,
                        unit: detail.unit,
                        serialTracked: isSerialTracked(detail),
                    });
                }
            } catch (e) {
                console.warn(`[transfers] Could not load item details for ${zohoItemId}`, e);
            }
        }

        // Validate serial requirements before creating transfer in Zoho.
        for (const line of normalizedLines as any[]) {
            const serials = serialArray(line.serial_number_value || '');
            const meta = zohoMetaByItemId.get(String(line.zoho_item_id));
            if ((meta?.serialTracked || serials.length > 0) && serials.length !== line.quantity) {
                return NextResponse.json({
                    error: `El item ${line.sku || line.local_item_id} requiere seriales válidos. Debes enviar ${line.quantity} serial(es).`,
                }, { status: 400 });
            }
            if (serials.length === 0) continue;

            try {
                const getItemLocationDetails = (zohoClient as any).getItemLocationDetails;
                if (typeof getItemLocationDetails !== 'function') {
                    console.warn('[transfers] getItemLocationDetails not available in client, skipping serial-location validation');
                    continue;
                }
                const locations = await getItemLocationDetails.call(zohoClient, String(line.zoho_item_id));
                const sourceLocation = (locations || []).find(
                    (loc: any) => String(loc?.location_id) === String(fromWh.zoho_warehouse_id)
                );
                const availableSerials = extractLocationSerials(sourceLocation);
                if (availableSerials.length > 0) {
                    const missing = serials.filter((serial) => !availableSerials.includes(serial));
                    if (missing.length > 0) {
                        return NextResponse.json({
                            error: `Serial(es) no disponibles en bodega origen para ${line.sku || line.local_item_id}: ${missing.join(', ')}`,
                        }, { status: 400 });
                    }
                }
            } catch (e) {
                console.warn(`[transfers] Could not validate serial availability for ${line.zoho_item_id}`, e);
            }
        }

        // 3. Prepare Zoho Payload
        const zohoPayload = {
            date: date || new Date().toISOString().slice(0, 10),
            from_location_id: fromWh.zoho_warehouse_id,
            to_location_id: toWh.zoho_warehouse_id,
            line_items: normalizedLines.map((line: any) => {
                const meta = zohoMetaByItemId.get(String(line.zoho_item_id));
                const safeName = sanitizeZohoName(meta?.name || line.name || line.sku || line.local_item_id || 'ITEM');
                const payloadLine: any = {
                    item_id: line.zoho_item_id,
                    name: safeName,
                    quantity_transfer: line.quantity,
                };

                const safeUnit = sanitizeZohoName(meta?.unit || '');
                if (safeUnit) payloadLine.unit = safeUnit;
                if (line.serial_number_value) {
                    // Zoho endpoints vary by module/version. Send both forms.
                    payloadLine.serial_number_value = line.serial_number_value;
                    payloadLine.serial_numbers = serialArray(line.serial_number_value);
                }
                return payloadLine;
            }),
            is_intransit_order: true // Important for 2-step flow
        };

        // 4. Create in Zoho
        console.log('Creates transfer in Zoho:', JSON.stringify(zohoPayload));
        const zohoRes = await zohoClient.createTransferOrder(zohoPayload);

        if (zohoRes.code !== 0) {
            throw new Error(`Zoho Error: ${zohoRes.message}`);
        }

        const zohoTransfer = zohoRes.transfer_order;

        // 5. Save to Supabase
        const insertPayload = {
            zoho_transfer_order_id: zohoTransfer.transfer_order_id,
            transfer_order_number: zohoTransfer.transfer_order_number,
            date: zohoTransfer.date || date || null,
            from_warehouse_id,
            to_warehouse_id,
            status: zohoTransfer.status || 'in_transit',
            line_items: normalizedLines,
            created_at: new Date().toISOString(),
        };

        let { data: inserted, error: dbError } = await persistTransferOrder(supabase, insertPayload);

        if (dbError && isRlsOrPermissionError(dbError)) {
            const admin = createServiceClientIfAvailable();
            if (admin) {
                const retry = await persistTransferOrder(admin, insertPayload);
                inserted = retry.data;
                dbError = retry.error;
            }
        }

        if (dbError) {
            console.error('Error saving to DB:', dbError);
            if (isRlsOrPermissionError(dbError)) {
                return NextResponse.json({
                    success: true,
                    local_saved: false,
                    warning: 'Transferencia creada en Zoho. Guardado local bloqueado por RLS.',
                    transfer_id: null,
                    zoho_transfer_order_id: zohoTransfer.transfer_order_id,
                    transfer_order_number: zohoTransfer.transfer_order_number,
                    status: zohoTransfer.status || 'in_transit',
                });
            }
            return NextResponse.json({
                error: 'Creado en Zoho pero falló guardado local',
                details: dbError.message,
                code: dbError.code || null,
                zohoTransfer,
            }, { status: 500 });
        }

        return NextResponse.json(inserted);

    } catch (error: any) {
        console.error('Error creating transfer:', error);
        const rawMessage = String(error?.message || '');
        if (rawMessage.includes('"code":2205') || rawMessage.toLowerCase().includes('número de serie')) {
            return NextResponse.json({
                error: 'Serial inválido o no disponible en la bodega origen. Usa seriales existentes en Zoho y uno por unidad.',
                details: rawMessage,
                code: 2205,
            }, { status: 400 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
