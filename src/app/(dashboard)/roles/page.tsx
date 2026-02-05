'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Shield, Users, Edit, Trash2, Plus, Check, X, Save, XCircle } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'operator' | 'auditor';
  created_at: string;
}

interface RoleInfo {
  id: string;
  name: string;
  description: string;
  userCount: number;
  permissions: string[];
  color: string;
}

const ROLE_DEFINITIONS: RoleInfo[] = [
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
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleInfo | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'manager' | 'operator' | 'auditor'>('operator');
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setUsers(data);
    }
    setLoading(false);
  }

  async function handleUpdateUserRole(userId: string, newRole: 'admin' | 'manager' | 'operator' | 'auditor') {
    const { error } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (!error) {
      await loadUsers();
      setEditingUser(null);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;

    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', userId);

    if (!error) {
      await loadUsers();
    }
  }

  function getRoleCount(role: string) {
    return users.filter(u => u.role === role).length;
  }

  const rolesWithCounts = ROLE_DEFINITIONS.map(role => ({
    ...role,
    userCount: getRoleCount(role.id)
  }));

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
                {rolesWithCounts.map((role) => (
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
                {loading ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>Cargando usuarios...</div>
                ) : (
                  users.map((user) => (
                    <div
                      key={user.id}
                      style={{
                        padding: 12,
                        borderRadius: 6,
                        background: 'var(--panel)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {editingUser?.id === user.id ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <Input
                            value={user.full_name}
                            disabled
                            style={{ fontSize: 13 }}
                          />
                          <Select
                            value={user.role}
                            onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as any })}
                            options={[
                              { value: 'admin', label: 'Administrador' },
                              { value: 'manager', label: 'Gerente' },
                              { value: 'operator', label: 'Operador' },
                              { value: 'auditor', label: 'Auditor' }
                            ]}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleUpdateUserRole(user.id, editingUser.role)}
                            >
                              <Save size={14} style={{ marginRight: 4 }} />
                              Guardar
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditingUser(null)}
                            >
                              <XCircle size={14} style={{ marginRight: 4 }} />
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{user.full_name || user.email}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{user.email}</div>
                            <Badge
                              variant={user.role === 'admin' ? 'danger' : user.role === 'manager' ? 'warning' : 'neutral'}
                              size="sm"
                            >
                              {user.role === 'admin' ? 'Administrador' : user.role === 'manager' ? 'Gerente' : user.role === 'operator' ? 'Operador' : 'Auditor'}
                            </Badge>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => setEditingUser(user)}
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
                              onClick={() => handleDeleteUser(user.id)}
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
                      )}
                    </div>
                  ))
                )}
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
