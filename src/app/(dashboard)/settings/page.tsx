'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { Settings, Database, Zap, Bell, Globe, Save, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  const [syncInterval, setSyncInterval] = useState('5');
  const [notifications, setNotifications] = useState(true);
  const [language, setLanguage] = useState('es');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    alert('Configuración guardada exitosamente');
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="h-title">Configuración del Sistema</div>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw size={16} style={{ marginRight: 6, animation: 'spin 1s linear infinite' }} />
              Guardando...
            </>
          ) : (
            <>
              <Save size={16} style={{ marginRight: 6 }} />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: 'var(--brand-primary)15', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Database size={20} color="var(--brand-primary)" />
              </div>
              <div className="h-subtitle">Conexión Supabase</div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <Input
                label="URL del Proyecto"
                value="https://pknkpvysiarfxvrhjqcx.supabase.co"
                disabled
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  background: 'var(--success)',
                  animation: 'pulse 2s infinite'
                }} />
                <span style={{ fontSize: 13, color: 'var(--success)' }}>Conectado</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Última verificación: hace 2 minutos
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: 'var(--success)15', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Zap size={20} color="var(--success)" />
              </div>
              <div className="h-subtitle">Sincronización Zoho</div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <Select
                label="Intervalo de Sincronización"
                value={syncInterval}
                onChange={(e) => setSyncInterval(e.target.value)}
                options={[
                  { value: '1', label: 'Cada 1 minuto' },
                  { value: '5', label: 'Cada 5 minutos' },
                  { value: '15', label: 'Cada 15 minutos' },
                  { value: '30', label: 'Cada 30 minutos' },
                  { value: '60', label: 'Cada hora' },
                ]}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge variant="success" size="sm">Activo</Badge>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Próxima sync en 3 min</span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: 'var(--warning)15', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Bell size={20} color="var(--warning)" />
              </div>
              <div className="h-subtitle">Notificaciones</div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>Stock Bajo</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Alertas cuando el inventario es bajo</div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
                  <input
                    type="checkbox"
                    checked={notifications}
                    onChange={(e) => setNotifications(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: notifications ? 'var(--success)' : 'var(--panel)',
                    transition: '0.3s',
                    borderRadius: 24,
                    border: '1px solid var(--border)',
                  }}>
                    <span style={{
                      position: 'absolute',
                      content: '',
                      height: 16,
                      width: 16,
                      left: notifications ? 24 : 4,
                      bottom: 3,
                      background: '#fff',
                      transition: '0.3s',
                      borderRadius: '50%',
                    }} />
                  </span>
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>Sincronización Completada</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Notificar cuando se complete la sync</div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
                  <input type="checkbox" defaultChecked style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'var(--success)',
                    transition: '0.3s',
                    borderRadius: 24,
                    border: '1px solid var(--border)',
                  }}>
                    <span style={{
                      position: 'absolute',
                      content: '',
                      height: 16,
                      width: 16,
                      left: 24,
                      bottom: 3,
                      background: '#fff',
                      transition: '0.3s',
                      borderRadius: '50%',
                    }} />
                  </span>
                </label>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: '#3B82F615', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Globe size={20} color="#3B82F6" />
              </div>
              <div className="h-subtitle">Preferencias Generales</div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <Select
                label="Idioma"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                options={[
                  { value: 'es', label: 'Español' },
                ]}
              />
              <Select
                label="Zona Horaria"
                value="America/Managua"
                options={[
                  { value: 'America/Managua', label: 'América/Managua (UTC-6)' },
                ]}
              />
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ 
              width: 40, 
              height: 40, 
              borderRadius: 8, 
              background: '#8B5CF615', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <Settings size={20} color="#8B5CF6" />
            </div>
            <div className="h-subtitle">Configuración Avanzada</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ padding: 12, background: 'var(--panel)', borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Versión del Sistema</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>1.0.0</div>
            </div>
            <div style={{ padding: 12, background: 'var(--panel)', borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Última Actualización</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>27 Ene 2025</div>
            </div>
            <div style={{ padding: 12, background: 'var(--panel)', borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Entorno</div>
              <Badge variant="success" size="sm">Producción</Badge>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 16 }}>
          <div className="h-subtitle" style={{ marginBottom: 12 }}>Endpoints API Públicos</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Estos endpoints están disponibles para integración externa con aplicaciones móviles, páginas web, y otros sistemas.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {[
              { method: 'GET', path: '/api/inventory', desc: 'Consultar inventario con filtros' },
              { method: 'GET', path: '/api/inventory/kpis', desc: 'Obtener métricas en tiempo real' },
              { method: 'GET', path: '/api/warehouses', desc: 'Listar bodegas activas' },
              { method: 'POST', path: '/api/zoho/sync', desc: 'Sincronizar datos desde Zoho' },
              { method: 'POST', path: '/api/ai/chat', desc: 'Consultar agentes IA' },
              { method: 'GET', path: '/api/inventory/export', desc: 'Exportar inventario a CSV' },
            ].map((endpoint, i) => (
              <div key={i} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12, 
                padding: 10, 
                background: 'var(--panel)', 
                borderRadius: 4,
                border: '1px solid var(--border)'
              }}>
                <Badge 
                  variant={endpoint.method === 'GET' ? 'success' : 'warning'} 
                  size="sm"
                  style={{ minWidth: 50, textAlign: 'center' }}
                >
                  {endpoint.method}
                </Badge>
                <code style={{ 
                  fontSize: 13, 
                  fontFamily: 'monospace', 
                  color: 'var(--brand-primary)',
                  flex: 1
                }}>
                  {endpoint.path}
                </code>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{endpoint.desc}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: 12, background: '#3B82F610', borderRadius: 6, border: '1px solid #3B82F6' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#3B82F6' }}>📚 Documentación Completa</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Ver documentación detallada en <code style={{ background: 'var(--panel)', padding: '2px 6px', borderRadius: 3 }}>/api-docs</code>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
