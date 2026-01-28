'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Shield, Users, Edit, Trash2, Plus, Check, X } from 'lucide-react';

interface Role {
  id: string;
  name: string;
  description: string;
  userCount: number;
  permissions: string[];
  color: string;
}

const MOCK_ROLES: Role[] = [
  {
    id: '1',
    name: 'Administrador',
    description: 'Acceso completo al sistema',
    userCount: 2,
    permissions: ['inventory.read', 'inventory.write', 'reports.read', 'users.manage', 'settings.manage', 'ai.use'],
    color: 'var(--brand-accent)',
  },
  {
    id: '2',
    name: 'Gerente',
    description: 'Gestión de inventario y reportes',
    userCount: 5,
    permissions: ['inventory.read', 'inventory.write', 'reports.read', 'ai.use'],
    color: 'var(--success)',
  },
  {
    id: '3',
    name: 'Operador',
    description: 'Consulta de inventario',
    userCount: 12,
    permissions: ['inventory.read', 'reports.read'],
    color: '#3B82F6',
  },
  {
    id: '4',
    name: 'Auditor',
    description: 'Solo lectura de reportes',
    userCount: 3,
    permissions: ['reports.read'],
    color: 'var(--warning)',
  },
];

const ALL_PERMISSIONS = [
  { id: 'inventory.read', label: 'Ver Inventario', module: 'Inventario' },
  { id: 'inventory.write', label: 'Modificar Inventario', module: 'Inventario' },
  { id: 'reports.read', label: 'Ver Reportes', module: 'Reportes' },
  { id: 'users.manage', label: 'Gestionar Usuarios', module: 'Usuarios' },
  { id: 'settings.manage', label: 'Configuración', module: 'Sistema' },
  { id: 'ai.use', label: 'Usar Agentes IA', module: 'IA' },
];

export default function RolesPage() {
  const [roles] = useState<Role[]>(MOCK_ROLES);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="h-title">Roles y Permisos</div>
        <Button variant="primary" size="sm">
          <Plus size={16} style={{ marginRight: 6 }} />
          Nuevo Rol
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <Card>
            <div style={{ padding: 8 }}>
              <div className="h-subtitle" style={{ marginBottom: 12 }}>
                Roles del Sistema
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {roles.map((role) => (
                  <div
                    key={role.id}
                    onClick={() => setSelectedRole(role)}
                    style={{
                      padding: 14,
                      borderRadius: 6,
                      border: `1px solid ${selectedRole?.id === role.id ? role.color : 'var(--border)'}`,
                      background: selectedRole?.id === role.id ? `${role.color}10` : 'var(--panel)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 6,
                          background: `${role.color}20`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Shield size={18} color={role.color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                          {role.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {role.userCount} usuarios
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: 'var(--panel)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Edit size={14} color="var(--muted)" />
                        </button>
                        <button
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: 'var(--panel)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} color="var(--danger)" />
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {role.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ padding: 8 }}>
              <div className="h-subtitle" style={{ marginBottom: 12 }}>
                Usuarios por Rol
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {roles.map((role) => (
                  <div
                    key={role.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 10,
                      borderRadius: 4,
                      background: 'var(--panel)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Users size={16} color={role.color} />
                      <span style={{ fontSize: 14 }}>{role.name}</span>
                    </div>
                    <Badge variant="neutral" size="sm">
                      {role.userCount}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <div style={{ padding: 8 }}>
            <div className="h-subtitle" style={{ marginBottom: 12 }}>
              {selectedRole ? `Permisos: ${selectedRole.name}` : 'Selecciona un rol'}
            </div>
            {selectedRole ? (
              <div style={{ display: 'grid', gap: 16 }}>
                {Object.entries(
                  ALL_PERMISSIONS.reduce((acc, perm) => {
                    if (!acc[perm.module]) acc[perm.module] = [];
                    acc[perm.module].push(perm);
                    return acc;
                  }, {} as Record<string, typeof ALL_PERMISSIONS>)
                ).map(([module, perms]) => (
                  <div key={module}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--muted)' }}>
                      {module}
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {perms.map((perm) => {
                        const hasPermission = selectedRole.permissions.includes(perm.id);
                        return (
                          <div
                            key={perm.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: 10,
                              borderRadius: 4,
                              background: hasPermission ? 'var(--success)10' : 'var(--panel)',
                              border: `1px solid ${hasPermission ? 'var(--success)' : 'var(--border)'}`,
                            }}
                          >
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 4,
                                background: hasPermission ? 'var(--success)' : 'var(--panel)',
                                border: `1px solid ${hasPermission ? 'var(--success)' : 'var(--border)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {hasPermission ? (
                                <Check size={14} color="#fff" />
                              ) : (
                                <X size={14} color="var(--muted)" />
                              )}
                            </div>
                            <span style={{ fontSize: 14, flex: 1 }}>{perm.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                Selecciona un rol para ver sus permisos
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
