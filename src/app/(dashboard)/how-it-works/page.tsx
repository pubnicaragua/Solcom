import Card from '@/components/ui/Card';
import { Database, RefreshCw, Filter, HardDrive, Monitor, Brain } from 'lucide-react';

const steps = [
  {
    icon: Database,
    number: 1,
    title: 'Zoho Creator',
    description: 'Genera existencias por bodega (X1, X4, X5, etc.)',
    color: 'var(--brand-primary)',
  },
  {
    icon: RefreshCw,
    number: 2,
    title: 'Sync (API)',
    description: 'Consulta endpoint con filtros (por bodega, por SKU)',
    color: 'var(--success)',
  },
  {
    icon: Filter,
    number: 3,
    title: 'Normalización',
    description: 'Unifica identificadores: ItemID/SKU + BodegaID',
    color: 'var(--warning)',
  },
  {
    icon: HardDrive,
    number: 4,
    title: 'Supabase',
    description: 'Guarda snapshots + movimientos (auditoría)',
    color: 'var(--brand-accent)',
  },
  {
    icon: Monitor,
    number: 5,
    title: 'Panel Web',
    description: 'Muestra "Excel moderno": filtros, búsqueda, export, roles',
    color: '#3B82F6',
  },
  {
    icon: Brain,
    number: 6,
    title: 'IA (Fase Futura)',
    description: 'Hace consultas inteligentes contra Supabase (no rompe Zoho)',
    color: '#8B5CF6',
  },
];

export default function HowItWorksPage() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <div className="h-title">Cómo Funciona</div>
        <p style={{ color: 'var(--muted)', marginTop: 8 }}>
          Flujo de actualización de inventario multi-bodega con sincronización Zoho Creator
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <Card key={step.number} padding={20}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: `${step.color}15`,
                      border: `2px solid ${step.color}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={24} color={step.color} />
                  </div>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: step.color,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: 16,
                    }}
                  >
                    {step.number}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                    {step.title}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
                    {step.description}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <div style={{ padding: 8 }}>
          <div className="h-subtitle" style={{ marginBottom: 16 }}>
            Arquitectura del Sistema
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--brand-primary)' }}>
                🎯 Objetivo Principal
              </div>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Mantener un "single source of truth" en Supabase para consultas rápidas, reportes y análisis,
                mientras Zoho Creator sigue siendo la fuente original de datos operativos.
              </p>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--success)' }}>
                ⚡ Tiempo Real
              </div>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Sincronización near real-time mediante polling cada 1-5 minutos o webhooks de Zoho.
                Supabase Realtime actualiza la UI automáticamente cuando cambian las existencias.
              </p>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--warning)' }}>
                🔒 Seguridad
              </div>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Row Level Security (RLS) en Supabase, API keys solo en server-side,
                validación con Zod en todos los endpoints, y auditoría completa de movimientos.
              </p>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--brand-accent)' }}>
                🤖 Preparado para IA
              </div>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Integración con Groq lista para activar agentes de IA: Atención al Cliente, Cobranza,
                Cotizaciones, Facturación, Voz (Speech), y Auditoría. Los agentes consultan Supabase
                sin impactar el rendimiento de Zoho.
              </p>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#3B82F6' }}>
                📊 Escalabilidad
              </div>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Arquitectura modular con componentes reutilizables, separación clara entre frontend y backend,
                paginación eficiente, índices optimizados en base de datos, y código TypeScript type-safe.
              </p>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#8B5CF6' }}>
                🔄 Flujo de Datos
              </div>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Zoho Creator → API Sync → Normalización → Supabase → Panel Web → Exportación CSV.
                Cada paso está validado, registrado y puede ser auditado para trazabilidad completa.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 8 }}>
          <div className="h-subtitle" style={{ marginBottom: 16 }}>
            Guía de Uso
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
              <div style={{ 
                minWidth: 24, 
                height: 24, 
                borderRadius: '50%', 
                background: 'var(--brand-primary)', 
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
              }}>
                1
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Acceder al Sistema</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  Inicia sesión con tus credenciales. El sistema te redirigirá automáticamente según tu rol de usuario.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
              <div style={{ 
                minWidth: 24, 
                height: 24, 
                borderRadius: '50%', 
                background: 'var(--success)', 
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
              }}>
                2
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Configurar Integración con Zoho Creator</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  Contacta al administrador para configurar la conexión con tu sistema de gestión Zoho Creator.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
              <div style={{ 
                minWidth: 24, 
                height: 24, 
                borderRadius: '50%', 
                background: 'var(--warning)', 
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
              }}>
                3
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Sincronizar Inventario</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  Ve a la sección de Inventario y haz clic en "Sincronizar Ahora" para actualizar los datos desde Zoho Creator.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
              <div style={{ 
                minWidth: 24, 
                height: 24, 
                borderRadius: '50%', 
                background: 'var(--brand-accent)', 
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
              }}>
                4
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Consultar y Filtrar Datos</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  Utiliza los filtros por bodega, búsqueda por SKU o nombre, y ordena las columnas según tus necesidades.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
              <div style={{ 
                minWidth: 24, 
                height: 24, 
                borderRadius: '50%', 
                background: '#3B82F6', 
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
              }}>
                5
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Generar Reportes</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  Accede a la sección de Reportes para visualizar KPIs, gráficos y exportar datos a Excel o PDF.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
              <div style={{ 
                minWidth: 24, 
                height: 24, 
                borderRadius: '50%', 
                background: '#8B5CF6', 
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
              }}>
                6
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Interactuar con Agentes IA</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  Usa los agentes de IA para consultas rápidas, cotizaciones automáticas y atención al cliente.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
