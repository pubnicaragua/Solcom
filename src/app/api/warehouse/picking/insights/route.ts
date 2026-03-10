import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isMissingPickingInfraError } from '@/lib/ventas/picking';
import { isSalesPickingFlowEnabled } from '@/lib/ventas/feature-flags';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function percentile(values: number[], p: number): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index] || 0;
}

function minutesBetween(start: string | null | undefined, end: string | null | undefined): number | null {
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    if (!startDate || !endDate) return null;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
    const diff = (endDate.getTime() - startDate.getTime()) / 60000;
    if (!Number.isFinite(diff) || diff < 0) return null;
    return diff;
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
        const rangeRaw = normalizeText(searchParams.get('range')).toLowerCase();
        const days = rangeRaw === '30d' ? 30 : 7;
        const now = new Date();
        const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

        let query = supabase
            .from('warehouse_pick_orders')
            .select('id, sales_order_id, warehouse_id, status, priority, assigned_user_id, queued_at, claimed_at, started_at, ready_at, completed_at, delivery_requested, created_at')
            .gte('queued_at', since);

        if (warehouseId) {
            query = query.eq('warehouse_id', warehouseId);
        }

        const pickResult = await query;
        if (pickResult.error) {
            if (isMissingPickingInfraError(pickResult.error)) {
                return jsonNoStore({ error: 'Falta migración de alistamiento. Ejecuta warehouse-picking-v1.sql.' }, 500);
            }
            return jsonNoStore({ error: pickResult.error.message }, 500);
        }

        const rows = Array.isArray(pickResult.data) ? pickResult.data : [];
        const total = rows.length;
        const byStatus = {
            queued: rows.filter((row: any) => normalizeText(row?.status) === 'queued').length,
            claimed: rows.filter((row: any) => normalizeText(row?.status) === 'claimed').length,
            picking: rows.filter((row: any) => normalizeText(row?.status) === 'picking').length,
            ready: rows.filter((row: any) => normalizeText(row?.status) === 'ready').length,
            completed_floor: rows.filter((row: any) => normalizeText(row?.status) === 'completed_floor').length,
            completed_dispatch: rows.filter((row: any) => normalizeText(row?.status) === 'completed_dispatch').length,
            cancelled: rows.filter((row: any) => normalizeText(row?.status) === 'cancelled').length,
        };

        const queueWaits = rows
            .map((row: any) => minutesBetween(row?.queued_at, row?.claimed_at))
            .filter((value): value is number => typeof value === 'number');

        const pickDurations = rows
            .map((row: any) => {
                const end = normalizeText(row?.ready_at) || normalizeText(row?.completed_at) || null;
                return minutesBetween(row?.started_at, end);
            })
            .filter((value): value is number => typeof value === 'number');

        const queueAvg = queueWaits.length ? queueWaits.reduce((sum, value) => sum + value, 0) / queueWaits.length : 0;
        const queueP95 = percentile(queueWaits, 95);
        const pickingAvg = pickDurations.length ? pickDurations.reduce((sum, value) => sum + value, 0) / pickDurations.length : 0;

        const completedCount = byStatus.completed_floor + byStatus.completed_dispatch;
        const rangeHours = days * 24;
        const throughputPerHour = rangeHours > 0 ? completedCount / rangeHours : 0;
        const activeBacklog = byStatus.queued + byStatus.claimed + byStatus.picking + byStatus.ready;

        const assignedIds = Array.from(
            new Set(
                rows
                    .map((row: any) => normalizeText(row?.assigned_user_id))
                    .filter(Boolean)
            )
        );

        let assignedById = new Map<string, any>();
        if (assignedIds.length > 0) {
            const assignees = await supabase
                .from('user_profiles')
                .select('id, full_name, email')
                .in('id', assignedIds);
            if (!assignees.error) {
                assignedById = new Map((assignees.data || []).map((entry: any) => [normalizeText(entry?.id), entry]));
            }
        }

        const pickerStatsMap = new Map<string, {
            assigned_user_id: string;
            name: string | null;
            email: string | null;
            active_orders: number;
            completed_orders: number;
            avg_queue_wait_min: number;
            avg_pick_time_min: number;
            __queueSamples: number[];
            __pickSamples: number[];
        }>();

        for (const row of rows as any[]) {
            const assignedUserId = normalizeText(row?.assigned_user_id);
            if (!assignedUserId) continue;
            const existing = pickerStatsMap.get(assignedUserId) || {
                assigned_user_id: assignedUserId,
                name: normalizeText(assignedById.get(assignedUserId)?.full_name) || null,
                email: normalizeText(assignedById.get(assignedUserId)?.email) || null,
                active_orders: 0,
                completed_orders: 0,
                avg_queue_wait_min: 0,
                avg_pick_time_min: 0,
                __queueSamples: [],
                __pickSamples: [],
            };

            const status = normalizeText(row?.status);
            if (['queued', 'claimed', 'picking', 'ready'].includes(status)) {
                existing.active_orders += 1;
            }
            if (['completed_floor', 'completed_dispatch'].includes(status)) {
                existing.completed_orders += 1;
            }

            const queueSample = minutesBetween(row?.queued_at, row?.claimed_at);
            if (typeof queueSample === 'number') {
                existing.__queueSamples.push(queueSample);
            }
            const pickSample = minutesBetween(
                row?.started_at,
                normalizeText(row?.ready_at) || normalizeText(row?.completed_at) || null
            );
            if (typeof pickSample === 'number') {
                existing.__pickSamples.push(pickSample);
            }

            pickerStatsMap.set(assignedUserId, existing);
        }

        const picker_stats = Array.from(pickerStatsMap.values()).map((row) => {
            const queueAvgValue = row.__queueSamples.length
                ? row.__queueSamples.reduce((sum, value) => sum + value, 0) / row.__queueSamples.length
                : 0;
            const pickAvgValue = row.__pickSamples.length
                ? row.__pickSamples.reduce((sum, value) => sum + value, 0) / row.__pickSamples.length
                : 0;
            return {
                assigned_user_id: row.assigned_user_id,
                name: row.name,
                email: row.email,
                active_orders: row.active_orders,
                completed_orders: row.completed_orders,
                avg_queue_wait_min: Number(queueAvgValue.toFixed(2)),
                avg_pick_time_min: Number(pickAvgValue.toFixed(2)),
            };
        });

        const salesOrderIds = Array.from(
            new Set(
                rows
                    .map((row: any) => normalizeText(row?.sales_order_id))
                    .filter(Boolean)
            )
        );

        let salesOrders: any[] = [];
        if (salesOrderIds.length > 0) {
            const salesOrderResult = await supabase
                .from('sales_orders')
                .select('id, salesperson_id, salesperson_name, total, status')
                .in('id', salesOrderIds);
            if (!salesOrderResult.error) {
                salesOrders = salesOrderResult.data || [];
            }
        }

        const salespersonByOrderId = new Map<string, any>();
        for (const order of salesOrders) {
            salespersonByOrderId.set(normalizeText(order?.id), order);
        }

        const salespersonMap = new Map<string, {
            salesperson_id: string;
            salesperson_name: string | null;
            confirmed_orders: number;
            confirmed_total: number;
            avg_time_to_ready_min: number;
            __readySamples: number[];
        }>();

        for (const row of rows as any[]) {
            const order = salespersonByOrderId.get(normalizeText(row?.sales_order_id));
            if (!order) continue;
            const salespersonId = normalizeText(order?.salesperson_id);
            if (!salespersonId) continue;
            const existing = salespersonMap.get(salespersonId) || {
                salesperson_id: salespersonId,
                salesperson_name: normalizeText(order?.salesperson_name) || null,
                confirmed_orders: 0,
                confirmed_total: 0,
                avg_time_to_ready_min: 0,
                __readySamples: [],
            };

            if (normalizeText(order?.status) === 'confirmada' || normalizeText(order?.status) === 'convertida') {
                existing.confirmed_orders += 1;
                existing.confirmed_total += Number(order?.total || 0);
            }

            const readyOrComplete = normalizeText(row?.ready_at) || normalizeText(row?.completed_at) || null;
            const readyMinutes = minutesBetween(row?.queued_at, readyOrComplete);
            if (typeof readyMinutes === 'number') {
                existing.__readySamples.push(readyMinutes);
            }

            salespersonMap.set(salespersonId, existing);
        }

        const salesperson_stats = Array.from(salespersonMap.values()).map((entry) => {
            const avgReady = entry.__readySamples.length
                ? entry.__readySamples.reduce((sum, value) => sum + value, 0) / entry.__readySamples.length
                : 0;
            return {
                salesperson_id: entry.salesperson_id,
                salesperson_name: entry.salesperson_name,
                confirmed_orders: entry.confirmed_orders,
                confirmed_total: Number(entry.confirmed_total.toFixed(2)),
                avg_time_to_ready_min: Number(avgReady.toFixed(2)),
            };
        });

        const recommendations: Array<{ code: string; severity: 'low' | 'medium' | 'high'; message: string }> = [];

        if (queueP95 > 45) {
            recommendations.push({
                code: 'QUEUE_P95_HIGH',
                severity: 'high',
                message: `El p95 de espera en cola está en ${queueP95.toFixed(1)} min. Considera aumentar personal de bodega en horas pico.`,
            });
        } else if (queueP95 > 25) {
            recommendations.push({
                code: 'QUEUE_P95_MEDIUM',
                severity: 'medium',
                message: `El p95 de espera en cola está en ${queueP95.toFixed(1)} min. Evalúa rebalancear asignaciones.`,
            });
        }

        if (activeBacklog > 0 && throughputPerHour <= 0.02) {
            recommendations.push({
                code: 'THROUGHPUT_LOW',
                severity: 'high',
                message: 'Hay backlog activo con throughput casi nulo. Revisa bloqueos operativos o disponibilidad de personal.',
            });
        } else if (throughputPerHour > 0 && activeBacklog > throughputPerHour * 4) {
            recommendations.push({
                code: 'BACKLOG_HIGH',
                severity: 'medium',
                message: 'El backlog supera ~4 horas de capacidad promedio. Considera reasignación temporal.',
            });
        }

        if (picker_stats.length > 0) {
            const totalActive = picker_stats.reduce((sum, row) => sum + Number(row.active_orders || 0), 0);
            const mostLoaded = [...picker_stats].sort((a, b) => (b.active_orders || 0) - (a.active_orders || 0))[0];
            if (mostLoaded && totalActive >= 4 && Number(mostLoaded.active_orders || 0) / totalActive >= 0.6) {
                recommendations.push({
                    code: 'PICKER_SATURATION',
                    severity: 'medium',
                    message: `Alta concentración de carga en ${mostLoaded.name || mostLoaded.assigned_user_id}. Balancea órdenes entre bodegueros.`,
                });
            }
        }

        return jsonNoStore({
            range: `${days}d`,
            since,
            warehouse_id: warehouseId || null,
            totals: {
                orders: total,
                by_status: byStatus,
                active_backlog: activeBacklog,
                completed_count: completedCount,
                throughput_per_hour: Number(throughputPerHour.toFixed(4)),
            },
            timings: {
                avg_queue_wait_min: Number(queueAvg.toFixed(2)),
                p95_queue_wait_min: Number(queueP95.toFixed(2)),
                avg_pick_time_min: Number(pickingAvg.toFixed(2)),
            },
            picker_stats,
            salesperson_stats,
            recommendations,
        });
    } catch (error: any) {
        return jsonNoStore({ error: error?.message || 'Error interno' }, 500);
    }
}
