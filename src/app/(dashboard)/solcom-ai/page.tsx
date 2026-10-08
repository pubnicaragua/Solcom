'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import DashboardCharts from '@/components/solcom-ai/DashboardCharts';
import { 
  RefreshCw, Key, FileText, Bot, Settings, 
  Copy, Trash2, Plus, Activity, 
  MessageSquare, Database, CheckCircle2, XCircle,
  DollarSign, Zap, TrendingUp, HelpCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface APIKey {
  id: string;
  name: string;
  key: string;
  full_key?: string | null;
  created_at: string;
  last_used: string;
  status: 'active' | 'revoked';
  tokens_used: number;
}

interface Assistant {
  id: string;
  name: string;
  description: string;
  capabilities: {
    text: boolean;
    inventory: boolean;
    sales: boolean;
  };
  created_at: string;
}

interface UsageStats {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  this_month_requests: number;
  this_month_tokens: number;
  this_month_cost: number;
}

interface UsageLogRow {
  tokens: number | null;
  cost: number | null;
  created_at: string;
  request_type: string;
}

type TabType = 'uso' | 'claves' | 'asistentes' | 'ayuda';

export default function SolcomAIPage() {
  const [activeTab, setActiveTab] = useState<TabType>('uso');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Estados de datos
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [usage, setUsage] = useState<UsageStats>({
    total_requests: 0,
    total_tokens: 0,
    total_cost: 0,
    this_month_requests: 0,
    this_month_tokens: 0,
    this_month_cost: 0
  });
  const [usageLogs, setUsageLogs] = useState<UsageLogRow[]>([]);
  
  // Estados de modales
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [showNewAssistantModal, setShowNewAssistantModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newAssistantName, setNewAssistantName] = useState('');
  const [newAssistantDesc, setNewAssistantDesc] = useState('');
  const [newAssistantCaps, setNewAssistantCaps] = useState({
    text: true,
    inventory: false,
    sales: false
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const { data: keysData } = await (supabase as any)
        .from('ai_api_keys')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (keysData) setApiKeys(keysData as APIKey[]);

      const { data: assistantsData } = await (supabase as any)
        .from('ai_assistants')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (assistantsData) setAssistants(assistantsData as Assistant[]);

      const { data: usageData } = await (supabase as any)
        .from('ai_usage_logs')
        .select('tokens, cost, created_at, request_type');
      
      if (usageData) {
        const usageRows = usageData as UsageLogRow[];
        setUsageLogs(usageRows);
        const now = new Date();
        const thisMonth = usageRows.filter((u: UsageLogRow) => {
          const d = new Date(u.created_at);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });

        setUsage({
          total_requests: usageRows.length,
          total_tokens: usageRows.reduce((sum: number, u: UsageLogRow) => sum + (u.tokens || 0), 0),
          total_cost: usageRows.reduce((sum: number, u: UsageLogRow) => sum + (u.cost || 0), 0),
          this_month_requests: thisMonth.length,
          this_month_tokens: thisMonth.reduce((sum: number, u: UsageLogRow) => sum + (u.tokens || 0), 0),
          this_month_cost: thisMonth.reduce((sum: number, u: UsageLogRow) => sum + (u.cost || 0), 0)
        });
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const generateApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'sk-solcom-';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    
    const fullKey = generateApiKey();
    const maskedKey = `sk-...${fullKey.slice(-4)}`;
    
    try {
      const { data, error } = await (supabase as any)
        .from('ai_api_keys')
        .insert({
          name: newKeyName,
          key: maskedKey,
          full_key: fullKey,
          status: 'active',
          tokens_used: 0
        })
        .select()
        .single();

      if (error) throw error;
      
      setNewlyCreatedKey(fullKey);
      setApiKeys(prev => [data as APIKey, ...prev]);
      setNewKeyName('');
    } catch (error) {
      console.error('Error creando clave:', error);
      alert('Error al crear la clave. Verifica que la tabla ai_api_keys exista en Supabase.');
    }
  };

  const deleteApiKey = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta clave? Esta acción no se puede deshacer.')) return;
    
    try {
      await (supabase as any).from('ai_api_keys').delete().eq('id', id);
      setApiKeys(prev => prev.filter(k => k.id !== id));
    } catch (error) {
      console.error('Error eliminando clave:', error);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const createAssistant = async () => {
    if (!newAssistantName.trim()) return;
    
    try {
      const { data, error } = await (supabase as any)
        .from('ai_assistants')
        .insert({
          name: newAssistantName,
          description: newAssistantDesc,
          capabilities: newAssistantCaps
        })
        .select()
        .single();

      if (error) throw error;
      
      setAssistants(prev => [data as Assistant, ...prev]);
      setShowNewAssistantModal(false);
      setNewAssistantName('');
      setNewAssistantDesc('');
      setNewAssistantCaps({ text: true, inventory: false, sales: false });
    } catch (error) {
      console.error('Error creando asistente:', error);
      alert('Error al crear el asistente. Verifica que la tabla ai_assistants exista en Supabase.');
    }
  };

  const deleteAssistant = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este asistente?')) return;
    
    try {
      await (supabase as any).from('ai_assistants').delete().eq('id', id);
      setAssistants(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error eliminando asistente:', error);
    }
  };

  const formatNumber = (num: number) => num.toLocaleString('es-NI');
  const formatCurrency = (num: number) => `$${num.toFixed(2)}`;
  const activeKeysCount = apiKeys.filter((key) => key.status === 'active').length;
  const revokedKeysCount = apiKeys.filter((key) => key.status === 'revoked').length;
  const averageTokensPerRequest = usage.total_requests > 0 ? usage.total_tokens / usage.total_requests : 0;
  const averageCostPerRequest = usage.total_requests > 0 ? usage.total_cost / usage.total_requests : 0;
  const assistantsWithInventory = assistants.filter((assistant) => assistant.capabilities?.inventory).length;
  const assistantsWithSales = assistants.filter((assistant) => assistant.capabilities?.sales).length;
  const assistantsWithText = assistants.filter((assistant) => assistant.capabilities?.text).length;
  const lastUsageAt = usageLogs.length > 0
    ? usageLogs
        .map((log) => new Date(log.created_at).getTime())
        .sort((a, b) => b - a)[0]
    : null;
  const usageDaysThisMonth = Array.from(
    new Set(
      usageLogs
        .filter((log) => {
          const date = new Date(log.created_at);
          const now = new Date();
          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        })
        .map((log) => new Date(log.created_at).toISOString().slice(0, 10))
    )
  ).length;

  // Desglose por tipo de solicitud
  const REQUEST_TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
    'salesiq_chatbot': { label: 'Chatbot SalesIQ (Mía)', color: 'var(--info)', icon: '🤖' },
    'ai_chat_customer-service': { label: 'Chat Interno - Atención', color: 'var(--success)', icon: '💬' },
    'ai_chat_collections': { label: 'Chat Interno - Cobranza', color: 'var(--warning)', icon: '💰' },
    'ai_chat_quotes': { label: 'Chat Interno - Cotizaciones', color: 'var(--kpi-violet)', icon: '📋' },
    'ai_chat_invoicing': { label: 'Chat Interno - Facturación', color: 'var(--brand-primary)', icon: '📄' },
    'ai_chat_audit': { label: 'Chat Interno - Auditoría', color: 'var(--info)', icon: '🔍' },
    'image_analysis': { label: 'Análisis de Imágenes', color: 'var(--warning)', icon: '📷' },
    'url_analysis': { label: 'Análisis de URLs', color: 'var(--kpi-violet)', icon: '🔗' },
  };

  const usageByType = usageLogs.reduce((acc, log) => {
    const type = log.request_type || 'desconocido';
    if (!acc[type]) acc[type] = { requests: 0, tokens: 0, cost: 0 };
    acc[type].requests += 1;
    acc[type].tokens += (log.tokens || 0);
    acc[type].cost += (log.cost || 0);
    return acc;
  }, {} as Record<string, { requests: number; tokens: number; cost: number }>);

  const sortedUsageTypes = Object.entries(usageByType).sort(([, a], [, b]) => b.cost - a.cost);
  const serviceStatus = activeKeysCount > 0 ? 'Operativo' : 'Sin claves activas';
  const serviceStatusColor = activeKeysCount > 0 ? 'var(--success)' : 'var(--warning)';

  const tabs = [
    { id: 'uso' as TabType, label: 'Uso y Estadísticas', icon: Activity },
    { id: 'claves' as TabType, label: 'Claves de API', icon: Key },
    { id: 'asistentes' as TabType, label: 'Asistentes IA', icon: Bot },
    { id: 'ayuda' as TabType, label: 'Ayuda', icon: HelpCircle }
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <RefreshCw size={32} className="animate-spin" color="var(--brand-primary)" />
      </div>
    );
  }

  return (
    <div className="solcom-ai-view" style={{ display: 'grid', gap: 20 }}>
      {/* Encabezado */}
      <div className="solcom-ai-page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="system-title-mark"><Bot size={21} /></div>
          <div>
            <h1 className="inventory-title">
              Solcom AI
            </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Inteligencia Artificial de Solis Comercial • Powered by Software Nicaragua
          </p>
          </div>
        </div>
        <Button 
          variant="primary" 
          onClick={fetchData}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} style={{ marginRight: 8 }} />
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </Button>
      </div>

      <Card className="solcom-ai-service-summary" style={{ padding: 20 }}>
        <div className="solcom-ai-service-grid">
          <div className="solcom-ai-service-item">
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Estado del servicio</div>
            <div className="solcom-ai-service-value" style={{ color: serviceStatusColor }}>{serviceStatus}</div>
          </div>
          <div className="solcom-ai-service-item">
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Claves registradas</div>
            <div className="solcom-ai-service-value">{apiKeys.length}</div>
          </div>
          <div className="solcom-ai-service-item">
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Asistentes registrados</div>
            <div className="solcom-ai-service-value">{assistants.length}</div>
          </div>
          <div className="solcom-ai-service-item solcom-ai-service-note">
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Qué hace “Actualizar”</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Vuelve a leer las claves, asistentes y registros reales desde Supabase.</div>
          </div>
        </div>
      </Card>

      {/* Tabs de navegación */}
      <div className="solcom-ai-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`solcom-ai-tab${isActive ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB: USO Y ESTADÍSTICAS */}
      {activeTab === 'uso' && (
        <div style={{ display: 'grid', gap: 24 }}>
          {/* Tarjetas de resumen */}
          <div className="solcom-ai-kpi-grid">
            <Card className="solcom-ai-kpi-card tone-brand" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, background: 'var(--brand-surface)', borderRadius: 8 }}><Zap size={20} color="var(--brand-primary)" /></div>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Solicitudes Totales</span>
              </div>
              <div className="solcom-ai-kpi-value">{formatNumber(usage.total_requests)}</div>
            </Card>
            <Card className="solcom-ai-kpi-card tone-info" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, background: 'var(--info-surface)', borderRadius: 8 }}><MessageSquare size={20} color="var(--info)" /></div>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Tokens Usados</span>
              </div>
              <div className="solcom-ai-kpi-value">{formatNumber(usage.total_tokens)}</div>
            </Card>
            <Card className="solcom-ai-kpi-card tone-success" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, background: 'var(--success-surface)', borderRadius: 8 }}><DollarSign size={20} color="var(--success)" /></div>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Costo Total</span>
              </div>
              <div className="solcom-ai-kpi-value">{formatCurrency(usage.total_cost)}</div>
            </Card>
            <Card className="solcom-ai-kpi-card tone-warning" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, background: 'var(--warning-surface)', borderRadius: 8 }}><TrendingUp size={20} color="var(--warning)" /></div>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Este Mes</span>
              </div>
              <div className="solcom-ai-kpi-value">{formatNumber(usage.this_month_requests)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{formatNumber(usage.this_month_tokens)} tokens</div>
            </Card>
          </div>
          <div className="solcom-ai-kpi-grid solcom-ai-kpi-grid-secondary">
            <Card className="solcom-ai-kpi-card tone-info" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Claves activas</div>
              <div className="solcom-ai-kpi-value">{formatNumber(activeKeysCount)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{revokedKeysCount > 0 ? `${formatNumber(revokedKeysCount)} revocadas` : 'Sin claves revocadas'}</div>
            </Card>
            <Card className="solcom-ai-kpi-card tone-warning" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Costo del mes</div>
              <div className="solcom-ai-kpi-value">{formatCurrency(usage.this_month_cost)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Consumo acumulado del mes actual</div>
            </Card>
            <Card className="solcom-ai-kpi-card tone-violet" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Promedio por solicitud</div>
              <div className="solcom-ai-kpi-value">{formatNumber(Math.round(averageTokensPerRequest))}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{formatCurrency(averageCostPerRequest)} por solicitud</div>
            </Card>
            <Card className="solcom-ai-kpi-card tone-brand" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Última actividad</div>
              <div className="solcom-ai-kpi-value solcom-ai-kpi-value-compact">{lastUsageAt ? new Date(lastUsageAt).toLocaleDateString('es-NI') : 'Sin actividad'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{lastUsageAt ? new Date(lastUsageAt).toLocaleTimeString('es-NI') : 'Todavía no hay registros'}</div>
            </Card>
          </div>

          <div className="solcom-ai-insights-grid" style={{ display: 'grid', gap: 16 }}>
            <Card style={{ padding: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Resumen ejecutivo del servicio</h3>
              <div style={{ display: 'grid', gap: 12, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                <p>
                  <strong>Qué estás viendo:</strong> este panel resume cuánto se está usando la IA, cuántas claves siguen activas y si los asistentes configurados están listos para responder.
                </p>
                <p>
                  <strong>Si las solicitudes suben:</strong> significa que más módulos del sistema están consumiendo IA, por ejemplo `Compras AI` o integraciones externas.
                </p>
                <p>
                  <strong>Si el costo del mes sube:</strong> no es necesariamente malo. Solo indica que hubo más actividad o conversaciones más largas.
                </p>
                <p>
                  <strong>Si no hay claves activas:</strong> el servicio puede verse configurado, pero aplicaciones externas no podrán autenticarse correctamente.
                </p>
              </div>
            </Card>

            <Card style={{ padding: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Capacidad actual</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, background: 'var(--surface-hover)' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Asistentes con texto</span>
                  <strong>{formatNumber(assistantsWithText)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, background: 'var(--surface-hover)' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Asistentes con inventario</span>
                  <strong>{formatNumber(assistantsWithInventory)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, background: 'var(--surface-hover)' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Asistentes con ventas</span>
                  <strong>{formatNumber(assistantsWithSales)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, background: 'var(--surface-hover)' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Días con uso este mes</span>
                  <strong>{formatNumber(usageDaysThisMonth)}</strong>
                </div>
              </div>
            </Card>
          </div>

          {/* Desglose por origen */}
          <Card style={{ padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Desglose por Origen</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              Detalle de consumo por cada módulo o integración que usa IA
            </p>
            {sortedUsageTypes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                <Database size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
                <p>No hay registros de uso aún</p>
              </div>
            ) : (
              <div className="solcom-ai-breakdown-table" style={{ display: 'grid', gap: 8 }}>
                {/* Header */}
                <div className="solcom-ai-breakdown-header" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, padding: '8px 12px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                  <span>Origen</span>
                  <span style={{ textAlign: 'right' }}>Solicitudes</span>
                  <span style={{ textAlign: 'right' }}>Tokens</span>
                  <span style={{ textAlign: 'right' }}>Costo</span>
                </div>
                {sortedUsageTypes.map(([type, data]) => {
                  const info = REQUEST_TYPE_LABELS[type] || { label: type, color: 'var(--muted)', icon: '⚡' };
                  const costPercent = usage.total_cost > 0 ? (data.cost / usage.total_cost) * 100 : 0;
                  return (
                    <div key={type} className="solcom-ai-breakdown-row" style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr',
                      gap: 12,
                      padding: '12px',
                      background: 'var(--surface-hover)',
                      borderRadius: 10,
                      borderLeft: `3px solid ${info.color}`,
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{info.icon}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{info.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{costPercent.toFixed(1)}% del total</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 600 }}>{formatNumber(data.requests)}</div>
                      <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 600 }}>{formatNumber(data.tokens)}</div>
                      <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: info.color }}>{formatCurrency(data.cost)}</div>
                    </div>
                  );
                })}
                {/* Total row */}
                <div className="solcom-ai-breakdown-total" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, padding: '12px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Total</span>
                  <span style={{ textAlign: 'right', fontSize: 15, fontWeight: 700 }}>{formatNumber(usage.total_requests)}</span>
                  <span style={{ textAlign: 'right', fontSize: 15, fontWeight: 700 }}>{formatNumber(usage.total_tokens)}</span>
                      <span style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(usage.total_cost)}</span>
                </div>
              </div>
            )}
          </Card>

          {/* Gráficos avanzados */}
          {usageLogs.length > 0 && (
            <DashboardCharts usageLogs={usageLogs} />
          )}

          {/* Explicación */}
          <Card style={{ padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>¿Qué es esto?</h3>
            <div style={{ display: 'grid', gap: 16, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              <p>
                <strong>Solcom AI</strong> es el servicio de inteligencia artificial de Solis Comercial. 
                Cada vez que usas funciones de IA en el sistema (como el chatbot de compras, análisis de inventario, 
                o asistentes virtuales), se registra aquí el uso.
              </p>
              <p>
                <strong>Tokens:</strong> Son las unidades de texto que procesa la IA. Una palabra equivale aproximadamente a 1-2 tokens.
                Mientras más largo sea el mensaje o respuesta, más tokens se consumen.
              </p>
              <p>
                <strong>Solicitudes:</strong> Cada vez que envías un mensaje a la IA o pides un análisis, cuenta como una solicitud.
              </p>
              <p>
                <strong>Actualizar:</strong> Este botón no crea nada nuevo. Solo vuelve a consultar Supabase para mostrar el estado más reciente de claves, asistentes y uso real.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* TAB: CLAVES DE API */}
      {activeTab === 'claves' && (
        <div style={{ display: 'grid', gap: 24 }}>
          <Card style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Claves de API</h2>
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>
                  Usa estas claves para conectar aplicaciones externas con Solcom AI
                </p>
              </div>
              <Button variant="primary" onClick={() => setShowNewKeyModal(true)}>
                <Plus size={16} style={{ marginRight: 8 }} />
                Crear Nueva Clave
              </Button>
            </div>

            {/* Alerta de seguridad */}
            <div style={{ 
              padding: 16, 
              background: 'var(--warning-surface)',
              borderRadius: 8, 
              marginBottom: 24,
              border: '1px solid color-mix(in srgb, var(--warning) 34%, var(--border))'
            }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                ⚠️ <strong>Importante:</strong> No compartas tus claves de API. Si crees que una clave fue comprometida, elimínala inmediatamente y crea una nueva.
              </div>
            </div>

            {/* Lista de claves */}
            {apiKeys.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                <Key size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                <p>No tienes claves de API creadas en Supabase</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>Si acabas de crear una, usa “Actualizar” para volver a leer la base de datos.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {apiKeys.map(key => (
                  <div key={key.id} style={{
                    padding: 16,
                    background: 'var(--surface-hover)',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 16,
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <span style={{ fontSize: 16, fontWeight: 600 }}>{key.name}</span>
                        <Badge variant={key.status === 'active' ? 'success' : 'danger'}>
                          {key.status === 'active' ? 'Activa' : 'Revocada'}
                        </Badge>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: 'var(--muted)' }}>
                        <code style={{ background: 'var(--overlay)', padding: '4px 8px', borderRadius: 4 }}>
                          {key.key}
                        </code>
                        <span>Creada: {new Date(key.created_at).toLocaleDateString('es-NI')}</span>
                        <span>Tokens: {formatNumber(key.tokens_used)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => copyToClipboard(key.full_key || key.key, key.id)}
                      >
                        {copiedKey === key.id ? <CheckCircle2 size={16} color="var(--success)" /> : <Copy size={16} />}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteApiKey(key.id)}
                      >
                        <Trash2 size={16} color="var(--danger)" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Modal crear clave */}
          {showNewKeyModal && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'var(--overlay)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div style={{
                background: 'var(--panel-elevated)',
                padding: 32,
                borderRadius: 16,
                width: '100%',
                maxWidth: 450,
                border: '1px solid var(--border)'
              }}>
                {newlyCreatedKey ? (
                  <>
                    <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
                      ✅ Clave Creada Exitosamente
                    </h3>
                    <div style={{ 
                      padding: 16, 
                      background: 'var(--success-surface)',
                      borderRadius: 8, 
                      marginBottom: 16,
                      border: '1px solid color-mix(in srgb, var(--success) 34%, var(--border))'
                    }}>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                        <strong>¡Copia esta clave ahora!</strong> No podrás verla de nuevo.
                      </p>
                      <code style={{ 
                        display: 'block',
                        background: 'var(--overlay)',
                        padding: 12, 
                        borderRadius: 6,
                        fontSize: 12,
                        wordBreak: 'break-all'
                      }}>
                        {newlyCreatedKey}
                      </code>
                    </div>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                      <Button 
                        variant="ghost"
                        onClick={() => copyToClipboard(newlyCreatedKey, 'new')}
                      >
                        {copiedKey === 'new' ? 'Copiada ✓' : 'Copiar Clave'}
                      </Button>
                      <Button 
                        variant="primary"
                        onClick={() => {
                          setShowNewKeyModal(false);
                          setNewlyCreatedKey(null);
                        }}
                      >
                        Listo
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
                      Crear Nueva Clave de API
                    </h3>
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                        Nombre de la clave (para identificarla)
                      </label>
                      <input
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="Ej: Integración Zoho, App Móvil, etc."
                        style={{
                          width: '100%',
                          padding: 12,
                          background: 'var(--surface-hover)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          color: 'var(--text)',
                          fontSize: 14
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                      <Button 
                        variant="ghost" 
                        onClick={() => {
                          setShowNewKeyModal(false);
                          setNewKeyName('');
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button 
                        variant="primary"
                        onClick={createApiKey}
                        disabled={!newKeyName.trim()}
                      >
                        Crear Clave
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: ASISTENTES IA */}
      {activeTab === 'asistentes' && (
        <div style={{ display: 'grid', gap: 24 }}>
          <Card style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Asistentes de IA</h2>
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>
                  Configura asistentes virtuales para diferentes áreas del negocio
                </p>
              </div>
              <Button variant="primary" onClick={() => setShowNewAssistantModal(true)}>
                <Plus size={16} style={{ marginRight: 8 }} />
                Crear Asistente
              </Button>
            </div>

            {/* Lista de asistentes */}
            {assistants.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                <Bot size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                <p>No tienes asistentes configurados</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>Crea un asistente para automatizar tareas</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {assistants.map(assistant => (
                  <div key={assistant.id} style={{
                    padding: 20,
                    background: 'var(--surface-hover)',
                    borderRadius: 12,
                    border: '1px solid var(--border)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                      <div>
                        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{assistant.name}</h3>
                        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                          {assistant.description || 'Sin descripción'}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteAssistant(assistant.id)}>
                        <Trash2 size={16} color="var(--danger)" />
                      </Button>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 500, marginRight: 8, color: 'var(--muted)' }}>
                        Capacidades:
                      </span>
                      {assistant.capabilities?.text && (
                        <Badge variant="neutral">💬 Texto</Badge>
                      )}
                      {assistant.capabilities?.inventory && (
                        <Badge variant="neutral">📦 Inventario</Badge>
                      )}
                      {assistant.capabilities?.sales && (
                        <Badge variant="neutral">💰 Ventas</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Modal crear asistente */}
          {showNewAssistantModal && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'var(--overlay)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div style={{
                background: 'var(--panel-elevated)',
                padding: 32,
                borderRadius: 16,
                width: '100%',
                maxWidth: 500,
                border: '1px solid var(--border)'
              }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
                  Crear Nuevo Asistente
                </h3>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                    Nombre del asistente
                  </label>
                  <input
                    type="text"
                    value={newAssistantName}
                    onChange={(e) => setNewAssistantName(e.target.value)}
                    placeholder="Ej: Asistente de Compras"
                    style={{
                      width: '100%',
                      padding: 12,
                      background: 'var(--surface-hover)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text)',
                      fontSize: 14
                    }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                    Descripción (opcional)
                  </label>
                  <textarea
                    value={newAssistantDesc}
                    onChange={(e) => setNewAssistantDesc(e.target.value)}
                    placeholder="¿Qué hace este asistente?"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: 12,
                      background: 'var(--surface-hover)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text)',
                      fontSize: 14,
                      resize: 'none'
                    }}
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                    Capacidades (¿qué puede hacer?)
                  </label>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {[
                      { key: 'text', label: '💬 Responder preguntas de texto', desc: 'Conversación general' },
                      { key: 'inventory', label: '📦 Consultar inventario', desc: 'Acceso a datos de productos y stock' },
                      { key: 'sales', label: '💰 Analizar ventas', desc: 'Acceso a datos de ventas y clientes' }
                    ].map(cap => (
                      <div
                        key={cap.key}
                        onClick={() => setNewAssistantCaps(prev => ({
                          ...prev,
                          [cap.key]: !prev[cap.key as keyof typeof prev]
                        }))}
                        style={{
                          padding: 12,
                          background: newAssistantCaps[cap.key as keyof typeof newAssistantCaps]
                            ? 'var(--brand-surface)'
                            : 'var(--surface-hover)',
                          border: newAssistantCaps[cap.key as keyof typeof newAssistantCaps]
                            ? '1px solid color-mix(in srgb, var(--brand-primary) 48%, var(--border))'
                            : '1px solid var(--border)',
                          borderRadius: 8,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{cap.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{cap.desc}</div>
                        </div>
                        {newAssistantCaps[cap.key as keyof typeof newAssistantCaps] ? (
                          <CheckCircle2 size={20} color="var(--brand-primary)" />
                        ) : (
                          <XCircle size={20} color="var(--muted)" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      setShowNewAssistantModal(false);
                      setNewAssistantName('');
                      setNewAssistantDesc('');
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    variant="primary"
                    onClick={createAssistant}
                    disabled={!newAssistantName.trim()}
                  >
                    Crear Asistente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: AYUDA */}
      {activeTab === 'ayuda' && (
        <div style={{ display: 'grid', gap: 24 }}>
          <Card style={{ padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
              ¿Cómo funciona Solcom AI?
            </h2>
            
            <div style={{ display: 'grid', gap: 24 }}>
              <div style={{ padding: 20, background: 'var(--info-surface)', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--info) 28%, var(--border))' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--info)' }}>
                  🤖 ¿Qué es Solcom AI?
                </h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Es el sistema de inteligencia artificial integrado en Solis Comercial. Te permite hacer preguntas 
                  sobre tu inventario, analizar compras, y obtener recomendaciones automáticas basadas en tus datos reales.
                </p>
              </div>

              <div style={{ padding: 20, background: 'var(--success-surface)', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--success) 28%, var(--border))' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--success)' }}>
                  🔑 ¿Para qué sirven las Claves de API?
                </h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Las claves de API te permiten conectar aplicaciones externas (como Zoho SalesIQ, apps móviles, 
                  o sistemas de terceros) con Solcom AI. Cada clave es única y registra el uso de cada aplicación.
                </p>
              </div>

              <div style={{ padding: 20, background: 'var(--warning-surface)', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--warning) 28%, var(--border))' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--warning)' }}>
                  🤝 ¿Qué son los Asistentes?
                </h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Los asistentes son "personalidades" de IA configuradas para tareas específicas. Por ejemplo, 
                  puedes tener un asistente especializado en compras que analiza qué productos necesitas reponer, 
                  y otro para atención al cliente que responde preguntas sobre productos.
                </p>
              </div>

              <div style={{ padding: 20, background: 'var(--brand-surface)', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--brand-primary) 28%, var(--border))' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--brand-primary)' }}>
                  📊 ¿Cómo se mide el uso?
                </h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Cada mensaje que envías o recibes de la IA consume "tokens". Un token es aproximadamente 
                  una palabra. El sistema registra cuántos tokens usas para que puedas monitorear el consumo.
                </p>
              </div>
            </div>
          </Card>

          <Card style={{ padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
              Integración con Zoho SalesIQ
            </h2>
            
            <div style={{ display: 'grid', gap: 16 }}>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                Para conectar Solcom AI con tu chat de Zoho SalesIQ:
              </p>
              
              <ol style={{ paddingLeft: 20, display: 'grid', gap: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
                <li><strong>Crea una clave de API</strong> en la pestaña "Claves de API"</li>
                <li>En Zoho SalesIQ, ve a <strong>Configuración → Integraciones → Webhooks</strong></li>
                <li>Crea un nuevo webhook con la URL de tu servidor</li>
                <li>Agrega el header <code style={{ background: 'var(--overlay)', padding: '2px 6px', borderRadius: 4 }}>Authorization: Bearer TU_CLAVE_API</code></li>
                <li>Configura el formato de mensaje según la documentación</li>
              </ol>

              <div style={{ 
                padding: 16, 
                background: 'var(--info-surface)',
                borderRadius: 8,
                border: '1px solid color-mix(in srgb, var(--info) 34%, var(--border))'
              }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  💡 <strong>Tip:</strong> Si necesitas ayuda con la integración, contacta al equipo de Software Nicaragua.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
