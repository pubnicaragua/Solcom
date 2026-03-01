'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { X, Save, Shield, Bell } from 'lucide-react';

interface PermissionItem {
  code: string;
  name: string;
  module: string;
  description: string;
}

interface NotificationType {
  id: string;
  code: string;
  name: string;
  description: string;
}

interface EditRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  role: { id: string; name: string; description: string; is_custom?: boolean } | null;
}

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: 'SUPER ADMIN',
  manager: 'SUPERVISOR',
  operator: 'Colaborador',
  auditor: 'Auditor'
};

const MODULE_DISPLAY_NAMES: Record<string, string> = {
  inventory: 'Inventario',
  ventas: 'Ventas y Cotizaciones',
  transfers: 'Transferencias',
  reports: 'Reportes',
  roles: 'Roles y Usuarios',
  users: 'Gestión de Usuarios',
  settings: 'Configuración',
  'ai-agents': 'Agentes IA'
};

export default function EditRoleModal({ isOpen, onClose, onSave, role }: EditRoleModalProps) {
  const [allPermissions, setAllPermissions] = useState<PermissionItem[]>([]);
  const [assignedCodes, setAssignedCodes] = useState<Set<string>>(new Set());

  const [notificationTypes, setNotificationTypes] = useState<NotificationType[]>([]);
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'permissions' | 'notifications'>('permissions');

  useEffect(() => {
    if (isOpen && role) {
      setActiveTab('permissions');
      loadAllPermissions();
      loadNotificationTypes();
      loadRolePermissions(role.name);
      loadRoleNotifications(role.name);
    }
  }, [isOpen, role]);

  async function loadAllPermissions() {
    try {
      const res = await fetch('/api/permissions');
      if (res.ok) {
        const data = await res.json();
        setAllPermissions(data);
      }
    } catch (error) {
      console.error('Error loading permissions:', error);
    }
  }

  async function loadNotificationTypes() {
    try {
      const res = await fetch('/api/notifications/types');
      if (res.ok) {
        const data = await res.json();
        setNotificationTypes(data);
      }
    } catch (error) {
      console.error('Error loading notification types:', error);
    }
  }

  async function loadRolePermissions(roleName: string) {
    try {
      const res = await fetch(`/api/role-permissions?role=${encodeURIComponent(roleName)}`);
      if (res.ok) {
        const data = await res.json();
        const codes = new Set<string>(data.map((rp: any) => rp.permission_code));
        setAssignedCodes(codes);
      }
    } catch (error) {
      console.error('Error loading role permissions:', error);
      setAssignedCodes(new Set());
    }
  }

  async function loadRoleNotifications(roleName: string) {
    try {
      const res = await fetch(`/api/roles/notifications?role=${encodeURIComponent(roleName)}`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, boolean> = {};
        data.forEach((n: any) => {
          map[n.notification_type_code] = n.is_enabled;
        });
        setNotificationPrefs(map);
      }
    } catch (error) {
      console.error('Error loading role notifications:', error);
      setNotificationPrefs({});
    }
  }

  const handleTogglePermission = (code: string) => {
    setAssignedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleToggleNotification = (code: string) => {
    setNotificationPrefs(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  const handleSave = async () => {
    if (!role) return;

    setLoading(true);
    try {
      // 1. Save permissions via role-permissions API
      const permsRes = await fetch('/api/role-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: role.name,
          permission_codes: Array.from(assignedCodes)
        })
      });
      if (!permsRes.ok) {
        throw new Error('Error al guardar permisos');
      }

      // 2. Save notification prefs
      const notifsToSave = Object.entries(notificationPrefs).map(([code, isEnabled]) => ({
        role_name: role.name,
        notification_type_code: code,
        is_enabled: isEnabled
      }));

      if (notifsToSave.length > 0) {
        const notifRes = await fetch('/api/roles/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notifsToSave)
        });
        if (!notifRes.ok) {
          throw new Error('Error al guardar notificaciones');
        }
      }

      alert('Configuración del rol actualizada correctamente');
      onSave();
      onClose();
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Error al guardar la configuración');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !role) return null;

  // Group permissions by module
  const groupedPermissions: Record<string, PermissionItem[]> = {};
  allPermissions.forEach(p => {
    if (!groupedPermissions[p.module]) {
      groupedPermissions[p.module] = [];
    }
    groupedPermissions[p.module].push(p);
  });

  const displayRoleName = ROLE_DISPLAY_NAMES[role.name] || role.name;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 20
    }}>
      <Card style={{ width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', padding: 0 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Configurar Rol: {displayRoleName}</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{role.description}</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
          <button
            onClick={() => setActiveTab('permissions')}
            style={{
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'permissions' ? '2px solid var(--brand-primary)' : '2px solid transparent',
              color: activeTab === 'permissions' ? 'var(--text)' : 'var(--muted)',
              fontWeight: activeTab === 'permissions' ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Shield size={14} />
            Accesos y Permisos
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            style={{
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'notifications' ? '2px solid var(--brand-primary)' : '2px solid transparent',
              color: activeTab === 'notifications' ? 'var(--text)' : 'var(--muted)',
              fontWeight: activeTab === 'notifications' ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Bell size={14} />
            Notificaciones
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {activeTab === 'permissions' ? (
            <div>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                Selecciona los permisos que tendrá el rol <strong>{displayRoleName}</strong> en cada módulo del sistema.
              </p>
              {Object.entries(groupedPermissions).map(([moduleKey, perms]) => (
                <div key={moduleKey} style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: 'var(--panel)', fontWeight: 600, fontSize: 14, borderBottom: '1px solid var(--border)' }}>
                    {MODULE_DISPLAY_NAMES[moduleKey] || moduleKey}
                  </div>
                  <div style={{ padding: '8px 16px' }}>
                    {perms.map(perm => (
                      <label key={perm.code} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        fontSize: 13
                      }}>
                        <input
                          type="checkbox"
                          checked={assignedCodes.has(perm.code)}
                          onChange={() => handleTogglePermission(perm.code)}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 500 }}>{perm.name}</span>
                          {perm.description && (
                            <span style={{ color: 'var(--muted)', marginLeft: 8 }}>— {perm.description}</span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {allPermissions.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
                  No hay permisos configurados en el sistema.
                </div>
              )}
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                Configura qué notificaciones recibirá el rol <strong>{displayRoleName}</strong>.
              </p>
              <div style={{ display: 'grid', gap: 12 }}>
                {notificationTypes.map(type => (
                  <label key={type.id || type.code} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: 16, border: '1px solid var(--border)', borderRadius: 8,
                    background: 'var(--panel)',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={notificationPrefs[type.code] || false}
                      onChange={() => handleToggleNotification(type.code)}
                      style={{ marginTop: 4, width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{type.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{type.description}</div>
                    </div>
                  </label>
                ))}
                {notificationTypes.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
                    No hay tipos de notificaciones configurados en el sistema.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={loading}>
            <Save size={14} style={{ marginRight: 6 }} />
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </Card>
    </div>
  );
}