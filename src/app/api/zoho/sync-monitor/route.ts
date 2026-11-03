import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getAuthenticatedProfile } from '@/lib/auth/warehouse-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const KNOWN_NOTIFICATION_TYPES = [
  { code: 'low_stock', name: 'Stock Bajo', description: 'Producto por debajo del stock mínimo.' },
  { code: 'sync_error', name: 'Error de Sincronización', description: 'Fallo al sincronizar con Zoho.' },
  { code: 'new_transfer', name: 'Nueva Transferencia', description: 'Nueva transferencia entre bodegas.' },
  { code: 'new_sale', name: 'Venta Registrada', description: 'Nueva venta o factura registrada.' },
  { code: 'report_ready', name: 'Reporte Generado', description: 'Un reporte asíncrono está disponible.' },
  { code: 'login_alert', name: 'Alerta de Seguridad', description: 'Inicio de sesión o bloqueo relevante.' },
  { code: 'user_created', name: 'Usuario Creado', description: 'Nuevo usuario creado en el ERP.' },
  { code: 'role_change', name: 'Cambio de Permisos', description: 'Cambios de rol o permisos.' },
];

type NotificationTypeSummary = {
  code: string;
  name: string;
  description: string;
  eventCount: number;
  lastTriggeredAt: string | null;
  configuredRoles: string[];
  isEmitted: boolean;
};

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  });
}

function isMissingRelation(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('does not exist') || message.includes('could not find the table');
}

function safeDate(value: unknown): string | null {
  const date = new Date(String(value || ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function eventTypeFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Evento no identificado';
  const record = payload as Record<string, any>;
  if (record.invoice) return 'Factura';
  if (record.salesorder || record.sales_order) return 'Orden de venta';
  if (record.transfer_order || record.transferorder) return 'Transferencia';
  if (record.inventory_adjustment || record.stockadjustment) return 'Ajuste de inventario';
  if (record.bill) return 'Factura de compra';
  if (record.item || record.item_id) return 'Producto';
  return 'Webhook recibido';
}

function errorText(error: any): string {
  return String(error?.message || error || '').trim();
}

async function readQueue(database: any) {
  const full = await database
    .from('sync_queue')
    .select('id, zoho_item_id, status, attempts, error, created_at, updated_at, next_attempt_at, locked_at, locked_by')
    .order('updated_at', { ascending: false })
    .limit(160);

  if (!full.error) return { rows: full.data || [], available: true, error: null };

  const fallback = await database
    .from('sync_queue')
    .select('id, zoho_item_id, status, attempts, error, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(160);

  if (!fallback.error) return { rows: fallback.data || [], available: true, error: null };
  return { rows: [], available: !isMissingRelation(fallback.error), error: errorText(fallback.error) };
}

async function readQueueCounts(database: any, queueRows: any[]) {
  const statuses = ['pending', 'processing', 'completed', 'failed'] as const;
  const results = await Promise.all(statuses.map(async (status) => {
    const result = await database.from('sync_queue').select('id', { count: 'exact', head: true }).eq('status', status);
    return [status, result.error ? null : Number(result.count || 0)] as const;
  }));

  const counts = Object.fromEntries(results) as Record<string, number | null>;
  const hasExactCounts = results.some(([, value]) => value !== null);
  if (hasExactCounts) {
    for (const status of statuses) {
      if (counts[status] === null) counts[status] = queueRows.filter((row) => row.status === status).length;
    }
    return counts;
  }

  return queueRows.reduce((acc: Record<string, number>, row: any) => {
    const status = String(row.status || 'unknown');
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { pending: 0, processing: 0, completed: 0, failed: 0 });
}

async function readWebhookLogs(database: any) {
  const result = await database
    .from('webhook_logs')
    .select('id, created_at, method, url, headers, payload, status, error_message')
    .order('created_at', { ascending: false })
    .limit(120);

  if (result.error) {
    return { rows: [], available: !isMissingRelation(result.error), error: errorText(result.error) };
  }
  return { rows: result.data || [], available: true, error: null };
}

async function readNotificationCatalog(database: any) {
  const [typesResult, prefsResult, recentResult] = await Promise.all([
    database.from('notification_types').select('code, name, description').order('name', { ascending: true }),
    database.from('role_notification_prefs').select('role_name, notification_type_code, is_enabled').limit(500),
    database.from('notifications').select('type, created_at, title, message, is_read').order('created_at', { ascending: false }).limit(500),
  ]);

  const catalogRows = typesResult.error ? KNOWN_NOTIFICATION_TYPES : (typesResult.data || []);
  const recentRows = recentResult.error ? [] : (recentResult.data || []);
  const preferences = prefsResult.error ? [] : (prefsResult.data || []);
  const emitted = new Map<string, { count: number; lastTriggeredAt: string | null }>();

  for (const row of recentRows) {
    const code = String(row.type || '').trim();
    if (!code) continue;
    const current = emitted.get(code) || { count: 0, lastTriggeredAt: null };
    current.count += 1;
    current.lastTriggeredAt = current.lastTriggeredAt || safeDate(row.created_at);
    emitted.set(code, current);
  }

  const configuredRoles = new Map<string, string[]>();
  for (const pref of preferences) {
    if (!pref.is_enabled) continue;
    const code = String(pref.notification_type_code || '').trim();
    const role = String(pref.role_name || '').trim();
    if (!code || !role) continue;
    const roles = configuredRoles.get(code) || [];
    if (!roles.includes(role)) roles.push(role);
    configuredRoles.set(code, roles);
  }

  const notificationTypes: NotificationTypeSummary[] = catalogRows.map((row: any) => {
    const code = String(row.code || '').trim();
    const activity = emitted.get(code) || { count: 0, lastTriggeredAt: null };
    return {
      code,
      name: String(row.name || code),
      description: String(row.description || ''),
      eventCount: activity.count,
      lastTriggeredAt: activity.lastTriggeredAt,
      configuredRoles: configuredRoles.get(code) || [],
      isEmitted: activity.count > 0,
    };
  });

  for (const [code, activity] of emitted) {
    if (notificationTypes.some((type) => type.code === code)) continue;
    notificationTypes.push({
      code,
      name: code,
      description: 'Evento guardado en el historial de notificaciones.',
      eventCount: activity.count,
      lastTriggeredAt: activity.lastTriggeredAt,
      configuredRoles: configuredRoles.get(code) || [],
      isEmitted: true,
    });
  }

  return {
    types: notificationTypes.sort((a: NotificationTypeSummary, b: NotificationTypeSummary) => a.name.localeCompare(b.name)),
    recentRows,
    available: !typesResult.error || !recentResult.error,
  };
}

export async function GET() {
  try {
    const authClient = createRouteHandlerClient({ cookies });
    const auth = await getAuthenticatedProfile(authClient);
    if (!auth.ok) return jsonNoStore({ error: auth.error }, auth.status);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const database = supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : authClient;

    const [queueResult, webhookResult, notificationResult] = await Promise.all([
      readQueue(database),
      readWebhookLogs(database),
      readNotificationCatalog(database),
    ]);

    const queueCounts = await readQueueCounts(database, queueResult.rows);
    const queueItems = Array.from(new Set(queueResult.rows.map((row: any) => String(row.zoho_item_id || '').trim()).filter(Boolean))).slice(0, 100);
    const itemMap = new Map<string, { name: string | null; sku: string | null }>();

    if (queueItems.length > 0) {
      const itemsResult = await database.from('items').select('zoho_item_id, name, sku').in('zoho_item_id', queueItems);
      if (!itemsResult.error) {
        for (const row of itemsResult.data || []) {
          itemMap.set(String(row.zoho_item_id), { name: row.name || null, sku: row.sku || null });
        }
      }
    }

    const queueActivity = queueResult.rows.map((row: any) => {
      const itemId = String(row.zoho_item_id || '');
      const item = itemMap.get(itemId);
      const status = String(row.status || 'unknown');
      const isError = status === 'failed';
      return {
        id: `queue-${row.id}`,
        source: 'queue',
        kind: 'sync',
        status,
        tone: isError ? 'error' : status === 'completed' ? 'success' : 'pending',
        title: isError ? 'Sincronización con error' : status === 'completed' ? 'Producto sincronizado' : 'Trabajo en cola',
        message: row.error || `${item?.name || 'Producto Zoho'}${item?.sku ? ` · SKU ${item.sku}` : ''} · ID Zoho ${itemId}`,
        reference: item?.sku || itemId,
        occurredAt: safeDate(row.updated_at || row.created_at),
        attempts: Number(row.attempts || 0),
      };
    });

    const webhookActivity = webhookResult.rows.map((row: any) => {
      const status = String(row.status || 'received').toLowerCase();
      const isError = status.includes('error') || status.includes('fail');
      return {
        id: `webhook-${row.id}`,
        source: 'webhook',
        kind: 'webhook',
        status,
        tone: isError ? 'error' : 'success',
        title: `Webhook de Zoho · ${eventTypeFromPayload(row.payload)}`,
        message: row.error_message || (isError ? 'Zoho reportó un error al recibir el evento.' : 'Evento recibido y registrado para trazabilidad.'),
        reference: row.method || 'POST',
        occurredAt: safeDate(row.created_at),
        attempts: null,
      };
    });

    const activity = [...queueActivity, ...webhookActivity]
      .filter((row) => row.occurredAt)
      .sort((a, b) => new Date(String(b.occurredAt)).getTime() - new Date(String(a.occurredAt)).getTime())
      .slice(0, 80);

    const [latestSuccessResult, latestFailureResult] = await Promise.all([
      database.from('sync_queue').select('updated_at').eq('status', 'completed').order('updated_at', { ascending: false }).limit(1),
      database.from('sync_queue').select('updated_at, error').eq('status', 'failed').order('updated_at', { ascending: false }).limit(1),
    ]);

    const lastSuccessAt = safeDate(latestSuccessResult.data?.[0]?.updated_at);
    const lastFailureAt = safeDate(latestFailureResult.data?.[0]?.updated_at);
    const lastWebhookAt = safeDate(webhookResult.rows[0]?.created_at);
    const pending = Number(queueCounts.pending || 0);
    const processing = Number(queueCounts.processing || 0);
    const failed = Number(queueCounts.failed || 0);
    const health = failed > 0 ? 'attention' : pending > 0 || processing > 0 ? 'pending' : 'healthy';

    return jsonNoStore({
      generatedAt: new Date().toISOString(),
      role: auth.role,
      health,
      healthLabel: health === 'healthy' ? 'Sincronización al día' : health === 'pending' ? 'Cambios en proceso' : 'Requiere atención',
      summary: {
        queue: {
          pending,
          processing,
          completed: Number(queueCounts.completed || 0),
          failed,
          total: pending + processing + Number(queueCounts.completed || 0) + failed,
        },
        lastSuccessAt,
        lastFailureAt,
        lastFailureMessage: String(latestFailureResult.data?.[0]?.error || ''),
        lastWebhookAt,
        webhookCount: webhookResult.rows.length,
        webhookErrorCount: webhookResult.rows.filter((row: any) => /error|fail/i.test(String(row.status || ''))).length,
        notificationCount: notificationResult.recentRows.length,
      },
      sources: {
        queue: queueResult.available,
        webhookLogs: webhookResult.available,
        notificationCatalog: notificationResult.available,
      },
      notificationTypes: notificationResult.types,
      activity,
    });
  } catch (error: any) {
    console.error('[zoho/sync-monitor] Error:', error);
    return jsonNoStore({ error: errorText(error) || 'No se pudo cargar el monitor de Zoho.' }, 500);
  }
}
