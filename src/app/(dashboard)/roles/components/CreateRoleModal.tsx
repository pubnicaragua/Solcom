'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { X, Save, Shield } from 'lucide-react';

interface PermissionItem {
  code: string;
  name: string;
  module: string;
  description: string;
}

interface CreateRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

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

export default function CreateRoleModal({ isOpen, onClose, onSave }: CreateRoleModalProps) {
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [allPermissions, setAllPermissions] = useState<PermissionItem[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRoleName('');
      setRoleDescription('');
      setSelectedCodes(new Set());
      loadPermissions();
    }
  }, [isOpen]);

  async function loadPermissions() {
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

  const handleToggle = (code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!roleName.trim()) {
      alert('El nombre del rol es requerido');
      return;
    }

    setLoading(true);
    try {
      // 1. Create role in roles table
      const roleRes = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roleName.toUpperCase(),
          description: roleDescription,
          is_custom: true
        })
      });

      if (!roleRes.ok) {
        const errorData = await roleRes.json();
        throw new Error(errorData.error || 'Error al crear el rol');
      }

      // 2. Save permissions via role-permissions bulk API
      if (selectedCodes.size > 0) {
        const permsRes = await fetch('/api/role-permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: roleName.toUpperCase(),
            permission_codes: Array.from(selectedCodes)
          })
        });
        if (!permsRes.ok) throw new Error('Error al guardar permisos');
      }

      alert('Rol creado exitosamente');
      onSave();
      onClose();
      
      // Forzar recarga de la página para asegurar actualización de UI
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error: any) {
      console.error(error);
      
      // Manejar específicamente error de duplicado
      if (error.message?.includes('ya existe') || error.message?.includes('duplicate key')) {
        alert(`El rol "${roleName.toUpperCase()}" ya existe. Por favor usa otro nombre.`);
      } else {
        alert(error.message || 'Error al guardar el rol');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Group permissions by module
  const groupedPermissions: Record<string, PermissionItem[]> = {};
  allPermissions.forEach(p => {
    if (!groupedPermissions[p.module]) {
      groupedPermissions[p.module] = [];
    }
    groupedPermissions[p.module].push(p);
  });

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
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Nuevo Rol</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
            <Input
              label="Nombre del Rol"
              placeholder="Ej: SUPERVISOR DE BODEGA"
              value={roleName}
              onChange={e => setRoleName(e.target.value)}
            />
            <Input
              label="Descripción"
              placeholder="Descripción de las responsabilidades del rol"
              value={roleDescription}
              onChange={e => setRoleDescription(e.target.value)}
            />
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={16} />
            Permisos por Módulo
          </h3>

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
                      checked={selectedCodes.has(perm.code)}
                      onChange={() => handleToggle(perm.code)}
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
              Cargando permisos...
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={loading}>
            <Save size={14} style={{ marginRight: 6 }} />
            {loading ? 'Guardando...' : 'Crear Rol'}
          </Button>
        </div>
      </Card>
    </div>
  );
}