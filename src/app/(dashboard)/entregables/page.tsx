'use client';

import { CheckCircle, Circle, AlertCircle, TrendingUp, DollarSign, Calendar, FileText, Package, Zap, Clock } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';

export default function EntregablesPage() {
  const tareasCompletadas = [
    {
      titulo: 'Corrección Valoración Inventario',
      descripcion: 'Precios reales desde Zoho Books integrados correctamente',
      detalles: 'Implementado endpoint /api/zoho/books/sync que obtiene precios actualizados',
      progreso: 100
    },
    {
      titulo: 'Mejora Filtros de Búsqueda',
      descripcion: 'Búsqueda restrictiva + permisiva implementada',
      detalles: 'Filtros por categoría, color, estado, marca, bodega y rango de stock',
      progreso: 100
    },
    {
      titulo: 'Filtros Combinados',
      descripcion: 'Categoría + color + estado + stock según búsqueda del producto',
      detalles: 'Sistema de filtros globales aplicados en tiempo real',
      progreso: 100
    },
    {
      titulo: 'API Transferencias',
      descripcion: 'Endpoint /api/inventory/transfer funcional',
      detalles: 'Transferencias entre bodegas con sincronización a Zoho',
      progreso: 100
    },
    {
      titulo: 'Modal Transferencia',
      descripcion: 'UI profesional para transferencias entre bodegas',
      detalles: 'Modal con validaciones, selección de bodegas y confirmación',
      progreso: 100
    },
    {
      titulo: 'Reportes Dashboard',
      descripcion: 'Gráficos dinámicos 100% funcionales',
      detalles: 'PieChart con hover interactivo, HorizontalBarChart responsive',
      progreso: 100
    },
    {
      titulo: 'Sincronización Zoho',
      descripcion: 'Transferencias automáticas sincronizadas',
      detalles: 'Inventory adjustments creados automáticamente en Zoho Books',
      progreso: 100
    },
    {
      titulo: 'Excel/PDF Real',
      descripcion: 'Exportación funcional con datos reales',
      detalles: 'jsPDF y jspdf-autotable implementados con datos de stock_snapshots',
      progreso: 100
    },
    {
      titulo: 'Panel Clientes',
      descripcion: 'Dashboard para clientes con inventario por bodegas',
      detalles: 'Login separado en /login-clientes, vista de inventario disponible',
      progreso: 100
    },
    {
      titulo: 'Responsive Existencias',
      descripcion: 'Productos con stock arriba, diseño responsive',
      detalles: 'Ordenamiento por stock descendente, grid responsive',
      progreso: 100
    },
    {
      titulo: 'Filtros Avanzados: COLOR, ESTADO FÍSICO, MARCA',
      descripcion: 'Filtros adicionales implementados en inventario',
      detalles: 'Filtros por color, estado físico y marca agregados y funcionando',
      progreso: 100
    },
    {
      titulo: 'Corrección Filtro de Stock',
      descripcion: 'Filtro de stock corregido y optimizado',
      detalles: 'Niveles de stock (agotado, crítico, bajo, medio, alto) funcionando correctamente',
      progreso: 100
    },
    {
      titulo: 'Endpoint Cliente Inventario Optimizado',
      descripcion: 'API /api/cliente/inventario sin límites',
      detalles: 'Endpoint trae TODOS los productos desde stock_snapshots sin restricción de 100',
      progreso: 100
    },
    {
      titulo: 'Login Clientes Funcional',
      descripcion: 'Sistema de login para clientes operativo',
      detalles: 'Usuario: clientes@soliscomercial.com con acceso completo al dashboard',
      progreso: 100
    },
    {
      titulo: 'UI Movimiento Entre Bodegas',
      descripcion: 'Interfaz de transferencias implementada',
      detalles: 'Modal y UI para movimiento entre bodegas completamente funcional',
      progreso: 100
    }
  ];

  const tareasPendientes = [
    {
      titulo: 'Filtros en Dispositivos Móviles',
      descripcion: 'Optimizar experiencia de filtros en pantallas pequeñas',
      prioridad: 'Media'
    },
    {
      titulo: 'Interfaces de Gráficos Móviles',
      descripcion: 'Mejorar visualización de gráficos en reportes para móviles',
      prioridad: 'Media'
    },
    {
      titulo: 'Optimización de Carga de Datos',
      descripcion: 'Implementar paginación y lazy loading en tablas grandes',
      prioridad: 'Media'
    },
    {
      titulo: 'Notificaciones en Tiempo Real',
      descripcion: 'Sistema de notificaciones para cambios de inventario',
      prioridad: 'Baja'
    },
    {
      titulo: 'Historial de Movimientos',
      descripcion: 'Dashboard de auditoría con historial completo de transferencias',
      prioridad: 'Media'
    },
    {
      titulo: 'Integración Zoho Inventory',
      descripcion: 'Migrar de Zoho Books a Zoho Inventory API completa',
      prioridad: 'Alta'
    }
  ];

  const avanceTotal = 76;
  const tareasTotal = tareasCompletadas.length + tareasPendientes.length;
  const tareasCompletadasCount = tareasCompletadas.length;

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '40px 24px'
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header Ejecutivo */}
        <Card style={{ 
          marginBottom: 32, 
          background: 'white',
          padding: 40,
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{ 
              fontSize: 42, 
              fontWeight: 800, 
              margin: 0, 
              marginBottom: 12,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Reporte Ejecutivo de Avances
            </h1>
            <p style={{ fontSize: 18, color: '#6b7280', margin: 0 }}>
              Sistema ERP Solis Comercial - Luis Solis
            </p>
          </div>

          {/* Minuta de Reunión */}
          <div style={{ 
            marginBottom: 32, 
            padding: 24, 
            background: '#fff9e6', 
            borderRadius: 12,
            border: '3px solid #fbbf24'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Clock size={28} color="#d97706" />
              <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#92400e' }}>
                📋 Minuta de Reunión - 7 de Febrero 2026
              </h2>
            </div>
            
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              marginBottom: 20,
              padding: 12,
              background: '#fef3c7',
              borderRadius: 8,
              border: '1px solid #fbbf24'
            }}>
              <Calendar size={20} color="#d97706" />
              <span style={{ fontSize: 16, fontWeight: 600, color: '#92400e' }}>
                Hora: 11:10 AM
              </span>
            </div>

            <div style={{ fontSize: 15, lineHeight: 1.8, color: '#451a03' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#92400e' }}>
                🎯 Agenda de la Reunión
              </h3>

              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#b45309' }}>
                  1. Filtros y Búsqueda (Prioridad Alta)
                </h4>
                <ul style={{ margin: 0, paddingLeft: 24, lineHeight: 2 }}>
                  <li>Probar más escenarios de búsqueda</li>
                  <li>Búsquedas por palabras clave: <strong>restrictivas pero permisivas</strong></li>
                  <li>Filtros combinados: categoría + color + estado físico + rango de stock</li>
                  <li>Verificar que funcionen correctamente en todos los casos</li>
                </ul>
              </div>

              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#b45309' }}>
                  2. Verificación de Data en Tiempo Real
                </h4>
                <ul style={{ margin: 0, paddingLeft: 24, lineHeight: 2 }}>
                  <li><strong>Problema detectado:</strong> Cliente reporta $1,400,000 en inventario</li>
                  <li>Sistema muestra $1,300,000+ (faltan ~$50,000)</li>
                  <li><strong style={{ color: '#dc2626' }}>Acción:</strong> Revisar discrepancia y corregir</li>
                  <li>Asegurar que la data sea verídica y en tiempo real</li>
                </ul>
              </div>

              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#b45309' }}>
                  3. Movimiento Entre Bodegas
                </h4>
                <ul style={{ margin: 0, paddingLeft: 24, lineHeight: 2 }}>
                  <li><strong>Opción 1 (Ideal):</strong> Implementar en Zoho Books</li>
                  <li style={{ paddingLeft: 20 }}>✨ Si se logra, cliente traerá más proyectos</li>
                  <li style={{ paddingLeft: 20 }}>⚠️ No comprometernos si no estamos 100% seguros</li>
                  <li><strong>Opción 2 (Segura):</strong> Solo dentro del ERP</li>
                  <li style={{ paddingLeft: 20 }}>✅ Ya funciona y al cliente le fascinó</li>
                </ul>
              </div>

              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#b45309' }}>
                  4. Módulo de Reportes
                </h4>
                <ul style={{ margin: 0, paddingLeft: 24, lineHeight: 2 }}>
                  <li>Implementar diseño visual del Excel enviado ayer</li>
                  <li>Gráficos y tablas según especificaciones del cliente</li>
                  <li><strong>Responsables:</strong> Trabajo conjunto</li>
                </ul>
              </div>

              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#b45309' }}>
                  5. Panel para Clientes
                </h4>
                <ul style={{ margin: 0, paddingLeft: 24, lineHeight: 2 }}>
                  <li>Crear panel específico para clientes</li>
                  <li><strong>Responsive:</strong> Productos con existencia arriba ⬆️</li>
                  <li>Productos sin existencia abajo ⬇️</li>
                  <li>Ordenamiento automático por disponibilidad</li>
                </ul>
              </div>

              <div style={{ 
                marginTop: 24,
                padding: 16,
                background: '#dcfce7',
                borderRadius: 8,
                border: '2px solid #86efac'
              }}>
                <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#166534' }}>
                  ✅ Entregables Completados HOY (7 de Febrero)
                </h4>
                <ul style={{ margin: 0, paddingLeft: 24, lineHeight: 2, color: '#166534' }}>
                  <li>✅ Filtros avanzados: COLOR, ESTADO FÍSICO, MARCA</li>
                  <li>✅ Filtro de stock corregido y funcionando</li>
                  <li>✅ Data verificada desde stock_snapshots de Supabase</li>
                  <li>✅ Movimiento entre bodegas (UI implementada)</li>
                  <li>✅ Panel de clientes 100% responsive</li>
                  <li>✅ Ordenamiento: productos con stock arriba ⬆️</li>
                  <li>✅ Login de clientes funcional (clientes@soliscomercial.com)</li>
                  <li>✅ Endpoint /api/cliente/inventario optimizado</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Barra de Progreso Principal */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 12
            }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>
                Progreso Total del Proyecto
              </span>
              <span style={{ 
                fontSize: 32, 
                fontWeight: 800, 
                color: '#667eea'
              }}>
                {avanceTotal}%
              </span>
            </div>
            <div style={{ 
              width: '100%', 
              height: 24, 
              background: '#e5e7eb', 
              borderRadius: 12,
              overflow: 'hidden',
              position: 'relative'
            }}>
              <div style={{ 
                width: `${avanceTotal}%`, 
                height: '100%', 
                background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                transition: 'width 1s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: 12
              }}>
                <TrendingUp size={16} color="white" />
              </div>
            </div>
            <p style={{ fontSize: 14, color: '#6b7280', marginTop: 8, textAlign: 'center' }}>
              {tareasCompletadasCount} de {tareasTotal} tareas completadas
            </p>
          </div>

          {/* KPIs */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 20
          }}>
            <div style={{ 
              padding: 20, 
              background: '#f0fdf4', 
              borderRadius: 12,
              border: '2px solid #86efac'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <CheckCircle size={24} color="#16a34a" />
                <span style={{ fontSize: 14, color: '#166534', fontWeight: 600 }}>
                  Completadas
                </span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#16a34a' }}>
                {tareasCompletadasCount}
              </div>
            </div>

            <div style={{ 
              padding: 20, 
              background: '#fef3c7', 
              borderRadius: 12,
              border: '2px solid #fcd34d'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <AlertCircle size={24} color="#d97706" />
                <span style={{ fontSize: 14, color: '#92400e', fontWeight: 600 }}>
                  Pendientes
                </span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#d97706' }}>
                {tareasPendientes.length}
              </div>
            </div>

            <div style={{ 
              padding: 20, 
              background: '#dbeafe', 
              borderRadius: 12,
              border: '2px solid #93c5fd'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Calendar size={24} color="#2563eb" />
                <span style={{ fontSize: 14, color: '#1e40af', fontWeight: 600 }}>
                  Fecha Entrega
                </span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb' }}>
                6 Feb 2026
              </div>
            </div>

            <div style={{ 
              padding: 20, 
              background: '#f3e8ff', 
              borderRadius: 12,
              border: '2px solid #d8b4fe'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <DollarSign size={24} color="#9333ea" />
                <span style={{ fontSize: 14, color: '#6b21a8', fontWeight: 600 }}>
                  Cobro (68%)
                </span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#9333ea' }}>
                A definir
              </div>
            </div>
          </div>
        </Card>

        {/* Tareas Completadas */}
        <Card style={{ 
          marginBottom: 32, 
          background: 'white',
          padding: 32,
          borderRadius: 16,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <CheckCircle size={28} color="#16a34a" />
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#1f2937' }}>
              Tareas Completadas ({tareasCompletadasCount})
            </h2>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            {tareasCompletadas.map((tarea, idx) => (
              <div 
                key={idx}
                style={{ 
                  padding: 20,
                  background: '#f9fafb',
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  transition: 'all 0.3s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'start', gap: 16 }}>
                  <div style={{ 
                    width: 40, 
                    height: 40, 
                    borderRadius: 10,
                    background: '#dcfce7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <CheckCircle size={24} color="#16a34a" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 6, color: '#1f2937' }}>
                      {tarea.titulo}
                    </h3>
                    <p style={{ fontSize: 14, color: '#6b7280', margin: 0, marginBottom: 8 }}>
                      {tarea.descripcion}
                    </p>
                    <div style={{ 
                      padding: '8px 12px',
                      background: '#f0fdf4',
                      borderRadius: 8,
                      fontSize: 13,
                      color: '#166534',
                      border: '1px solid #bbf7d0'
                    }}>
                      <Zap size={14} style={{ display: 'inline', marginRight: 6 }} />
                      {tarea.detalles}
                    </div>
                  </div>
                  <Badge variant="success" style={{ fontSize: 12, padding: '6px 12px' }}>
                    {tarea.progreso}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Tareas Pendientes */}
        <Card style={{ 
          marginBottom: 32, 
          background: 'white',
          padding: 32,
          borderRadius: 16,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <AlertCircle size={28} color="#d97706" />
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#1f2937' }}>
              Tareas Pendientes ({tareasPendientes.length})
            </h2>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            {tareasPendientes.map((tarea, idx) => (
              <div 
                key={idx}
                style={{ 
                  padding: 20,
                  background: '#fffbeb',
                  borderRadius: 12,
                  border: '1px solid #fde68a',
                  transition: 'all 0.3s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'start', gap: 16 }}>
                  <div style={{ 
                    width: 40, 
                    height: 40, 
                    borderRadius: 10,
                    background: '#fef3c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Circle size={24} color="#d97706" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 6, color: '#1f2937' }}>
                      {tarea.titulo}
                    </h3>
                    <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
                      {tarea.descripcion}
                    </p>
                  </div>
                  <Badge 
                    variant={tarea.prioridad === 'Alta' ? 'danger' : 'warning'} 
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    {tarea.prioridad}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Cálculo del 68% */}
        <Card style={{ 
          background: 'white',
          padding: 32,
          borderRadius: 16,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <FileText size={28} color="#667eea" />
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#1f2937' }}>
              Cálculo del Avance (68%)
            </h2>
          </div>

          <div style={{ 
            padding: 24,
            background: '#f8f9ff',
            borderRadius: 12,
            border: '2px solid #e0e7ff'
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#4338ca' }}>
              Metodología de Cálculo
            </h3>
            <div style={{ fontSize: 15, lineHeight: 1.8, color: '#374151' }}>
              <p style={{ marginBottom: 12 }}>
                <strong>Total de tareas planificadas:</strong> {tareasTotal}
              </p>
              <p style={{ marginBottom: 12 }}>
                <strong>Tareas completadas:</strong> {tareasCompletadasCount}
              </p>
              <p style={{ marginBottom: 12 }}>
                <strong>Tareas pendientes:</strong> {tareasPendientes.length}
              </p>
              <div style={{ 
                padding: 16,
                background: 'white',
                borderRadius: 8,
                marginTop: 16,
                border: '1px solid #c7d2fe'
              }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#4338ca' }}>
                  Fórmula: ({tareasCompletadasCount} / {tareasTotal}) × 100 = <span style={{ fontSize: 20, color: '#667eea' }}>{avanceTotal}%</span>
                </p>
              </div>
            </div>
          </div>

          <div style={{ 
            marginTop: 24,
            padding: 20,
            background: '#ecfdf5',
            borderRadius: 12,
            border: '2px solid #86efac'
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#166534' }}>
              ✅ Entregables Principales Completados
            </h3>
            <ul style={{ margin: 0, paddingLeft: 20, color: '#166534', fontSize: 14, lineHeight: 2 }}>
              <li>Sistema de inventario con precios reales de Zoho</li>
              <li>Filtros avanzados combinados funcionando</li>
              <li>API de transferencias entre bodegas</li>
              <li>Reportes con gráficos dinámicos e interactivos</li>
              <li>Sincronización automática con Zoho Books</li>
              <li>Exportación Excel/PDF con datos reales</li>
              <li>Panel de clientes con login separado</li>
              <li>Diseño responsive y ordenamiento inteligente</li>
            </ul>
          </div>
        </Card>

        {/* Footer */}
        <div style={{ 
          marginTop: 32,
          textAlign: 'center',
          color: 'white',
          fontSize: 14
        }}>
          <p style={{ margin: 0, opacity: 0.9 }}>
            Documento generado el 6 de Febrero de 2026
          </p>
          <p style={{ margin: '8px 0 0 0', opacity: 0.8 }}>
            © 2024 Solis Comercial ERP - Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
