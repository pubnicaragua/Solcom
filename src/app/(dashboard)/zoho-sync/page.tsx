'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  CloudCog,
  RefreshCw,
  ShieldCheck,
  Webhook,
  XCircle,
} from 'lucide-react';

type Health = 'healthy' | 'pending' | 'historical' | 'attention';

type MonitorActivity = {
  id: string;
  source: 'queue' | 'webhook';
  kind: 'sync' | 'webhook';
  status: string;
  tone: 'success' | 'pending' | 'error';
  title: string;
  message: string;
  diagnosis: string | null;
  diagnosisDetail: string | null;
  reference: string;
  occurredAt: string | null;
  attempts: number | null;
};

type NotificationType = {
  code: string;
  name: string;
  description: string;
  eventCount: number;
  lastTriggeredAt: string | null;
  configuredRoles: string[];
  isEmitted: boolean;
};

type FailureBreakdown = {
  label: string;
  count: number;
  detail: string;
  example: string;
  lastAt: string | null;
};

type MonitorCheck = {
  key: string;
  label: string;
  status: 'ok' | 'warning';
  detail: string;
};

type MonitorData = {
  generatedAt: string;
  health: Health;
  healthLabel: string;
  checks: MonitorCheck[];
  summary: {
    queue: { pending: number; processing: number; completed: number; failed: number; recentFailed: number; total: number };
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureMessage: string;
    lastWebhookAt: string | null;
    webhookCount: number;
    webhookErrorCount: number;
    notificationCount: number;
  };
  sources: { queue: boolean; webhookLogs: boolean; notificationCatalog: boolean };
  failureBreakdown: FailureBreakdown[];
  notificationTypes: NotificationType[];
  activity: MonitorActivity[];
};

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sin registros todavía';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Fecha no disponible';
  return parsed.toLocaleString('es-NI', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeDate(value: string | null | undefined): string {
  if (!value) return 'Sin actividad';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Fecha no disponible';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Hace un momento';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return `Hace ${Math.floor(hours / 24)} días`;
}

function statusIcon(tone: MonitorActivity['tone']) {
  if (tone === 'error') return <XCircle size={17} aria-hidden="true" />;
  if (tone === 'pending') return <Clock3 size={17} aria-hidden="true" />;
  return <CheckCircle2 size={17} aria-hidden="true" />;
}

function statusLabel(status: string): string {
  if (status === 'completed') return 'Completado';
  if (status === 'processing') return 'Procesando';
  if (status === 'pending') return 'Pendiente';
  if (status === 'failed') return 'Fallido';
  if (status === 'received' || status === 'queued') return 'Recibido';
  return status || 'Registrado';
}

const emptyData: MonitorData = {
  generatedAt: '',
  health: 'pending',
  healthLabel: 'Cargando estado',
  checks: [],
  summary: {
    queue: { pending: 0, processing: 0, completed: 0, failed: 0, recentFailed: 0, total: 0 },
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureMessage: '',
    lastWebhookAt: null,
    webhookCount: 0,
    webhookErrorCount: 0,
    notificationCount: 0,
  },
  sources: { queue: false, webhookLogs: false, notificationCatalog: false },
  failureBreakdown: [],
  notificationTypes: [],
  activity: [],
};

export default function ZohoSyncPage() {
  const [data, setData] = useState<MonitorData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const fetchMonitor = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/zoho/sync-monitor', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar el estado de Zoho.');
      setData(payload as MonitorData);
      setLastRefresh(new Date().toISOString());
    } catch (requestError: any) {
      setError(requestError?.message || 'No se pudo consultar el estado de Zoho.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMonitor();
    const interval = window.setInterval(() => void fetchMonitor(true), 30000);
    return () => window.clearInterval(interval);
  }, [fetchMonitor]);

  const visibleActivity = useMemo(() => data.activity.slice(0, 40), [data.activity]);
  const queue = data.summary.queue;

  return (
    <div className="zoho-monitor-page">
      <section className="zoho-monitor-hero" data-tour="zoho-sync-header">
        <div className="zoho-monitor-hero-copy">
          <div className="zoho-monitor-kicker"><CloudCog size={15} /> Operación conectada</div>
          <h1>Sincronización Zoho</h1>
          <p>Una vista de control para confirmar qué llegó desde Zoho, qué está en cola y dónde necesita atención.</p>
          <div className="zoho-monitor-source-line">
            <span className="zoho-monitor-live-dot" />
            Actualización automática cada 30 segundos
            {lastRefresh && <span>· última consulta {relativeDate(lastRefresh)}</span>}
          </div>
        </div>
        <div className={`zoho-monitor-health is-${data.health}`} data-tour="zoho-sync-health">
          <div className="zoho-monitor-health-icon">
            {data.health === 'healthy' ? <ShieldCheck size={24} /> : data.health === 'attention' ? <AlertTriangle size={24} /> : <Activity size={24} />}
          </div>
          <div>
            <span>Estado de la integración</span>
            <strong>{loading ? 'Consultando…' : data.healthLabel}</strong>
          </div>
        </div>
      </section>

      {error && (
        <div className="zoho-monitor-alert is-error" role="alert">
          <AlertTriangle size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => void fetchMonitor()}><RefreshCw size={14} /> Reintentar</button>
        </div>
      )}

      <section className="zoho-monitor-actions" data-tour="zoho-sync-actions">
        <div>
          <strong>Centro de sincronización</strong>
          <span>Actualizar estado solo consulta la cola, webhooks y notificaciones; no dispara una sincronización nueva.</span>
        </div>
        <button type="button" onClick={() => void fetchMonitor()} disabled={loading} title="Consultar nuevamente el estado actual">
          <RefreshCw size={15} className={loading ? 'is-spinning' : ''} />
          Actualizar estado
        </button>
      </section>

      {data.checks.length > 0 && (
        <section className="zoho-monitor-refresh-result" aria-live="polite">
          <div className="zoho-monitor-refresh-result-heading">
            <div><strong>Resultado de la última consulta</strong><span>Lectura completada · no se modificaron datos</span></div>
            <CheckCircle2 size={17} />
          </div>
          <div className="zoho-monitor-check-list">
            {data.checks.map((check) => (
              <div className={`zoho-monitor-check is-${check.status}`} key={check.key}>
                {check.status === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                <div><strong>{check.label}</strong><span>{check.detail}</span></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="zoho-monitor-cards" data-tour="zoho-sync-summary">
        <article className="zoho-monitor-card is-accent">
          <div className="zoho-monitor-card-icon"><CheckCircle2 size={18} /></div>
          <div><span>Sincronizados</span><strong>{queue.completed.toLocaleString('es-NI')}</strong><small>trabajos completados</small></div>
        </article>
        <article className="zoho-monitor-card is-blue">
          <div className="zoho-monitor-card-icon"><Clock3 size={18} /></div>
          <div><span>En cola</span><strong>{(queue.pending + queue.processing).toLocaleString('es-NI')}</strong><small>{queue.processing} procesando ahora</small></div>
        </article>
        <article className="zoho-monitor-card is-danger">
          <div className="zoho-monitor-card-icon"><AlertTriangle size={18} /></div>
          <div><span>Historial de fallos</span><strong>{queue.failed.toLocaleString('es-NI')}</strong><small>{queue.recentFailed.toLocaleString('es-NI')} recientes · ninguno activo</small></div>
        </article>
        <article className="zoho-monitor-card is-violet">
          <div className="zoho-monitor-card-icon"><Webhook size={18} /></div>
          <div><span>Webhooks recibidos</span><strong>{data.summary.webhookCount.toLocaleString('es-NI')}</strong><small>{data.summary.webhookErrorCount} con error registrado</small></div>
        </article>
      </section>

      <section className="zoho-monitor-grid">
        <article className="zoho-monitor-panel zoho-monitor-milestones">
          <div className="zoho-monitor-panel-heading">
            <div><span className="zoho-monitor-eyebrow">Trazabilidad</span><h2>Últimos hitos de Zoho</h2></div>
            <Activity size={18} />
          </div>
          <div className="zoho-monitor-milestone-list">
            <div><span className="zoho-monitor-milestone-icon is-success"><CheckCircle2 size={16} /></span><div><strong>Última sincronización exitosa</strong><span>{formatDate(data.summary.lastSuccessAt)}</span></div></div>
            <div><span className="zoho-monitor-milestone-icon is-blue"><Webhook size={16} /></span><div><strong>Último webhook recibido</strong><span>{formatDate(data.summary.lastWebhookAt)}</span></div></div>
            <div><span className={`zoho-monitor-milestone-icon ${data.summary.lastFailureAt ? 'is-danger' : 'is-success'}`}>{data.summary.lastFailureAt ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}</span><div><strong>{data.summary.lastFailureAt ? 'Último fallo registrado' : 'Sin errores registrados'}</strong><span>{data.summary.lastFailureAt ? formatDate(data.summary.lastFailureAt) : 'La cola no reporta fallos recientes.'}</span></div></div>
          </div>
          {data.summary.lastFailureMessage && <div className="zoho-monitor-last-error"><strong>Detalle del último fallo registrado</strong><span>{data.summary.lastFailureMessage}</span></div>}
          {data.failureBreakdown.length > 0 && (
            <div className="zoho-monitor-breakdown">
              <div className="zoho-monitor-breakdown-heading"><strong>¿De dónde vienen los fallos?</strong><span>Historial terminal · no son pendientes activos</span></div>
              {data.failureBreakdown.map((item) => (
                <div className="zoho-monitor-breakdown-row" key={item.label}>
                  <div><strong>{item.label}</strong><span>{item.detail}</span></div>
                  <b>{item.count.toLocaleString('es-NI')}</b>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="zoho-monitor-panel" data-tour="zoho-sync-notifications">
          <div className="zoho-monitor-panel-heading">
            <div><span className="zoho-monitor-eyebrow">Avisos del ERP</span><h2>Notificaciones disparadas</h2></div>
            <BellRing size={18} />
          </div>
          <p className="zoho-monitor-panel-intro">Separamos los tipos configurados de los que realmente tienen eventos guardados.</p>
          <div className="zoho-monitor-notification-list">
            {data.notificationTypes.length === 0 ? <div className="zoho-monitor-empty">No hay catálogo de notificaciones disponible.</div> : data.notificationTypes.map((type) => (
              <div className="zoho-monitor-notification-row" key={type.code}>
                <div><strong>{type.name}</strong><span>{type.description || type.code}</span></div>
                <div className={`zoho-monitor-notification-count ${type.isEmitted ? 'is-emitted' : ''}`}><strong>{type.eventCount}</strong><span>{type.isEmitted ? 'eventos' : 'sin eventos'}</span></div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="zoho-monitor-panel zoho-monitor-activity-panel" data-tour="zoho-sync-activity">
        <div className="zoho-monitor-panel-heading">
          <div><span className="zoho-monitor-eyebrow">Actividad reciente</span><h2>Webhooks y cola de sincronización</h2></div>
          <span className="zoho-monitor-activity-count">{visibleActivity.length} eventos visibles</span>
        </div>
        <div className="zoho-monitor-table-wrap">
          {visibleActivity.length === 0 ? (
            <div className="zoho-monitor-empty zoho-monitor-empty-large"><CloudCog size={28} /><strong>Aún no hay actividad para mostrar</strong><span>Cuando Zoho envíe un webhook o el worker procese un producto, aparecerá aquí.</span></div>
          ) : (
            <table className="zoho-monitor-table">
              <thead><tr><th>Estado</th><th>Evento</th><th>Referencia</th><th>Origen</th><th>Fecha</th></tr></thead>
              <tbody>{visibleActivity.map((event) => (
                <tr key={event.id}>
                  <td><span className={`zoho-monitor-status is-${event.tone}`}>{statusIcon(event.tone)} {statusLabel(event.status)}</span></td>
                  <td><strong>{event.title}</strong><span className="zoho-monitor-table-message">{event.message}</span>{event.diagnosis && <span className="zoho-monitor-table-diagnosis">Origen detectado: {event.diagnosis}{event.diagnosisDetail ? ` · ${event.diagnosisDetail}` : ''}</span>}</td>
                  <td><code>{event.reference || '—'}</code></td>
                  <td><span className="zoho-monitor-origin">{event.source === 'webhook' ? <Webhook size={14} /> : <RefreshCw size={14} />} {event.source === 'webhook' ? 'Webhook' : 'Cola'}</span></td>
                  <td><time dateTime={event.occurredAt || undefined}>{relativeDate(event.occurredAt)}<small>{formatDate(event.occurredAt)}</small></time></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </section>

      <div className="zoho-monitor-footnote">
        <span className={data.sources.queue ? 'is-ok' : 'is-warn'}>{data.sources.queue ? 'Cola conectada' : 'Cola no disponible'}</span>
        <span className={data.sources.webhookLogs ? 'is-ok' : 'is-warn'}>{data.sources.webhookLogs ? 'Webhooks registrados' : 'Logs de webhook pendientes de migración'}</span>
        <span className={data.sources.notificationCatalog ? 'is-ok' : 'is-warn'}>{data.sources.notificationCatalog ? 'Catálogo de avisos conectado' : 'Catálogo de avisos no disponible'}</span>
      </div>

      <style jsx global>{`
        .zoho-monitor-page { color: var(--text); max-width: 1600px; margin: 0 auto; padding-bottom: 36px; }
        .zoho-monitor-hero { display: flex; justify-content: space-between; gap: 24px; align-items: stretch; padding: 26px 28px; border: 1px solid color-mix(in srgb, #4385ff 28%, var(--border)); border-radius: 18px; background: radial-gradient(circle at 90% 0%, rgba(64, 126, 255, .22), transparent 34%), linear-gradient(135deg, rgba(20, 35, 64, .96), rgba(10, 19, 36, .92)); box-shadow: 0 18px 42px rgba(0,0,0,.16); }
        .zoho-monitor-hero-copy { max-width: 720px; }
        .zoho-monitor-kicker, .zoho-monitor-source-line, .zoho-monitor-origin, .zoho-monitor-status, .zoho-monitor-eyebrow { display: inline-flex; align-items: center; gap: 7px; }
        .zoho-monitor-kicker, .zoho-monitor-eyebrow { color: #7fa9ff; font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
        .zoho-monitor-hero h1 { margin: 10px 0 8px; font-size: clamp(28px, 3vw, 42px); letter-spacing: -.04em; }
        .zoho-monitor-hero p { margin: 0; color: var(--muted); font-size: 15px; line-height: 1.6; max-width: 640px; }
        .zoho-monitor-source-line { margin-top: 18px; color: #9db4d7; font-size: 12px; flex-wrap: wrap; }
        .zoho-monitor-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #35d399; box-shadow: 0 0 0 4px rgba(53,211,153,.12); }
        .zoho-monitor-health { display: flex; align-items: center; gap: 12px; min-width: 245px; align-self: center; padding: 15px 16px; border: 1px solid rgba(53,211,153,.25); border-radius: 14px; background: rgba(53,211,153,.08); }
        .zoho-monitor-health.is-pending { border-color: rgba(72, 146, 255, .3); background: rgba(72,146,255,.1); }
        .zoho-monitor-health.is-attention { border-color: rgba(251,113,133,.35); background: rgba(251,113,133,.1); }
        .zoho-monitor-health.is-historical { border-color: rgba(251,191,36,.3); background: rgba(251,191,36,.08); }
        .zoho-monitor-health-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; color: #4ade80; background: rgba(74,222,128,.13); }
        .zoho-monitor-health.is-pending .zoho-monitor-health-icon { color: #7fb4ff; background: rgba(127,180,255,.13); }
        .zoho-monitor-health.is-attention .zoho-monitor-health-icon { color: #fb7185; background: rgba(251,113,133,.13); }
        .zoho-monitor-health.is-historical .zoho-monitor-health-icon { color: #fbbf24; background: rgba(251,191,36,.13); }
        .zoho-monitor-health span, .zoho-monitor-health strong { display: block; }
        .zoho-monitor-health span { color: var(--muted); font-size: 11px; }
        .zoho-monitor-health strong { margin-top: 3px; font-size: 15px; }
        .zoho-monitor-alert, .zoho-monitor-actions { display: flex; align-items: center; gap: 10px; margin-top: 14px; border-radius: 12px; padding: 12px 14px; }
        .zoho-monitor-alert { color: #fecaca; border: 1px solid rgba(248,113,113,.3); background: rgba(127,29,29,.25); }
        .zoho-monitor-alert button { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; border: 0; color: #fecaca; background: transparent; cursor: pointer; font-weight: 800; }
        .zoho-monitor-actions { justify-content: space-between; border: 1px solid var(--border); background: var(--card); }
        .zoho-monitor-actions strong, .zoho-monitor-actions span { display: block; }
        .zoho-monitor-actions strong { font-size: 14px; }
        .zoho-monitor-actions span { margin-top: 3px; color: var(--muted); font-size: 12px; }
        .zoho-monitor-actions button { display: inline-flex; align-items: center; gap: 7px; border: 1px solid color-mix(in srgb, var(--brand-primary) 45%, var(--border)); border-radius: 8px; padding: 9px 12px; color: var(--text); background: var(--brand-surface); cursor: pointer; font-size: 12px; font-weight: 800; white-space: nowrap; }
        .zoho-monitor-actions button:disabled { opacity: .55; cursor: wait; }
        .zoho-monitor-refresh-result { margin-top: 10px; padding: 13px 14px; border: 1px solid rgba(74,222,128,.22); border-radius: 12px; background: rgba(74,222,128,.06); }
        .zoho-monitor-refresh-result-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #4ade80; }
        .zoho-monitor-refresh-result-heading strong, .zoho-monitor-refresh-result-heading span { display: block; }
        .zoho-monitor-refresh-result-heading strong { color: var(--text); font-size: 12px; }
        .zoho-monitor-refresh-result-heading span { margin-top: 3px; color: var(--muted); font-size: 11px; }
        .zoho-monitor-check-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 11px; }
        .zoho-monitor-check { display: flex; gap: 7px; padding: 9px; border: 1px solid var(--border); border-radius: 9px; color: #4ade80; background: color-mix(in srgb, var(--card) 70%, transparent); }
        .zoho-monitor-check.is-warning { color: #fbbf24; }
        .zoho-monitor-check strong, .zoho-monitor-check span { display: block; }
        .zoho-monitor-check strong { color: var(--text); font-size: 11px; }
        .zoho-monitor-check span { margin-top: 3px; color: var(--muted); font-size: 10px; line-height: 1.35; }
        .zoho-monitor-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
        .zoho-monitor-card { display: flex; gap: 11px; align-items: flex-start; min-height: 106px; padding: 15px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); }
        .zoho-monitor-card-icon { display: grid; place-items: center; width: 35px; height: 35px; border-radius: 10px; color: #4ade80; background: rgba(74,222,128,.12); }
        .zoho-monitor-card.is-blue .zoho-monitor-card-icon { color: #7fb4ff; background: rgba(127,180,255,.12); }
        .zoho-monitor-card.is-danger .zoho-monitor-card-icon { color: #fb7185; background: rgba(251,113,133,.12); }
        .zoho-monitor-card.is-violet .zoho-monitor-card-icon { color: #c4b5fd; background: rgba(196,181,253,.12); }
        .zoho-monitor-card span, .zoho-monitor-card strong, .zoho-monitor-card small { display: block; }
        .zoho-monitor-card span { color: var(--muted); font-size: 12px; }
        .zoho-monitor-card strong { margin: 3px 0; font-size: 25px; letter-spacing: -.04em; }
        .zoho-monitor-card small { color: var(--muted); font-size: 11px; }
        .zoho-monitor-grid { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 14px; margin-top: 14px; }
        .zoho-monitor-panel { border: 1px solid var(--border); border-radius: 15px; background: var(--card); overflow: hidden; }
        .zoho-monitor-panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 18px 12px; color: var(--muted); }
        .zoho-monitor-panel-heading h2 { margin: 5px 0 0; color: var(--text); font-size: 17px; letter-spacing: -.02em; }
        .zoho-monitor-panel-heading > svg { color: #7fa9ff; }
        .zoho-monitor-milestone-list { padding: 3px 18px 9px; }
        .zoho-monitor-milestone-list > div { display: flex; gap: 11px; padding: 13px 0; border-bottom: 1px solid var(--border); }
        .zoho-monitor-milestone-list > div:last-child { border-bottom: 0; }
        .zoho-monitor-milestone-icon { display: grid; place-items: center; flex: 0 0 32px; width: 32px; height: 32px; border-radius: 9px; }
        .zoho-monitor-milestone-icon.is-success { color: #4ade80; background: rgba(74,222,128,.12); }
        .zoho-monitor-milestone-icon.is-blue { color: #7fb4ff; background: rgba(127,180,255,.12); }
        .zoho-monitor-milestone-icon.is-danger { color: #fb7185; background: rgba(251,113,133,.12); }
        .zoho-monitor-milestone-list strong, .zoho-monitor-milestone-list span { display: block; }
        .zoho-monitor-milestone-list strong { font-size: 13px; }
        .zoho-monitor-milestone-list span { margin-top: 4px; color: var(--muted); font-size: 12px; }
        .zoho-monitor-last-error { margin: 0 18px 16px; padding: 10px 11px; border: 1px solid rgba(251,113,133,.24); border-radius: 9px; background: rgba(251,113,133,.08); }
        .zoho-monitor-last-error strong, .zoho-monitor-last-error span { display: block; }
        .zoho-monitor-last-error strong { color: #fda4af; font-size: 11px; }
        .zoho-monitor-last-error span { margin-top: 4px; color: #fecdd3; font-size: 12px; line-height: 1.4; }
        .zoho-monitor-breakdown { margin: 0 18px 18px; padding-top: 13px; border-top: 1px solid var(--border); }
        .zoho-monitor-breakdown-heading { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 7px; }
        .zoho-monitor-breakdown-heading strong { font-size: 12px; }
        .zoho-monitor-breakdown-heading span { color: var(--muted); font-size: 10px; }
        .zoho-monitor-breakdown-row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--border); }
        .zoho-monitor-breakdown-row strong, .zoho-monitor-breakdown-row span { display: block; }
        .zoho-monitor-breakdown-row strong { font-size: 11px; }
        .zoho-monitor-breakdown-row span { margin-top: 3px; color: var(--muted); font-size: 10px; line-height: 1.3; }
        .zoho-monitor-breakdown-row b { color: #fda4af; font-size: 14px; }
        .zoho-monitor-panel-intro { margin: 0; padding: 0 18px 10px; color: var(--muted); font-size: 12px; line-height: 1.45; }
        .zoho-monitor-notification-list { max-height: 302px; overflow-y: auto; padding: 0 18px 10px; }
        .zoho-monitor-notification-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); }
        .zoho-monitor-notification-row strong, .zoho-monitor-notification-row span { display: block; }
        .zoho-monitor-notification-row strong { font-size: 12px; }
        .zoho-monitor-notification-row span { margin-top: 3px; color: var(--muted); font-size: 11px; }
        .zoho-monitor-notification-count { min-width: 58px; text-align: right; }
        .zoho-monitor-notification-count strong { color: var(--muted); font-size: 16px; }
        .zoho-monitor-notification-count.is-emitted strong { color: #4ade80; }
        .zoho-monitor-activity-panel { margin-top: 14px; }
        .zoho-monitor-activity-count { border: 1px solid var(--border); border-radius: 999px; padding: 6px 9px; color: var(--muted); font-size: 11px; white-space: nowrap; }
        .zoho-monitor-table-wrap { overflow-x: auto; }
        .zoho-monitor-table { width: 100%; border-collapse: collapse; min-width: 760px; font-size: 12px; }
        .zoho-monitor-table th { padding: 10px 18px; color: var(--muted); background: color-mix(in srgb, var(--surface-hover) 70%, transparent); text-align: left; font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
        .zoho-monitor-table td { padding: 12px 18px; border-top: 1px solid var(--border); vertical-align: middle; }
        .zoho-monitor-table td strong, .zoho-monitor-table td time, .zoho-monitor-table td small { display: block; }
        .zoho-monitor-table-message { display: block; max-width: 340px; margin-top: 4px; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
        .zoho-monitor-table-diagnosis { display: block; max-width: 420px; margin-top: 5px; color: #fda4af; font-size: 10px; line-height: 1.35; }
        .zoho-monitor-table code { color: #b9d0ff; font-size: 11px; }
        .zoho-monitor-status { border-radius: 999px; padding: 5px 8px; font-size: 11px; font-weight: 800; white-space: nowrap; }
        .zoho-monitor-status.is-success { color: #86efac; background: rgba(74,222,128,.11); }
        .zoho-monitor-status.is-pending { color: #93c5fd; background: rgba(96,165,250,.11); }
        .zoho-monitor-status.is-error { color: #fda4af; background: rgba(251,113,133,.11); }
        .zoho-monitor-origin { color: var(--muted); white-space: nowrap; }
        .zoho-monitor-table time { color: var(--text); white-space: nowrap; }
        .zoho-monitor-table time small { margin-top: 3px; color: var(--muted); font-size: 10px; }
        .zoho-monitor-empty { padding: 18px; color: var(--muted); font-size: 12px; }
        .zoho-monitor-empty-large { display: grid; place-items: center; gap: 7px; min-height: 170px; text-align: center; }
        .zoho-monitor-empty-large svg { color: #7fa9ff; }
        .zoho-monitor-empty-large strong { color: var(--text); font-size: 14px; }
        .zoho-monitor-footnote { display: flex; flex-wrap: wrap; gap: 10px 18px; margin-top: 12px; color: var(--muted); font-size: 11px; }
        .zoho-monitor-footnote span::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: currentColor; }
        .zoho-monitor-footnote .is-ok { color: #4ade80; }
        .zoho-monitor-footnote .is-warn { color: #fbbf24; }
        .is-spinning { animation: zoho-monitor-spin .8s linear infinite; }
        @keyframes zoho-monitor-spin { to { transform: rotate(360deg); } }
        @media (max-width: 980px) { .zoho-monitor-hero, .zoho-monitor-grid { grid-template-columns: 1fr; flex-direction: column; } .zoho-monitor-health { align-self: stretch; } .zoho-monitor-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 800px) { .zoho-monitor-check-list { grid-template-columns: 1fr; } }
        @media (max-width: 600px) { .zoho-monitor-hero { padding: 20px 16px; } .zoho-monitor-cards { grid-template-columns: 1fr; } .zoho-monitor-actions { align-items: flex-start; flex-direction: column; } .zoho-monitor-actions button { width: 100%; justify-content: center; } .zoho-monitor-panel-heading { padding: 15px 14px 10px; } .zoho-monitor-notification-list, .zoho-monitor-milestone-list { padding-left: 14px; padding-right: 14px; } .zoho-monitor-last-error, .zoho-monitor-breakdown { margin-left: 14px; margin-right: 14px; } }
        @media (prefers-reduced-motion: reduce) { .is-spinning { animation: none; } }
      `}</style>
    </div>
  );
}
