import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
    computePickQueuePositionMap,
    isMissingPickingInfraError,
} from '@/lib/ventas/picking';
import { isSalesPickingFlowEnabled } from '@/lib/ventas/feature-flags';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
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
        const salespersonId = normalizeText(searchParams.get('salesperson_id'));
        const warehouseId = normalizeText(searchParams.get('warehouse_id'));

        if (!salespersonId) {
            return jsonNoStore({ error: 'salesperson_id es requerido.' }, 400);
        }

        let pickQuery = supabase
            .from('warehouse_pick_orders')
            .select('id, sales_order_id, sales_order_number, warehouse_id, priority, status, queued_at, created_at')
            .eq('status', 'queued');

        if (warehouseId) {
            pickQuery = pickQuery.eq('warehouse_id', warehouseId);
        }

        const pickResult = await pickQuery;
        if (pickResult.error) {
            if (isMissingPickingInfraError(pickResult.error)) {
                return jsonNoStore({ error: 'Falta migración de alistamiento. Ejecuta warehouse-picking-v1.sql.' }, 500);
            }
            return jsonNoStore({ error: pickResult.error.message }, 500);
        }

        const pickRows = Array.isArray(pickResult.data) ? pickResult.data : [];
        const salesOrderIds = Array.from(
            new Set(
                pickRows
                    .map((row: any) => normalizeText(row?.sales_order_id))
                    .filter(Boolean)
            )
        );

        let orderById = new Map<string, any>();
        if (salesOrderIds.length > 0) {
            const orderResult = await supabase
                .from('sales_orders')
                .select('id, order_number, salesperson_id')
                .in('id', salesOrderIds);
            if (!orderResult.error) {
                orderById = new Map((orderResult.data || []).map((row: any) => [normalizeText(row?.id), row]));
            }
        }

        const queuePositionMap = computePickQueuePositionMap(pickRows as any[]);

        const positions = pickRows
            .map((row: any) => {
                const salesOrderId = normalizeText(row?.sales_order_id);
                const order = orderById.get(salesOrderId) || null;
                const orderSalespersonId = normalizeText(order?.salesperson_id);
                if (!orderSalespersonId || orderSalespersonId !== salespersonId) {
                    return null;
                }
                return {
                    pick_order_id: normalizeText(row?.id),
                    sales_order_id: salesOrderId,
                    sales_order_number: normalizeText(order?.order_number || row?.sales_order_number) || null,
                    queue_position: queuePositionMap.get(normalizeText(row?.id)) || null,
                    queued_at: row?.queued_at || null,
                    priority: normalizeText(row?.priority) || 'normal',
                    warehouse_id: normalizeText(row?.warehouse_id) || null,
                };
            })
            .filter(Boolean)
            .sort((a: any, b: any) => {
                const pa = Number(a?.queue_position || 999999);
                const pb = Number(b?.queue_position || 999999);
                return pa - pb;
            });

        return jsonNoStore({
            salesperson_id: salespersonId,
            warehouse_id: warehouseId || null,
            total_matches: positions.length,
            next_position: positions.length > 0 ? positions[0]?.queue_position || null : null,
            positions,
        });
    } catch (error: any) {
        return jsonNoStore({ error: error?.message || 'Error interno' }, 500);
    }
}
