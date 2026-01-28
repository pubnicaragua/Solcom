'use client';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { CheckCircle2, Circle, AlertCircle, FileText, Key, Database, Link2, Settings, Users } from 'lucide-react';

export default function NextStepsPage() {
  const steps = [
    {
      id: 1,
      title: 'Credenciales de Zoho Creator',
      status: 'pending',
      priority: 'high',
      icon: Key,
      description: 'Proporcionar las credenciales de autenticación de Zoho Creator',
      items: [
        'Client ID de Zoho',
        'Client Secret de Zoho',
        'Refresh Token de Zoho',
        'Account Owner (nombre de cuenta)',
        'App Link Name (nombre de la aplicación)',
      ],
      notes: 'Estas credenciales se configurarán en las variables de entorno (.env.local)',
    },
    {
      id: 2,
      title: 'Estructura de Datos en Zoho Creator',
      status: 'pending',
      priority: 'high',
      icon: Database,
      description: 'Confirmar la estructura de los reportes y campos en Zoho Creator',
      items: [
        'Nombre exacto del reporte de inventario',
        'Campos disponibles (SKU, Name, Color, State, etc.)',
        'Formato de WarehouseCode',
        'Campos de fecha (LastUpdated)',
        'Estructura de cantidades (Quantity)',
      ],
      notes: 'Necesitamos validar que los campos coincidan con la integración actual',
    },
    {
      id: 3,
      title: 'Acceso a Supabase',
      status: 'pending',
      priority: 'high',
      icon: Link2,
      description: 'Configurar acceso a la base de datos Supabase',
      items: [
        'URL del proyecto Supabase',
        'Anon Key (clave pública)',
        'Service Role Key (clave privada)',
        'Confirmar tablas creadas (items, warehouses, stock_snapshots)',
        'Verificar políticas RLS configuradas',
      ],
      notes: 'Las credenciales ya están en .env.local, verificar que funcionen correctamente',
    },
    {
      id: 4,
      title: 'Configuración de Usuarios',
      status: 'pending',
      priority: 'medium',
      icon: Users,
      description: 'Crear usuarios iniciales en el sistema',
      items: [
        'Definir roles de usuario (Admin, Gerente, Operador)',
        'Crear cuentas de usuario en Supabase Auth',
        'Asignar permisos según roles',
        'Configurar correos electrónicos corporativos',
      ],
      notes: 'Los usuarios se crean desde el panel de Supabase o mediante invitación',
    },
    {
      id: 5,
      title: 'Pruebas de Sincronización',
      status: 'pending',
      priority: 'medium',
      icon: Settings,
      description: 'Realizar pruebas de sincronización con Zoho Creator',
      items: [
        'Ejecutar sincronización manual desde el dashboard',
        'Verificar que los datos se importen correctamente',
        'Validar actualización de stock en tiempo real',
        'Confirmar creación automática de bodegas',
        'Revisar logs de sincronización',
      ],
      notes: 'Una vez configuradas las credenciales, probar con datos reales',
    },
    {
      id: 6,
      title: 'Documentación y Capacitación',
      status: 'pending',
      priority: 'low',
      icon: FileText,
      description: 'Documentar el sistema y capacitar al equipo',
      items: [
        'Manual de usuario del dashboard',
        'Guía de sincronización con Zoho',
        'Documentación de API endpoints',
        'Video tutorial de uso básico',
        'Capacitación al equipo de operaciones',
      ],
      notes: 'Preparar materiales de capacitación para el equipo',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in-progress':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'danger';
      case 'medium':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return CheckCircle2;
      case 'in-progress':
        return AlertCircle;
      default:
        return Circle;
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 className="h-title" style={{ marginBottom: 8 }}>
          Siguientes Pasos para Implementación
        </h1>
        <p className="h-subtitle" style={{ marginBottom: 24 }}>
          Información y accesos requeridos para completar la integración con Zoho Creator
        </p>

        {/* Progress Summary */}
        <Card style={{ background: 'linear-gradient(135deg, rgba(255, 0, 0, 0.1) 0%, rgba(255, 0, 0, 0.05) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                Progreso General
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: '0%',
                      height: '100%',
                      background: 'var(--brand-primary)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <span style={{ fontSize: 14, fontWeight: 600 }}>0 de {steps.length}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--danger)' }}>
                  {steps.filter(s => s.priority === 'high').length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Alta Prioridad</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--warning)' }}>
                  {steps.filter(s => s.priority === 'medium').length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Media Prioridad</div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Steps List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {steps.map((step) => {
          const StatusIcon = getStatusIcon(step.status);
          const StepIcon = step.icon;

          return (
            <Card
              key={step.id}
              style={{
                transition: 'all 0.3s ease',
                border: step.priority === 'high' ? '2px solid var(--danger)' : '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', gap: 20 }}>
                {/* Icon */}
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background: `var(--${step.priority === 'high' ? 'danger' : step.priority === 'medium' ? 'warning' : 'brand-primary'})15`,
                    border: `2px solid var(--${step.priority === 'high' ? 'danger' : step.priority === 'medium' ? 'warning' : 'brand-primary'})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <StepIcon
                    size={28}
                    color={`var(--${step.priority === 'high' ? 'danger' : step.priority === 'medium' ? 'warning' : 'brand-primary'})`}
                  />
                </div>

                {/* Content */}
                <div style={{ flex: 1 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>
                      {step.title}
                    </h3>
                    <Badge variant={getPriorityColor(step.priority)} size="sm">
                      Prioridad {step.priority === 'high' ? 'Alta' : step.priority === 'medium' ? 'Media' : 'Baja'}
                    </Badge>
                    <Badge variant={getStatusColor(step.status)} size="sm">
                      <StatusIcon size={12} style={{ marginRight: 4 }} />
                      {step.status === 'completed' ? 'Completado' : step.status === 'in-progress' ? 'En Progreso' : 'Pendiente'}
                    </Badge>
                  </div>

                  {/* Description */}
                  <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
                    {step.description}
                  </p>

                  {/* Items Checklist */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
                      Información Requerida:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {step.items.map((item, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 12px',
                            background: 'var(--card)',
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                          }}
                        >
                          <Circle size={14} color="var(--muted)" />
                          <span style={{ fontSize: 13, color: 'var(--text)' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  {step.notes && (
                    <div
                      style={{
                        padding: 12,
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <AlertCircle size={16} color="var(--warning)" style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                          <strong>Nota:</strong> {step.notes}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Contact Section */}
      <Card style={{ marginTop: 32, background: 'linear-gradient(135deg, rgba(255, 0, 0, 0.05) 0%, rgba(255, 0, 0, 0.1) 100%)' }}>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            ¿Necesitas Ayuda?
          </h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
            Para cualquier duda o asistencia con la configuración, contacta al equipo de desarrollo
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Badge variant="neutral" size="md">
              📧 soporte@soliscomercialni.com
            </Badge>
            <Badge variant="neutral" size="md">
              📱 WhatsApp: +505 8888-8888
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
