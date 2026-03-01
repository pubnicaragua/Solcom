'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Shield, Users, Edit, Trash2, Plus, Save, XCircle, UserPlus, Loader2, Key } from 'lucide-react';
import CreateRoleModal from './components/CreateRoleModal';
import EditRoleModal from './components/EditRoleModal';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  is_custom: boolean;
  created_at: string;
}

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: 'SUPER ADMIN',
  manager: 'SUPERVISOR',
  operator: 'Colaborador',
  auditor: 'Auditor'
};

export default function RolesPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Users state
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editingPassword, setEditingPassword] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('');
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [userQuery, setUserQuery] = useState('');

  // Roles state
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    await Promise.all([loadRoles(), loadUsers()]);
    setLoading(false);
  }

  async function loadRoles() {
    try {
      const response = await fetch('/api/roles');
      if (response.ok) {
        const data = await response.json();
        setRoles(data);
        if (data.length > 0 && !newUserRole) {
          setNewUserRole(data[0].name);
        }
      }
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  }

  async function loadUsers() {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function handleUpdateUser(userId: string) {
    if (!editingUser) return;
    
    try {
      // 1. Update Profile (Name & Role)
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          role: editingUser.role,
          full_name: editingUser.full_name
        })
      });

      if (!response.ok) {
        throw new Error('Error al actualizar el perfil del usuario');
      }

      // 2. Update Password if provided
      if (editingPassword) {
        const passRes = await fetch(`/api/users/${userId}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: editingPassword })
        });
        
        if (!passRes.ok) {
          throw new Error('Error al actualizar la contraseña');
        }
      }

      await loadUsers();
      setEditingUser(null);
      setEditingPassword('');
      alert('Usuario actualizado correctamente');
    } catch (error: any) {
      alert(error.message || 'Error al actualizar el usuario');
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
      } else {
        alert('Error al eliminar el usuario');
      }
    } catch (error) {
      alert('Error al eliminar el usuario');
    }
  }

  async function handleCreateUser() {
    if (!newUserEmail || !newUserName) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail,
          full_name: newUserName,
          role: newUserRole || (roles[0]?.name || 'operator'),
          password: newUserPassword || undefined
        })
      });

      if (response.ok) {
        await loadUsers();
        setShowNewUserForm(false);
        setNewUserEmail('');
        setNewUserName('');
        setNewUserPassword('');
        setNewUserRole(roles[0]?.name || '');
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Error al crear el usuario');
    }
  }

  function getRoleCount(roleName: string) {
    return users.filter(u => u.role === roleName).length;
  }

  const getRoleDisplayName = (name: string) => {
    return ROLE_DISPLAY_NAMES[name] || name;
  };

  const filteredUsers = users.filter((u) => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return true;
    return [u.full_name, u.email, getRoleDisplayName(u.role)]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="h-title">Roles y Usuarios</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={() => setShowCreateRoleModal(true)}>
            <Plus size={16} style={{ marginRight: 6 }} />
            Nuevo Rol
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowNewUserForm(!showNewUserForm)}>
            <UserPlus size={16} style={{ marginRight: 6 }} />
            Nuevo Usuario
          </Button>
        </div>
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
                onChange={(e) => setNewUserRole(e.target.value)}
                options={roles.map(r => ({ value: r.name, label: getRoleDisplayName(r.name) }))}
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
        <Card>
          <div style={{ padding: 8 }}>
            <div className="h-subtitle" style={{ marginBottom: 12 }}>
              Roles del Sistema
            </div>
            {loading && roles.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>Cargando roles...</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {roles.map((role) => (
                  <div
                    key={role.id}
                    style={{
                      padding: 14,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--panel)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 6,
                          background: 'var(--brand-primary)10',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Shield size={18} color="var(--brand-primary)" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {getRoleDisplayName(role.name)}
                          {role.is_custom && <Badge size="sm" variant="neutral">Personalizado</Badge>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {getRoleCount(role.name)} usuarios asignados
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setEditingRole(role)}
                          title="Configurar Accesos"
                          style={{
                            padding: '6px 12px',
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: 'var(--panel)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          <Edit size={14} color="var(--muted)" />
                          Configurar
                        </button>
                      </div>
                    </div>
                    {role.description && (
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                        {role.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 8 }}>
            <div className="h-subtitle" style={{ marginBottom: 12 }}>
              Usuarios del Sistema
            </div>
            <div style={{ marginBottom: 10 }}>
              <Input
                placeholder="Buscar usuario por nombre, correo o rol"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
              />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {loading && users.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>Cargando usuarios...</div>
              ) : (
                filteredUsers.map((user) => (
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
                      <div style={{ display: 'grid', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Nombre Completo</label>
                          <Input
                            value={editingUser.full_name}
                            onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                            style={{ fontSize: 13 }}
                          />
                        </div>
                        
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Correo (No editable)</label>
                          <Input value={user.email} disabled style={{ fontSize: 13, opacity: 0.7 }} />
                        </div>
                        
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Asignar Rol</label>
                          <Select
                            value={editingUser.role}
                            onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                            options={roles.map(r => ({ value: r.name, label: getRoleDisplayName(r.name) }))}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                            <Key size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Cambiar Contraseña (dejar vacío si no se desea cambiar)
                          </label>
                          <Input
                            type="password"
                            placeholder="Nueva contraseña"
                            value={editingPassword}
                            onChange={(e) => setEditingPassword(e.target.value)}
                            style={{ fontSize: 13 }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleUpdateUser(user.id)}
                          >
                            <Save size={14} style={{ marginRight: 4 }} />
                            Guardar Cambios
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingUser(null);
                              setEditingPassword('');
                            }}
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
                          <Badge variant="neutral" size="sm">
                            {getRoleDisplayName(user.role)}
                          </Badge>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setEditingUser(user)}
                            title="Editar usuario"
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
                            title="Eliminar usuario"
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

      <CreateRoleModal 
        isOpen={showCreateRoleModal} 
        onClose={() => setShowCreateRoleModal(false)}
        onSave={loadRoles}
      />

      <EditRoleModal
        isOpen={!!editingRole}
        role={editingRole}
        onClose={() => setEditingRole(null)}
        onSave={loadRoles}
      />
    </div>
  );
}
