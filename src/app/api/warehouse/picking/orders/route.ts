import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
    computePickQueuePositionMap,
    isMissingPickingInfraError,
    mapPickStatusLabel,
} from '@/lib/ventas/picking';
import { isSalesPickingFlowEnabled } from '@/lib/ventas/feature-flags';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function parseBoolean(value: string | null, fallback = false): boolean {
    if (value == null) return fallback;
    const text = normalizeText(value).toLowerCase();
    if (!text) return fallback;
    if (['1', 'true', 'yes', 'y', 'on', 'si', 'sí'].includes(text)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
    return fallback;
}

function parseDate(value: string | null): string | null {
    const text = normalizeText(value);
    if (!text) return null;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function jsonNoStore(body: any, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
    });
}

export async function GET(req: NextRequest) {
    try {
        if (!isSalesPickingFlowEnabled()) {
            return jsonNoStore({ error: 'Picking deshabilitado por feature flag.' }, 404);
        }

        const supabase = createRouteHandlerClient({ cookies });
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return jsonNoStore({ error: 'No autorizado' }, 401);
        }

        const { searchParams } = new URL(req.url);
        const warehouseId = normalizeText(searchParams.get('warehouse_id'));
        const statusParam = normalizeText(searchParams.get('status')).toLowerCase();
        const mine = parseBoolean(searchParams.get('mine'));
        const search = normalizeText(searchParams.get('search')).toLowerCase();
        const includeEvents = parseBoolean(searchParams.get('include_events'));
        const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10));
        const perPage = Math.max(1, Math.min(100, Number.parseInt(searchParams.get('per_page') || '30', 10)));
        const dateFrom = parseDate(searchParams.get('date_from'));
        const dateTo = parseDate(searchParams.get('date_to'));

        let query = supabase
            .from('warehouse_pick_orders')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });

        if (warehouseId) {
            query = query.eq('warehouse_id', warehouseId);
        }

        if (mine) {
            query = query.eq('assigned_user_id', user.id);
        }

        if (statusParam) {
            const statusList = statusParam
                .split(',')
                .map((entry) => normalizeText(entry).toLowerCase())
                .filter(Boolean);
            if (statusList.length === 1) {
                query = query.eq('status', statusList[0]);
            } else if (statusList.length > 1) {
                query = query.in('status', statusList);
            }
        }

        if (dateFrom) {
            query = query.gte('queued_at', dateFrom);
        }
        if (dateTo) {
            query = query.lte('queued_at', dateTo);
        }

        const from = (page - 1) * perPage;
        const to = from + perPage - 1;
        query = query.range(from, to);

        const pickResult = await query;
        if (pickResult.error) {
            if (isMissingPickingInfraError(pickResult.error)) {
                return jsonNoStore({ error: 'Falta migración de alistamiento. Ejecuta warehouse-picking-v1.sql.' }, 500);
            }
            return jsonNoStore({ error: pickResult.error.message }, 500);
        }

        const pickRows = Array.isArray(pickResult.data) ? pickResult.data : [];
        const pickOrderIds = Array.from(new Set(pickRows.map((row: any) => normalizeText(row?.id)).filter(Boolean)));
        const salesOrderIds = Array.from(new Set(pickRows.map((row: any) => normalizeText(row?.sales_order_id)).filter(Boolean)));

        let orderById = new Map<string, any>();
        if (salesOrderIds.length > 0) {
            const orderLookup = await supabase
                .from('sales_orders')
                .select('id, order_number, status, total, date, expected_delivery_date, customer_id, salesperson_id, salesperson_name, warehouse_id, customer:customers(id, name), warehouse:warehouses(id, code, name)')
                .in('id', salesOrderIds);

            if (!orderLookup.error) {
                orderById = new Map((orderLookup.data || []).map((row: any) => [normalizeText(row?.id), row]));
            }
        }

        const itemLookup = pickOrderIds.length > 0
            ? await supabase
                .from('warehouse_pick_order_items')
                .select('id, pick_order_id, sales_order_item_id, item_id, description, quantity, serials_required, serial_numbers_requested, serial_numbers_selected, sort_order')
                .in('pick_order_id', pickOrderIds)
                .order('sort_order', { ascending: true })
            : { data: [], error: null };

        if (itemLookup.error && !isMissingPickingInfraError(itemLookup.error)) {
            return jsonNoStore({ error: itemLookup.error.message }, 500);
        }

        const itemsByPickId = new Map<string, any[]>();
        for (const row of (itemLookup.data || [])) {
            const key = normalizeText((row as any)?.pick_order_id);
            if (!key) continue;
            const bucket = itemsByPickId.get(key) || [];
            bucket.push(row);
            itemsByPickId.set(key, bucket);
        }

        const assignedIds = Array.from(
            new Set(
                pickRows
                    .map((row: any) => normalizeText(row?.assigned_user_id))
                    .filter(Boolean)
            )
        );

        let assignedById = new Map<string, any>();
        if (assignedIds.length > 0) {
            const assignedLookup = await supabase
                .from('user_profiles')
                .select('id, full_name, email')
                .in('id', assignedIds);
            if (!assignedLookup.error) {
                assignedById = new Map((assignedLookup.data || []).map((row: any) => [normalizeText(row?.id), row]));
            }
        }

        let queuedForPositionQuery = supabase
            .from('warehouse_pick_orders')
            .select('id, warehouse_id, priority, status, queued_at, created_at')
            .eq('status', 'queued');

        if (warehouseId) {
            queuedForPositionQuery = queuedForPositionQuery.eq('warehouse_id', warehouseId);
        }

        const queuedForPositionResult = await queuedForPositionQuery;
        const queuePositionMap = computePickQueuePositionMap(
            Array.isArray(queuedForPositionResult.data)
                ? queuedForPositionResult.data as any[]
                : []
        );

        let eventsByPickId = new Map<string, any[]>();
        if (includeEvents && pickOrderIds.length > 0) {
            const eventsLookup = await supabase
                .from('warehouse_pick_events')
                .select('id, pick_order_id, event_type, from_status, to_status, actor_user_id, event_data, created_at')
                .in('pick_order_id', pickOrderIds)
                .order('created_at', { ascending: false });

            if (!eventsLookup.error) {
                for (const row of (eventsLookup.data || [])) {
                    const key = normalizeText((row as any)?.pick_order_id);
                    if (!key) continue;
                    const bucket = eventsByPickId.get(key) || [];
                    bucket.push(row);
                    eventsByPickId.set(key, bucket);
                }
            }
        }

        let summaryQuery = supabase
            .from('warehouse_pick_orders')
            .select('id, status');

        if (warehouseId) {
            summaryQuery = summaryQuery.eq('warehouse_id', warehouseId);
        }
        if (dateFrom) {
            summaryQuery = summaryQuery.gte('queued_at', dateFrom);
        }
        if (dateTo) {
            summaryQuery = summaryQuery.lte('queued_at', dateTo);
        }

        const summaryResult = await summaryQuery;
        const summaryRows = Array.isArray(summaryResult.data) ? summaryResult.data : [];
        const summary = {
            queued: summaryRows.filter((row: any) => normalizeText(row?.status) === 'queued').length,
            in_progress: summaryRows.filter((row: any) => ['claimed', 'picking'].includes(normalizeText(row?.status))).length,
            ready: summaryRows.filter((row: any) => normalizeText(row?.status) === 'ready').length,
            completed: summaryRows.filter((row: any) => ['completed_floor', 'completed_dispatch'].includes(normalizeText(row?.status))).length,
        };

        const rows = pickRows
            .map((pick: any) => {
                const pickId = normalizeText(pick?.id);
                const order = orderById.get(normalizeText(pick?.sales_order_id)) || null;
                const assignedId = normalizeText(pick?.assigned_user_id);
                const assigned = assignedId
                    ? (assignedById.get(assignedId) || { id: assignedId, full_name: null, email: null })
                    : null;
                const customerName = normalizeText(order?.customer?.name);
                const orderNumber = normalizeText(order?.order_number || pick?.sales_order_number);

                return {
                    ...pick,
                    sales_order_number: orderNumber || null,
                    sales_order_status: normalizeText(order?.status) || null,
                    sales_order_total: order?.total ?? pick?.total ?? 0,
                    sales_order_date: order?.date || null,
                    expected_delivery_date: order?.expected_delivery_date || null,
                    customer: order?.customer || null,
                    warehouse: order?.warehouse || null,
                    salesperson_name: order?.salesperson_name || pick?.salesperson_name || null,
                    items: itemsByPickId.get(pickId) || [],
                    assigned_user: assigned,
                    queue_position: queuePositionMap.get(pickId) || null,
                    status_label: mapPickStatusLabel(pick?.status),
                    events: includeEvents ? (eventsByPickId.get(pickId) || []) : undefined,
                    __search: `${orderNumber} ${customerName}`.toLowerCase(),
                };
            })
            .filter((row) => {
                if (!search) return true;
                return String(row.__search || '').includes(search);
            })
            .map((row) => {
                const { __search, ...rest } = row as any;
                return rest;
            });

        return jsonNoStore({
            rows,
            total: pickResult.count || 0,
            page,
            per_page: perPage,
            total_pages: Math.max(1, Math.ceil((pickResult.count || 0) / perPage)),
            summary,
        });
    } catch (error: any) {
        return jsonNoStore({ error: error?.message || 'Error interno' }, 500);
    }
}
