'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Shield, Users, Edit, Trash2, Plus, Check, X, Save, XCircle, UserPlus, Loader2 } from 'lucide-react';
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

interface Permission {
  id: string;
  code: string;
  name: string;
  description: string;
  module: string;
}

interface RolePermission {
  role: string;
  permission_code: string;
}

const ROLE_DEFINITIONS: Record<string, { name: string; description: string; color: string }> = {
  admin: {
    name: 'Administrador',
    description: 'Acceso completo al sistema',
    color: 'var(--brand-accent)',
  },
  manager: {
    name: 'Gerente de Bodega',
    description: 'Gestión de inventario y transferencias',
    color: 'var(--success)',
  },
  operator: {
    name: 'Vendedor',
    description: 'Solo lectura de inventario y ventas',
    color: '#3B82F6',
  },
  auditor: {
    name: 'Auditor',
    description: 'Solo lectura de reportes',
    color: 'var(--warning)',
  },
};


export default function RolesPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'manager' | 'operator' | 'auditor'>('operator');
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [savingPermission, setSavingPermission] = useState(false);
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    loadUsers();
    loadPermissions();
  }, []);

  useEffect(() => {
    if (selectedRole) {
      loadRolePermissions(selectedRole);
    }
  }, [selectedRole]);

  async function loadUsers() {
    setLoading(true);
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
    setLoading(false);
  }

  async function loadPermissions() {
    try {
      const response = await fetch('/api/permissions');
      if (response.ok) {
        const data = await response.json();
        setPermissions(data);
      }
    } catch (error) {
      console.error('Error loading permissions:', error);
    }
  }

  async function loadRolePermissions(role: string) {
    try {
      const response = await fetch(`/api/role-permissions?role=${role}`);
      if (response.ok) {
        const data = await response.json();
        setRolePermissions(data);
      }
    } catch (error) {
      console.error('Error loading role permissions:', error);
    }
  }

  async function handleUpdateUserRole(userId: string, newRole: 'admin' | 'manager' | 'operator' | 'auditor') {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });

      if (response.ok) {
        await loadUsers();
        setEditingUser(null);
        alert('Rol actualizado correctamente');
      } else {
        alert('Error al actualizar el rol');
      }
    } catch (error) {
      alert('Error al actualizar el rol');
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('¿Estás seguro de eliminar este usuario? Esta acción no se puede deshacer.')) return;

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadUsers();
        alert('Usuario eliminado correctamente');
      } else {
        alert('Error al eliminar el usuario');
      }
    } catch (error) {
      alert('Error al eliminar el usuario');
    }
  }

  async function handleCreateUser() {
    if (!newUserEmail || !newUserName) {
      alert('Por favor completa todos los campos');
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail,
          full_name: newUserName,
          role: newUserRole,
          password: newUserPassword || undefined
        })
      });

      if (response.ok) {
        await loadUsers();
        setShowNewUserForm(false);
        setNewUserEmail('');
        setNewUserName('');
        setNewUserPassword('');
        setNewUserRole('operator');
        alert('Usuario creado correctamente');
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Error al crear el usuario');
    }
  }

  async function togglePermission(permissionCode: string) {
    if (!selectedRole) return;
    
    setSavingPermission(true);
    const hasPermission = rolePermissions.some(rp => rp.permission_code === permissionCode);

    try {
      const response = await fetch('/api/role-permissions', {
        method: hasPermission ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: selectedRole,
          permission_code: permissionCode
        })
      });

      if (response.ok) {
        await loadRolePermissions(selectedRole);
      }
    } catch (error) {
      console.error('Error toggling permission:', error);
    }
    setSavingPermission(false);
  }

  function getRoleCount(role: string) {
    return users.filter(u => u.role === role).length;
  }

  const rolesWithCounts = Object.entries(ROLE_DEFINITIONS).map(([roleKey, roleInfo]) => ({
    id: roleKey,
    ...roleInfo,
    userCount: getRoleCount(roleKey)
  }));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="h-title">Roles y Permisos</div>
        <Button variant="primary" size="sm" onClick={() => setShowNewUserForm(!showNewUserForm)}>
          <UserPlus size={16} style={{ marginRight: 6 }} />
          Nuevo Usuario
        </Button>
      </div>

      {showNewUserForm && (
        <Card>
          <div style={{ padding: 16 }}>
            <div className="h-subtitle" style={{ marginBottom: 12 }}>Crear Nuevo Usuario</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <Input
                placeholder="Nombre completo"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
              />
              <Input
                type="email"
                placeholder="Email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Contraseña (opcional - se generará automáticamente)"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
              />
              <Select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as any)}
                options={[
                  { value: 'operator', label: 'Vendedor' },
                  { value: 'manager', label: 'Gerente de Bodega' },
                  { value: 'auditor', label: 'Auditor' },
                  { value: 'admin', label: 'Administrador' }
                ]}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" size="sm" onClick={handleCreateUser}>
                  <Save size={14} style={{ marginRight: 4 }} />
                  Crear Usuario
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowNewUserForm(false)}>
                  <XCircle size={14} style={{ marginRight: 4 }} />
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

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
                    onClick={() => setSelectedRole(role.id)}
                    style={{
                      padding: 14,
                      borderRadius: 6,
                      border: `1px solid ${selectedRole === role.id ? role.color : 'var(--border)'}`,
                      background: selectedRole === role.id ? `${role.color}10` : 'var(--panel)',
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
                            value={editingUser.role}
                            onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as any })}
                            options={[
                              { value: 'operator', label: 'Vendedor' },
                              { value: 'manager', label: 'Gerente de Bodega' },
                              { value: 'auditor', label: 'Auditor' },
                              { value: 'admin', label: 'Administrador' }
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
                              {ROLE_DEFINITIONS[user.role]?.name || user.role}
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
              {selectedRole ? `Permisos: ${ROLE_DEFINITIONS[selectedRole]?.name}` : 'Selecciona un rol'}
            </div>
            {selectedRole ? (
              <div style={{ display: 'grid', gap: 16 }}>
                {savingPermission && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: 'var(--brand-primary)10', borderRadius: 4 }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 13 }}>Actualizando permisos...</span>
                  </div>
                )}
                {Object.entries(
                  permissions.reduce((acc, perm) => {
                    if (!acc[perm.module]) acc[perm.module] = [];
                    acc[perm.module].push(perm);
                    return acc;
                  }, {} as Record<string, Permission[]>)
                ).map(([module, perms]) => (
                  <div key={module}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--muted)', textTransform: 'uppercase' }}>
                      {module}
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {perms.map((perm) => {
                        const hasPermission = rolePermissions.some(rp => rp.permission_code === perm.code);
                        return (
                          <div
                            key={perm.code}
                            onClick={() => togglePermission(perm.code)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: 10,
                              borderRadius: 4,
                              background: hasPermission ? 'var(--success)10' : 'var(--panel)',
                              border: `1px solid ${hasPermission ? 'var(--success)' : 'var(--border)'}`,
                              cursor: 'pointer',
                              transition: 'all 0.2s'
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
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 500 }}>{perm.name}</div>
                              {perm.description && (
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{perm.description}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                Selecciona un rol para ver y modificar sus permisos
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
