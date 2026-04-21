'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import { Loader2, AlertCircle, History, User } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AuditLog {
  id: string;
  role_identifier: string;
  action: string;
  details: string;
  previous_state: any;
  new_state: any;
  created_at: string;
  actor_name: string;
}

interface AuditLogViewerProps {
  roleIdentifier?: string; // Si es nulo, trae el historial global
}

const ACTION_COLORS: Record<string, string> = {
  CREATED: 'var(--success)',
  DELETED: 'var(--danger)',
  PERMISSIONS_MODIFIED: 'var(--warning)',
  USER_LINKED: 'var(--brand-accent)',
  USER_UNLINKED: 'var(--muted)',
};

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Rol Creado',
  DELETED: 'Rol Eliminado',
  PERMISSIONS_MODIFIED: 'Permisos',
  USER_LINKED: 'Usuario Asignado',
  USER_UNLINKED: 'Usuario Removido',
};

const PERMISSION_NAMES: Record<string, string> = {
  'inventory.view': 'Ver Inventario',
  'inventory.create': 'Crear Artículo',
  'inventory.edit': 'Modificar Inventario',
  'inventory.delete': 'Eliminar Productos',
  'inventory.import': 'Importar Inventario',
  'inventory.export': 'Exportar Inventario',
  'ventas.view': 'Ver Ventas',
  'ventas.create': 'Crear Ventas',
  'ventas.create_quote': 'Crear Cotización',
  'ventas.create_invoice': 'Crear Factura',
  'ventas.create_sales_order': 'Crear Orden de Venta',
  'transfers.view': 'Ver Transferencias',
  'transfers.create': 'Crear Transferencias',
  'reports.view': 'Ver Reportes',
  'reports.export': 'Exportar Reportes',
  'roles.view': 'Ver Roles',
  'roles.manage': 'Gestionar Roles',
  'users.view': 'Ver Usuarios',
  'users.manage': 'Gestionar Usuarios',
  'users.delete': 'Eliminar Usuarios',
  'settings.view': 'Ver Configuración',
  'settings.edit': 'Modificar Configuración',
  'ai-agents.use': 'Usar Agentes IA',
  'branding.view': 'Ver Logo de Marca',
  'alistamiento.read': 'Ver Alistamiento',
  'alistamiento.write': 'Operar Alistamiento',
};

export default function AuditLogViewer({ roleIdentifier }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<string>('ALL');
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [permissionDict, setPermissionDict] = useState<Record<string, string>>({});

  useEffect(() => {
    loadLogs();
    fetch('/api/permissions')
      .then(res => res.json())
      .then(data => {
        const map: Record<string, string> = {};
        if (Array.isArray(data)) {
           data.forEach((p: any) => { map[p.code] = p.name; });
        }
        setPermissionDict(map);
      }).catch(err => console.error("Error loading permissions map", err));
  }, [roleIdentifier]);

  function getPermissionName(code: string) {
    // 1. Diccionario Dinámico de Base de Datos
    if (permissionDict[code]) return permissionDict[code];
    // 2. Diccionario Estático Local
    if (PERMISSION_NAMES[code]) return PERMISSION_NAMES[code];
    // 3. Traductor Automático Formateado
    const parts = code.split('.');
    if (parts.length >= 2) {
      const moduleName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      const actionStr = parts.slice(1).join('.');
      const actionMap: Record<string, string> = {
        'view': 'Ver',
        'read': 'Leer',
        'write': 'Operar / Escribir',
        'create': 'Crear',
        'edit': 'Editar',
        'delete': 'Eliminar',
        'import': 'Importar',
        'export': 'Exportar',
        'manage': 'Gestionar',
        'use': 'Usar'
      };
      return `${actionMap[actionStr] || actionStr} ${moduleName}`;
    }
    return code;
  }

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const url = roleIdentifier 
        ? `/api/roles/audit?role=${encodeURIComponent(roleIdentifier)}` 
        : `/api/roles/audit`;
        
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al cargar historial de auditoría');
      }

      setLogs(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <div style={{ padding: 30, display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center' }}>
          <Loader2 size={30} className="animate-spin" style={{ color: 'var(--brand-accent)', marginBottom: 12 }} />
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando historial...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--danger)' }}>
          <AlertCircle size={30} style={{ margin: '0 auto 12px auto' }} />
          <p>{error}</p>
        </div>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          <History size={40} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
          <p>No hay eventos de auditoría registrados para mostrar.</p>
        </div>
      </Card>
    );
  }

  const uniqueRoles = Array.from(new Set(logs.map(log => log.role_identifier)));
  const uniqueActions = Array.from(new Set(logs.map(log => log.action)));

  const visibleLogs = logs.filter(log => {
      const matchRole = filterRole === 'ALL' || log.role_identifier === filterRole;
      const matchAction = filterAction === 'ALL' || log.action === filterAction;
      return matchRole && matchAction;
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {!roleIdentifier && (uniqueRoles.length > 0 || uniqueActions.length > 0) && (
        <Card style={{ padding: 12, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Filtros:</span>
              <select 
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: 13,
                  outline: 'none'
                }}
              >
                <option value="ALL">Todos los roles</option>
                {uniqueRoles.map(role => (
                   <option key={role} value={role}>{role}</option>
                ))}
              </select>

              <select 
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: 13,
                  outline: 'none'
                }}
              >
                <option value="ALL">Todas las acciones</option>
                {uniqueActions.map(action => (
                   <option key={action} value={action}>{ACTION_LABELS[action] || action}</option>
                ))}
              </select>
            </div>

            {(filterRole !== 'ALL' || filterAction !== 'ALL') && (
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
                Mostrando {visibleLogs.length} evento(s)
              </span>
            )}
          </div>
        </Card>
      )}

      {visibleLogs.length === 0 ? (
        <Card>
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            <History size={40} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
            <p>No hay eventos de auditoría para este filtro.</p>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {visibleLogs.map((log) => (
            <Card key={log.id} style={{ padding: 16 }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
               <span style={{ 
                 display: 'inline-block', 
                 padding: '4px 8px', 
                 borderRadius: 4, 
                 backgroundColor: `${ACTION_COLORS[log.action] || 'var(--muted)'}20`,
                 color: ACTION_COLORS[log.action] || 'var(--foreground)',
                 fontSize: 12,
                 fontWeight: 600
               }}>
                 {ACTION_LABELS[log.action] || log.action}
               </span>
               <span style={{ fontSize: 14, fontWeight: 500 }}>
                 {log.action === 'PERMISSIONS_MODIFIED' 
                   ? (log.new_state?.added_permissions ? `Se añadieron permisos al rol ${log.role_identifier}` : `Se removieron permisos del rol ${log.role_identifier}`)
                   : log.details}
               </span>
             </div>
             <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
               {format(new Date(log.created_at), "dd 'de' MMM, yyyy - HH:mm", { locale: es })}
             </div>
           </div>

           <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
             <User size={14} />
             <span>Realizado por: <strong>{log.actor_name}</strong></span>
             
             {!roleIdentifier && (
               <>
                 <span style={{ margin: '0 8px' }}>|</span>
                 <span>Rol afectado: <strong>{log.role_identifier}</strong></span>
               </>
             )}
           </div>

           {(log.previous_state || log.new_state) && log.action === 'PERMISSIONS_MODIFIED' && (
             <div style={{ marginTop: 12, padding: 12, backgroundColor: 'var(--background)', borderRadius: 6, fontSize: 13, display: 'flex', gap: 16 }}>
               {log.new_state?.added_permissions && (
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--success)', fontWeight: 600, marginBottom: 4 }}>Permisos Añadidos:</div>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {log.new_state.added_permissions.map((p: string) => <li key={p}>{getPermissionName(p)}</li>)}
                    </ul>
                  </div>
               )}
               {log.previous_state?.removed_permissions && (
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>Permisos Eliminados:</div>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {log.previous_state.removed_permissions.map((p: string) => <li key={p}>{getPermissionName(p)}</li>)}
                    </ul>
                  </div>
               )}
             </div>
           )}
        </Card>
      ))}
        </div>
      )}
    </div>
  );
}
