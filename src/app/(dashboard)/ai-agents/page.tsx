'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import IntegrationCard from '@/components/ai-agents/IntegrationCard';
import { Bot, MessageSquare, DollarSign, FileText, Phone, Shield, Send, Loader } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  description: string;
  icon: any;
  color: string;
  status: 'active' | 'inactive';
  queries: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const AGENTS: Agent[] = [
  {
    id: 'customer-service',
    name: 'Atención al Cliente',
    description: 'Responde consultas sobre disponibilidad de productos, precios y entregas',
    icon: MessageSquare,
    color: '#3B82F6',
    status: 'active',
    queries: 1247,
  },
  {
    id: 'collections',
    name: 'Cobranza',
    description: 'Gestiona recordatorios de pago y estados de cuenta',
    icon: DollarSign,
    color: 'var(--success)',
    status: 'active',
    queries: 856,
  },
  {
    id: 'quotes',
    name: 'Cotizaciones',
    description: 'Genera cotizaciones automáticas basadas en inventario disponible',
    icon: FileText,
    color: 'var(--warning)',
    status: 'active',
    queries: 634,
  },
  {
    id: 'invoicing',
    name: 'Facturación',
    description: 'Asiste en la emisión de facturas y documentos fiscales',
    icon: FileText,
    color: 'var(--brand-accent)',
    status: 'active',
    queries: 423,
  },
  {
    id: 'voice',
    name: 'Voz (Speech)',
    description: 'Integración con Twilio para llamadas automáticas',
    icon: Phone,
    color: '#8B5CF6',
    status: 'inactive',
    queries: 0,
  },
  {
    id: 'audit',
    name: 'Auditoría',
    description: 'Detecta inconsistencias y anomalías en el inventario',
    icon: Shield,
    color: 'var(--brand-primary)',
    status: 'active',
    queries: 312,
  },
];

// Documentación de integraciones
const mobileAppDocs = {
  setup: [
    'Instalar SDK de Solis Comercial en tu aplicación móvil',
    'Configurar API Key en el archivo de configuración',
    'Implementar el cliente de chat usando nuestro componente nativo',
    'Personalizar la UI según tu marca'
  ],
  requirements: [
    'Android 8.0+ o iOS 13+',
    'Conexión a internet',
    'API Key válida'
  ],
  apiEndpoint: 'https://api.soliscomercialni.com/v1/ai/chat',
  example: `// React Native
import { SolisAIChat } from '@solis/mobile-sdk';

<SolisAIChat
  apiKey="your-api-key"
  agentId="customer-service"
  theme="light"
/>`
};

const messengerDocs = {
  setup: [
    'Crear una aplicación en Facebook Developers',
    'Configurar webhook apuntando a tu servidor',
    'Agregar permisos de mensajería a tu página',
    'Conectar el webhook con nuestro endpoint de AI'
  ],
  requirements: [
    'Página de Facebook verificada',
    'Certificado SSL válido',
    'Token de acceso de página'
  ],
  apiEndpoint: 'POST /api/integrations/messenger/webhook'
};

const whatsappDocs = {
  setup: [
    'Crear cuenta en Twilio y obtener número de WhatsApp',
    'Configurar webhook en Twilio Console',
    'Agregar credenciales de Twilio en variables de entorno',
    'Activar la integración en el panel de administración'
  ],
  requirements: [
    'Cuenta Twilio verificada',
    'Número de WhatsApp Business',
    'Saldo en cuenta Twilio'
  ],
  apiEndpoint: 'POST /api/integrations/whatsapp/webhook',
  example: `// Configuración en .env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886`
};

const webDocs = {
  setup: [
    'Copiar el código del widget desde el panel',
    'Pegar el código antes del cierre de </body>',
    'Personalizar colores y posición del widget',
    'Publicar los cambios en tu sitio web'
  ],
  requirements: [
    'Sitio web con acceso al código HTML',
    'JavaScript habilitado'
  ],
  example: `<!-- Widget de Chat -->
<script>
  (function(w,d,s){
    var js=d.createElement(s);
    js.src='https://cdn.soliscomercialni.com/widget.js';
    js.dataset.apiKey='your-api-key';
    d.body.appendChild(js);
  })(window,document,'script');
</script>`
};

const tvDocs = {
  setup: [
    'Acceder a la URL del dashboard para pantallas',
    'Configurar en modo pantalla completa (F11)',
    'Seleccionar métricas a mostrar',
    'Configurar actualización automática'
  ],
  requirements: [
    'Navegador moderno (Chrome, Firefox, Edge)',
    'Resolución mínima 1920x1080',
    'Conexión estable a internet'
  ],
  apiEndpoint: 'https://dashboard.soliscomercialni.com/tv'
};

export default function AIAgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSendMessage() {
    if (!input.trim() || !selectedAgent) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question: input,
          agentId: selectedAgent.id,
        }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.answer || 'Lo siento, no pude procesar tu consulta.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Error al procesar la consulta. Por favor intenta de nuevo.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectAgent(agent: Agent) {
    setSelectedAgent(agent);
    setMessages([
      {
        role: 'assistant',
        content: `Hola, soy el agente de ${agent.name}. ${agent.description}. ¿En qué puedo ayudarte?`,
        timestamp: new Date(),
      },
    ]);
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="h-title">Agentes IA</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
            Prueba los agentes de inteligencia artificial en tiempo real
          </div>
        </div>
        <Badge variant="success" size="sm">
          <Bot size={14} style={{ marginRight: 4 }} />
          {AGENTS.filter(a => a.status === 'active').length} Activos
        </Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 14, height: 'calc(100vh - 200px)' }}>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start', overflowY: 'auto' }}>
          <Card>
            <div style={{ padding: 8 }}>
              <div className="h-subtitle" style={{ marginBottom: 12 }}>
                Agentes Disponibles
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {AGENTS.map((agent) => {
                  const Icon = agent.icon;
                  const isSelected = selectedAgent?.id === agent.id;
                  return (
                    <div
                      key={agent.id}
                      onClick={() => agent.status === 'active' && handleSelectAgent(agent)}
                      style={{
                        padding: 12,
                        borderRadius: 6,
                        border: `1px solid ${isSelected ? agent.color : 'var(--border)'}`,
                        background: isSelected ? `${agent.color}10` : 'var(--panel)',
                        cursor: agent.status === 'active' ? 'pointer' : 'not-allowed',
                        opacity: agent.status === 'inactive' ? 0.5 : 1,
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            background: `${agent.color}20`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Icon size={16} color={agent.color} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                            {agent.name}
                          </div>
                          <Badge 
                            variant={agent.status === 'active' ? 'success' : 'neutral'} 
                            size="sm"
                          >
                            {agent.status === 'active' ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                        {agent.description}
                      </div>
                      {agent.status === 'active' && (
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {agent.queries.toLocaleString()} consultas procesadas
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                💡 Ejemplos de Consultas
              </div>
              <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                <div>• "¿Cuántas laptops Dell hay en bodega X1?"</div>
                <div>• "¿Cuál es el precio del Monitor LG 24?"</div>
                <div>• "¿Qué productos tienen stock bajo?"</div>
                <div>• "Genera una cotización para 5 teclados"</div>
                <div>• "¿Cuándo fue la última sincronización?"</div>
              </div>
            </div>
          </Card>
        </div>

        <Card style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {selectedAgent ? (
            <>
              <div style={{ 
                padding: 16, 
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: `${selectedAgent.color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {(() => {
                    const Icon = selectedAgent.icon;
                    return <Icon size={20} color={selectedAgent.color} />;
                  })()}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedAgent.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {selectedAgent.description}
                  </div>
                </div>
              </div>

              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}>
                {messages.map((message, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '70%',
                        padding: 12,
                        borderRadius: 8,
                        background: message.role === 'user' 
                          ? selectedAgent.color 
                          : 'var(--panel)',
                        color: message.role === 'user' ? '#fff' : 'var(--text)',
                        border: message.role === 'assistant' ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                        {message.content}
                      </div>
                      <div style={{ 
                        fontSize: 10, 
                        marginTop: 6,
                        opacity: 0.7,
                      }}>
                        {message.timestamp.toLocaleTimeString('es-NI', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{
                      padding: 12,
                      borderRadius: 8,
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                    }}>
                      <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ 
                padding: 16, 
                borderTop: '1px solid var(--border)',
                display: 'flex',
                gap: 8,
              }}>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Escribe tu consulta..."
                  style={{ flex: 1 }}
                />
                <Button 
                  variant="primary" 
                  onClick={handleSendMessage}
                  disabled={loading || !input.trim()}
                >
                  <Send size={16} />
                </Button>
              </div>
            </>
          ) : (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 16,
              padding: 40,
              textAlign: 'center',
            }}>
              <Bot size={64} color="var(--muted)" />
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                  Selecciona un Agente IA
                </div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  Elige un agente de la lista para comenzar a interactuar
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div style={{ padding: 16 }}>
          <div className="h-subtitle" style={{ marginBottom: 12 }}>
            Estadísticas de Uso
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {AGENTS.filter(a => a.status === 'active').map((agent) => (
              <div key={agent.id} style={{ 
                padding: 12, 
                background: 'var(--panel)', 
                borderRadius: 6,
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {(() => {
                    const Icon = agent.icon;
                    return <Icon size={16} color={agent.color} />;
                  })()}
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{agent.name}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>
                  {agent.queries.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  consultas totales
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card>
          <div style={{ padding: 16 }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>⚡</span> Endpoint API para Integraciones
            </h2>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Conecta tus aplicaciones externas a nuestros agentes IA
            </div>
            
            <div style={{ background: 'var(--panel)', padding: 12, borderRadius: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                POST /api/ai/chat
              </div>
              <code style={{ 
                fontSize: 11, 
                fontFamily: 'monospace',
                color: 'var(--brand-primary)',
                display: 'block',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                https://tu-dominio.com/api/ai/chat
              </code>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Request Body:</div>
            <pre style={{ 
              background: '#0a1929', 
              padding: 12, 
              borderRadius: 6, 
              fontSize: 11,
              overflow: 'auto',
              border: '1px solid var(--border)'
            }}>
{`{
  "question": "¿Cuántas laptops hay?",
  "agentId": "customer-service"
}`}
            </pre>

            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 12, marginBottom: 8 }}>Response:</div>
            <pre style={{ 
              background: '#0a1929', 
              padding: 12, 
              borderRadius: 6, 
              fontSize: 11,
              overflow: 'auto',
              border: '1px solid var(--border)'
            }}>
{`{
  "answer": "Tenemos 15 laptops..."
}`}
            </pre>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>🌐</span> Integraciones Disponibles
            </h2>
            
            <div style={{ display: 'grid', gap: 10 }}>
              <IntegrationCard
                icon="📱"
                title="Aplicaciones Móviles"
                description="Android, iOS, Tablets - Integración nativa"
                status="available"
                docs={mobileAppDocs}
              />
              <IntegrationCard
                icon="💬"
                title="Facebook Messenger"
                description="Chatbot automático con webhook"
                status="available"
                docs={messengerDocs}
              />
              <IntegrationCard
                icon="💚"
                title="WhatsApp Business"
                description="Vía Twilio API - Mensajes automáticos"
                status="available"
                docs={whatsappDocs}
              />
              <IntegrationCard
                icon="🌐"
                title="Páginas Web"
                description="iFrame embebido o Widget JavaScript"
                status="available"
                docs={webDocs}
              />
              <IntegrationCard
                icon="📺"
                title="Smart TV / Pantallas"
                description="Dashboard en tiempo real"
                status="development"
                estimatedDate="Abril 2026"
              />
              <IntegrationCard
                icon="🛒"
                title="Sistemas POS"
                description="Integración con punto de venta"
                status="planned"
              />
            </div>

            <div style={{ 
              marginTop: 16, 
              padding: 12, 
              background: '#3B82F610', 
              borderRadius: 6, 
              border: '1px solid #3B82F6' 
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#3B82F6', marginBottom: 4 }}>
                📚 Documentación Completa
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Ver <strong>API_DOCUMENTATION.md</strong> y <strong>INTEGRATION_GUIDE.md</strong> para ejemplos de código completos
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
