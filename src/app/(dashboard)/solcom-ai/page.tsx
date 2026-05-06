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
        .select('tokens, cost, created_at');
      
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
  const serviceStatus = activeKeysCount > 0 ? 'Operativo' : 'Sin claves activas';
  const serviceStatusColor = activeKeysCount > 0 ? '#10b981' : '#f59e0b';

  const tabs = [
    { id: 'uso' as TabType, label: 'Uso y Estadísticas', icon: Activity },
    { id: 'claves' as TabType, label: 'Claves de API', icon: Key },
    { id: 'asistentes' as TabType, label: 'Asistentes IA', icon: Bot },
    { id: 'ayuda' as TabType, label: 'Ayuda', icon: HelpCircle }
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <RefreshCw size={32} className="animate-spin" color="#dc2626" />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            Solcom AI
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            Inteligencia Artificial de Solis Comercial • Powered by Software Nicaragua
          </p>
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

      <Card style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Estado del servicio</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: serviceStatusColor }}>{serviceStatus}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Claves registradas</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{apiKeys.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Asistentes registrados</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{assistants.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Qué hace “Actualizar”</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>Vuelve a leer las claves, asistentes y registros reales desde Supabase.</div>
          </div>
        </div>
      </Card>

      {/* Tabs de navegación */}
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        paddingBottom: 16
      }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                background: isActive ? 'rgba(220, 38, 38, 0.1)' : 'transparent',
                border: isActive ? '1px solid rgba(220, 38, 38, 0.3)' : '1px solid transparent',
                borderRadius: 8,
                color: isActive ? '#dc2626' : 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.2s'
              }}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, background: 'rgba(220, 38, 38, 0.1)', borderRadius: 8 }}>
                  <Zap size={20} color="#dc2626" />
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Solicitudes Totales</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{formatNumber(usage.total_requests)}</div>
            </Card>

            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 8 }}>
                  <MessageSquare size={20} color="#3b82f6" />
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Tokens Usados</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{formatNumber(usage.total_tokens)}</div>
            </Card>

            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8 }}>
                  <DollarSign size={20} color="#10b981" />
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Costo Total</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{formatCurrency(usage.total_cost)}</div>
            </Card>

            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, background: 'rgba(249, 115, 22, 0.1)', borderRadius: 8 }}>
                  <TrendingUp size={20} color="#f97316" />
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Este Mes</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{formatNumber(usage.this_month_requests)}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                {formatNumber(usage.this_month_tokens)} tokens
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Card style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Claves activas</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{formatNumber(activeKeysCount)}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
                {revokedKeysCount > 0 ? `${formatNumber(revokedKeysCount)} revocadas` : 'Sin claves revocadas'}
              </div>
            </Card>

            <Card style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Costo del mes</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{formatCurrency(usage.this_month_cost)}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
                Consumo acumulado del mes actual
              </div>
            </Card>

            <Card style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Promedio por solicitud</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{formatNumber(Math.round(averageTokensPerRequest))}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
                {formatCurrency(averageCostPerRequest)} por solicitud
              </div>
            </Card>

            <Card style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Última actividad</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {lastUsageAt ? new Date(lastUsageAt).toLocaleDateString('es-NI') : 'Sin actividad'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
                {lastUsageAt ? new Date(lastUsageAt).toLocaleTimeString('es-NI') : 'Todavía no hay registros'}
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)', gap: 16 }}>
            <Card style={{ padding: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Resumen ejecutivo del servicio</h3>
              <div style={{ display: 'grid', gap: 12, color: 'rgba(255,255,255,0.82)', fontSize: 14, lineHeight: 1.6 }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>Asistentes con texto</span>
                  <strong>{formatNumber(assistantsWithText)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>Asistentes con inventario</span>
                  <strong>{formatNumber(assistantsWithInventory)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>Asistentes con ventas</span>
                  <strong>{formatNumber(assistantsWithSales)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>Días con uso este mes</span>
                  <strong>{formatNumber(usageDaysThisMonth)}</strong>
                </div>
              </div>
            </Card>
          </div>

          {/* Gráficos avanzados */}
          {usageLogs.length > 0 && (
            <DashboardCharts usageLogs={usageLogs} />
          )}

          {/* Explicación */}
          <Card style={{ padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>¿Qué es esto?</h3>
            <div style={{ display: 'grid', gap: 16, color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.6 }}>
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
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
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
              background: 'rgba(249, 115, 22, 0.1)', 
              borderRadius: 8, 
              marginBottom: 24,
              border: '1px solid rgba(249, 115, 22, 0.2)'
            }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                ⚠️ <strong>Importante:</strong> No compartas tus claves de API. Si crees que una clave fue comprometida, elimínala inmediatamente y crea una nueva.
              </div>
            </div>

            {/* Lista de claves */}
            {apiKeys.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}>
                <Key size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                <p>No tienes claves de API creadas en Supabase</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>Si acabas de crear una, usa “Actualizar” para volver a leer la base de datos.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {apiKeys.map(key => (
                  <div key={key.id} style={{
                    padding: 16,
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.05)',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                        <code style={{ background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: 4 }}>
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
                        {copiedKey === key.id ? <CheckCircle2 size={16} color="#10b981" /> : <Copy size={16} />}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteApiKey(key.id)}
                      >
                        <Trash2 size={16} color="#ef4444" />
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
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div style={{
                background: '#1a1a2e',
                padding: 32,
                borderRadius: 16,
                width: '100%',
                maxWidth: 450,
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                {newlyCreatedKey ? (
                  <>
                    <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
                      ✅ Clave Creada Exitosamente
                    </h3>
                    <div style={{ 
                      padding: 16, 
                      background: 'rgba(16, 185, 129, 0.1)', 
                      borderRadius: 8, 
                      marginBottom: 16,
                      border: '1px solid rgba(16, 185, 129, 0.2)'
                    }}>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 12 }}>
                        <strong>¡Copia esta clave ahora!</strong> No podrás verla de nuevo.
                      </p>
                      <code style={{ 
                        display: 'block',
                        background: 'rgba(0,0,0,0.3)', 
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
                      <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
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
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8,
                          color: '#fff',
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
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
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
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}>
                <Bot size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                <p>No tienes asistentes configurados</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>Crea un asistente para automatizar tareas</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {assistants.map(assistant => (
                  <div key={assistant.id} style={{
                    padding: 20,
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                      <div>
                        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{assistant.name}</h3>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                          {assistant.description || 'Sin descripción'}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteAssistant(assistant.id)}>
                        <Trash2 size={16} color="#ef4444" />
                      </Button>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 500, marginRight: 8, color: 'rgba(255,255,255,0.6)' }}>
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
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div style={{
                background: '#1a1a2e',
                padding: 32,
                borderRadius: 16,
                width: '100%',
                maxWidth: 500,
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
                  Crear Nuevo Asistente
                </h3>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
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
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14
                    }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
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
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14,
                      resize: 'none'
                    }}
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
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
                            ? 'rgba(220, 38, 38, 0.1)'
                            : 'rgba(255,255,255,0.03)',
                          border: newAssistantCaps[cap.key as keyof typeof newAssistantCaps]
                            ? '1px solid rgba(220, 38, 38, 0.3)'
                            : '1px solid rgba(255,255,255,0.05)',
                          borderRadius: 8,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{cap.label}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{cap.desc}</div>
                        </div>
                        {newAssistantCaps[cap.key as keyof typeof newAssistantCaps] ? (
                          <CheckCircle2 size={20} color="#dc2626" />
                        ) : (
                          <XCircle size={20} color="rgba(255,255,255,0.2)" />
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
              <div style={{ padding: 20, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#3b82f6' }}>
                  🤖 ¿Qué es Solcom AI?
                </h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
                  Es el sistema de inteligencia artificial integrado en Solis Comercial. Te permite hacer preguntas 
                  sobre tu inventario, analizar compras, y obtener recomendaciones automáticas basadas en tus datos reales.
                </p>
              </div>

              <div style={{ padding: 20, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 12, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#10b981' }}>
                  🔑 ¿Para qué sirven las Claves de API?
                </h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
                  Las claves de API te permiten conectar aplicaciones externas (como Zoho SalesIQ, apps móviles, 
                  o sistemas de terceros) con Solcom AI. Cada clave es única y registra el uso de cada aplicación.
                </p>
              </div>

              <div style={{ padding: 20, background: 'rgba(249, 115, 22, 0.1)', borderRadius: 12, border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#f97316' }}>
                  🤝 ¿Qué son los Asistentes?
                </h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
                  Los asistentes son "personalidades" de IA configuradas para tareas específicas. Por ejemplo, 
                  puedes tener un asistente especializado en compras que analiza qué productos necesitas reponer, 
                  y otro para atención al cliente que responde preguntas sobre productos.
                </p>
              </div>

              <div style={{ padding: 20, background: 'rgba(220, 38, 38, 0.1)', borderRadius: 12, border: '1px solid rgba(220, 38, 38, 0.2)' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#dc2626' }}>
                  📊 ¿Cómo se mide el uso?
                </h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
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
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
                Para conectar Solcom AI con tu chat de Zoho SalesIQ:
              </p>
              
              <ol style={{ paddingLeft: 20, display: 'grid', gap: 12, fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
                <li><strong>Crea una clave de API</strong> en la pestaña "Claves de API"</li>
                <li>En Zoho SalesIQ, ve a <strong>Configuración → Integraciones → Webhooks</strong></li>
                <li>Crea un nuevo webhook con la URL de tu servidor</li>
                <li>Agrega el header <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>Authorization: Bearer TU_CLAVE_API</code></li>
                <li>Configura el formato de mensaje según la documentación</li>
              </ol>

              <div style={{ 
                padding: 16, 
                background: 'rgba(59, 130, 246, 0.1)', 
                borderRadius: 8,
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
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
