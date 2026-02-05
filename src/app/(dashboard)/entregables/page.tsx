'use client';

import { FileText, Github, ExternalLink, Folder, Download, Code, Package } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';

export default function EntregablesPage() {
  const entregables = [
    {
      title: 'Repositorio en GitHub',
      description: 'Código fuente completo del proyecto Solis Comercial ERP',
      icon: Github,
      url: 'https://github.com/pubnicaragua/Solcom',
      type: 'Repositorio',
      status: 'Activo',
      color: '#24292e'
    },
    {
      title: 'Documentación Técnica',
      description: 'Guías de instalación, configuración y uso del sistema',
      icon: FileText,
      url: '#',
      type: 'Documentación',
      status: 'Disponible',
      color: '#3b82f6'
    },
    {
      title: 'Estructura del Proyecto',
      description: 'Arquitectura y organización de carpetas y módulos',
      icon: Folder,
      url: '#',
      type: 'Documentación',
      status: 'Disponible',
      color: '#8b5cf6'
    },
    {
      title: 'API Endpoints',
      description: 'Documentación de endpoints REST para integraciones',
      icon: Code,
      url: '#',
      type: 'API',
      status: 'Disponible',
      color: '#10b981'
    },
    {
      title: 'Dependencias',
      description: 'Lista completa de paquetes y versiones utilizadas',
      icon: Package,
      url: '#',
      type: 'Configuración',
      status: 'Disponible',
      color: '#f59e0b'
    }
  ];

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ 
            width: 48, 
            height: 48, 
            borderRadius: 12, 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Folder size={24} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              📦 Carpeta de Entregables
            </h1>
            <p style={{ fontSize: 16, color: 'var(--muted)', margin: 0 }}>
              Acceso a repositorio, documentación y recursos del proyecto
            </p>
          </div>
        </div>
      </div>

      {/* GitHub Destacado */}
      <Card style={{ 
        marginBottom: 32, 
        background: 'linear-gradient(135deg, #24292e 0%, #1a1d23 100%)',
        border: 'none',
        padding: 40,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: -50, right: -50, opacity: 0.1 }}>
          <Github size={200} color="white" />
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <Github size={48} color="white" />
            <div>
              <h2 style={{ fontSize: 28, fontWeight: 700, color: 'white', margin: 0, marginBottom: 8 }}>
                Repositorio Principal
              </h2>
              <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
                pubnicaragua/Solcom
              </p>
            </div>
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(255,255,255,0.9)', marginBottom: 24 }}>
            Código fuente completo del sistema ERP Solis Comercial. Incluye todos los módulos de inventario,
            reportes, agentes IA, integración con Zoho Creator, y configuración de Supabase.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <Badge style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '8px 16px', fontSize: 14 }}>
              ⚡ Next.js 14
            </Badge>
            <Badge style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '8px 16px', fontSize: 14 }}>
              ⚛️ React 18
            </Badge>
            <Badge style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '8px 16px', fontSize: 14 }}>
              🔷 TypeScript
            </Badge>
            <Badge style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '8px 16px', fontSize: 14 }}>
              🗄️ Supabase
            </Badge>
          </div>
          <a 
            href="https://github.com/pubnicaragua/Solcom"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 24px',
              background: 'white',
              color: '#24292e',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 16,
              transition: 'transform 0.2s',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <Github size={20} />
            Ver Repositorio
            <ExternalLink size={16} />
          </a>
        </div>
      </Card>

      {/* Grid de Entregables */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 24
      }}>
        {entregables.map((item, idx) => {
          const Icon = item.icon;
          return (
            <Card 
              key={idx}
              style={{ 
                padding: 24,
                cursor: item.url !== '#' ? 'pointer' : 'default',
                transition: 'all 0.3s',
                border: '1px solid var(--border)',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                if (item.url !== '#') {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.1)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ 
                position: 'absolute', 
                top: -20, 
                right: -20, 
                opacity: 0.05,
                transform: 'rotate(-15deg)'
              }}>
                <Icon size={120} color={item.color} />
              </div>
              
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ 
                  width: 56, 
                  height: 56, 
                  borderRadius: 12, 
                  background: `${item.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16
                }}>
                  <Icon size={28} color={item.color} />
                </div>

                <h3 style={{ 
                  fontSize: 18, 
                  fontWeight: 600, 
                  marginBottom: 8,
                  color: 'var(--text-primary)'
                }}>
                  {item.title}
                </h3>

                <p style={{ 
                  fontSize: 14, 
                  lineHeight: 1.6, 
                  color: 'var(--muted)',
                  marginBottom: 16
                }}>
                  {item.description}
                </p>

                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <Badge variant="neutral" style={{ fontSize: 12 }}>
                    {item.type}
                  </Badge>
                  <Badge 
                    variant={item.status === 'Activo' ? 'success' : 'neutral'}
                    style={{ fontSize: 12 }}
                  >
                    {item.status}
                  </Badge>
                </div>

                {item.url !== '#' && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: item.color,
                      textDecoration: 'none',
                      fontSize: 14,
                      fontWeight: 500
                    }}
                  >
                    Abrir
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Información Adicional */}
      <Card style={{ marginTop: 32, padding: 32, background: '#f8f9ff', border: '1px solid #e0e7ff' }}>
        <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#4338ca' }}>
          ℹ️ Información del Proyecto
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
              Última Actualización
            </p>
            <p style={{ fontSize: 16, color: '#1f2937', margin: 0 }}>
              5 de Febrero, 2026
            </p>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
              Versión Actual
            </p>
            <p style={{ fontSize: 16, color: '#1f2937', margin: 0 }}>
              v1.0.0
            </p>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
              Estado del Build
            </p>
            <p style={{ fontSize: 16, color: '#10b981', margin: 0, fontWeight: 600 }}>
              ✅ Exitoso
            </p>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
              Deployment
            </p>
            <p style={{ fontSize: 16, color: '#1f2937', margin: 0 }}>
              Vercel (Production)
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
