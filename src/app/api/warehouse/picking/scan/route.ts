import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { getAuthenticatedProfile } from '@/lib/auth/warehouse-permissions';
import { syncSelectedScansToPickItems } from '@/lib/ventas/picking-serials';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function json(body: any, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
    });
}

async function getContext(supabase: any, token: string, userId: string, role: string) {
    const pick = await supabase
        .from('warehouse_pick_orders')
        .select('*')
        .eq('id', token)
        .maybeSingle();
    if (pick.error) throw pick.error;
    if (!pick.data) return { error: json({ error: 'Orden de alistamiento no encontrada.' }, 404) };

    const assigned = normalizeText(pick.data.assigned_user_id);
    if (assigned && assigned !== userId && role !== 'admin' && role !== 'manager') {
        return { error: json({ error: 'Esta orden está asignada a otro usuario de bodega.' }, 403) };
    }

    const items = await supabase
        .from('warehouse_pick_order_items')
        .select('*')
        .eq('pick_order_id', token)
        .order('sort_order', { ascending: true });
    if (items.error) throw items.error;

    const scans = await supabase
        .from('warehouse_pick_serial_scans')
        .select('id, pick_order_item_id, serial_code, scanned_at, scanned_by')
        .eq('pick_order_id', token)
        .order('scanned_at', { ascending: true });
    if (scans.error) throw scans.error;

    const scansByItem = new Map<string, any[]>();
    for (const scan of scans.data || []) {
        const key = normalizeText(scan?.pick_order_item_id);
        const bucket = scansByItem.get(key) || [];
        bucket.push(scan);
        scansByItem.set(key, bucket);
    }

    return {
        pick: pick.data,
        items: (items.data || []).map((item: any) => ({
            ...item,
            scans: scansByItem.get(normalizeText(item.id)) || [],
        })),
    };
}

async function assertSerialAvailable(params: {
    supabase: any;
    pick: any;
    item: any;
    serialCode: string;
}) {
    const itemLookup = await params.supabase
        .from('items')
        .select('id, zoho_item_id, name, sku')
        .eq('id', params.item.item_id)
        .maybeSingle();
    if (itemLookup.error) throw itemLookup.error;
    const zohoItemId = normalizeText(itemLookup.data?.zoho_item_id);
    if (!zohoItemId) throw new Error('El producto no tiene zoho_item_id configurado.');

    const selectedWarehouse = await params.supabase
        .from('warehouses')
        .select('id, parent_warehouse_id')
        .eq('id', params.pick.warehouse_id)
        .maybeSingle();
    if (selectedWarehouse.error) throw selectedWarehouse.error;

    const familyRoot = normalizeText(selectedWarehouse.data?.parent_warehouse_id)
        || normalizeText(selectedWarehouse.data?.id);
    const warehouses = await params.supabase
        .from('warehouses')
        .select('id, zoho_warehouse_id')
        .or(`id.eq.${familyRoot},parent_warehouse_id.eq.${familyRoot}`)
        .eq('active', true);
    if (warehouses.error) throw warehouses.error;

    const zoho = createZohoBooksClient();
    if (!zoho) throw new Error('Configuración de Zoho Books incompleta.');

    for (const warehouse of warehouses.data || []) {
        const locationId = normalizeText(warehouse?.zoho_warehouse_id);
        if (!locationId) continue;
        const response = await zoho.request(
            'GET',
            `/inventory/v1/items/serialnumbers?item_id=${encodeURIComponent(zohoItemId)}&show_transacted_out=false&location_id=${encodeURIComponent(locationId)}`
        );
        const found = (Array.isArray(response?.serial_numbers) ? response.serial_numbers : []).some((entry: any) =>
            normalizeText(entry?.serialnumber) === params.serialCode
            && normalizeText(entry?.status).toLowerCase() === 'active'
        );
        if (found) return;
    }

    throw new Error(`El serial ${params.serialCode} no está disponible para este producto en la familia de bodegas.`);
}

async function readBody(req: NextRequest) {
    try {
        return await req.json();
    } catch {
        return {};
    }
}

export async function GET(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const auth = await getAuthenticatedProfile(supabase);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const token = normalizeText(new URL(req.url).searchParams.get('token'));
        if (!token) return json({ error: 'Falta token de alistamiento.' }, 400);
        const context = await getContext(supabase, token, auth.userId, auth.role);
        if ('error' in context) return context.error;
        return json({ pick_order: context.pick, items: context.items });
    } catch (error: any) {
        return json({ error: error?.message || 'Error interno' }, 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const auth = await getAuthenticatedProfile(supabase);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const body = await readBody(req);
        const token = normalizeText(body?.token);
        const pickOrderItemId = normalizeText(body?.pick_order_item_id);
        const serialCode = normalizeText(body?.serial_code);
        if (!token || !pickOrderItemId || !serialCode) {
            return json({ error: 'Faltan token, línea o serial.' }, 400);
        }

        const context = await getContext(supabase, token, auth.userId, auth.role);
        if ('error' in context) return context.error;
        if (!['claimed', 'picking'].includes(normalizeText(context.pick.status))) {
            return json({ error: 'Solo se puede escanear una orden tomada o en proceso.' }, 409);
        }
        const item = context.items.find((row: any) => normalizeText(row.id) === pickOrderItemId);
        if (!item) return json({ error: 'Línea de alistamiento no encontrada.' }, 404);
        if (!item.serials_required) return json({ error: 'Esta línea no requiere seriales.' }, 409);
        const expected = Math.round(Number(item.quantity || 0));
        if ((item.scans || []).length >= expected) {
            return json({ error: 'La línea ya tiene todos los seriales requeridos.' }, 409);
        }

        await assertSerialAvailable({ supabase, pick: context.pick, item, serialCode });

        const inserted = await supabase
            .from('warehouse_pick_serial_scans')
            .insert({
                pick_order_id: token,
                pick_order_item_id: pickOrderItemId,
                sales_order_id: context.pick.sales_order_id,
                sales_order_item_id: item.sales_order_item_id || null,
                item_id: item.item_id,
                serial_code: serialCode,
                scanned_by: auth.userId,
            })
            .select()
            .single();
        if (inserted.error) {
            const duplicate = String(inserted.error.message || '').toLowerCase().includes('duplicate');
            return json(
                { error: duplicate ? `El serial ${serialCode} ya fue escaneado en otra orden o línea.` : inserted.error.message },
                duplicate ? 409 : 500
            );
        }
        await syncSelectedScansToPickItems({ supabase, pickOrderId: token });
        return json({ scan: inserted.data }, 201);
    } catch (error: any) {
        return json({ error: error?.message || 'Error interno' }, 500);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const auth = await getAuthenticatedProfile(supabase);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const body = await readBody(req);
        const token = normalizeText(body?.token);
        const pickOrderItemId = normalizeText(body?.pick_order_item_id);
        const serialCode = normalizeText(body?.serial_code);
        if (!token || !pickOrderItemId || !serialCode) return json({ error: 'Faltan token, línea o serial.' }, 400);
        const context = await getContext(supabase, token, auth.userId, auth.role);
        if ('error' in context) return context.error;
        if (!['claimed', 'picking'].includes(normalizeText(context.pick.status))) {
            return json({ error: 'La orden ya no permite modificar seriales.' }, 409);
        }
        const removed = await supabase
            .from('warehouse_pick_serial_scans')
            .delete()
            .eq('pick_order_id', token)
            .eq('pick_order_item_id', pickOrderItemId)
            .eq('serial_code', serialCode);
        if (removed.error) throw removed.error;
        await syncSelectedScansToPickItems({ supabase, pickOrderId: token });
        return json({ ok: true });
    } catch (error: any) {
        return json({ error: error?.message || 'Error interno' }, 500);
    }
}
