'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Shield, Edit, Trash2, Check, X, Save, XCircle, UserPlus, Loader2, Building2, Blocks } from 'lucide-react';

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

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  active: boolean;
  selected?: boolean;
}

interface ModulePermissionOption {
  module: string;
  label: string;
  allowed_by_role: boolean;
  override_mode: 'inherit' | 'allow' | 'deny';
  effective_access: boolean;
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
  const [usersError, setUsersError] = useState<string | null>(null);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [savingPermission, setSavingPermission] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [permissionQuery, setPermissionQuery] = useState('');
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [warehouseModalLoading, setWarehouseModalLoading] = useState(false);
  const [warehouseModalSaving, setWarehouseModalSaving] = useState(false);
  const [warehouseModalError, setWarehouseModalError] = useState<string | null>(null);
  const [warehouseModalUser, setWarehouseModalUser] = useState<UserProfile | null>(null);
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseOption[]>([]);
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [allWarehousesAccess, setAllWarehousesAccess] = useState(false);
  const [canViewStock, setCanViewStock] = useState(true);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [moduleModalLoading, setModuleModalLoading] = useState(false);
  const [moduleModalSaving, setModuleModalSaving] = useState(false);
  const [moduleModalError, setModuleModalError] = useState<string | null>(null);
  const [moduleModalUser, setModuleModalUser] = useState<UserProfile | null>(null);
  const [moduleOptions, setModuleOptions] = useState<ModulePermissionOption[]>([]);
  const [moduleModes, setModuleModes] = useState<Record<string, 'inherit' | 'allow' | 'deny'>>({});
  const [moduleSearch, setModuleSearch] = useState('');

  useEffect(() => {
    loadUsers();
    loadPermissions();
  }, []);

  useEffect(() => {
    if (selectedRole) {
      loadRolePermissions(selectedRole);
    }
  }, [selectedRole]);

  async function readApiError(response: Response, fallback: string) {
    try {
      const data = await response.json();
      return data?.error || fallback;
    } catch {
      return fallback;
    }
  }

  async function loadUsers() {
    setLoading(true);
    setUsersError(null);
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        const message = await readApiError(response, 'No se pudieron cargar los usuarios');
        setUsers([]);
        setUsersError(message);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      setUsers([]);
      setUsersError('Error de conexión al cargar usuarios');
    }
    setLoading(false);
  }

  async function loadPermissions() {
    setPermissionsError(null);
    try {
      const response = await fetch('/api/permissions');
      if (response.ok) {
        const data = await response.json();
        setPermissions(data);
      } else {
        const message = await readApiError(response, 'No se pudieron cargar los permisos');
        setPermissions([]);
        setPermissionsError(message);
      }
    } catch (error) {
      console.error('Error loading permissions:', error);
      setPermissions([]);
      setPermissionsError('Error de conexión al cargar permisos');
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

  async function openWarehousePermissions(user: UserProfile) {
    setWarehouseModalOpen(true);
    setWarehouseModalUser(user);
    setWarehouseModalLoading(true);
    setWarehouseModalError(null);
    setWarehouseOptions([]);
    setWarehouseSearch('');
    setAllWarehousesAccess(false);
    setCanViewStock(true);
    setSelectedWarehouseIds([]);

    try {
      const response = await fetch(`/api/users/${user.id}/warehouse-permissions`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'No se pudieron cargar los permisos por bodega');
      }

      const options = Array.isArray(data?.warehouses) ? (data.warehouses as WarehouseOption[]) : [];
      const warehouseIdsFromResponse = Array.isArray(data?.warehouse_ids)
        ? (data.warehouse_ids as string[])
        : options.filter((option) => option.selected).map((option) => option.id);

      setWarehouseOptions(options);
      setAllWarehousesAccess(Boolean(data?.all_warehouses));
      setCanViewStock(Boolean(data?.can_view_stock ?? true));
      setSelectedWarehouseIds(Array.from(new Set(warehouseIdsFromResponse)));
    } catch (error: any) {
      setWarehouseModalError(error?.message || 'Error al cargar permisos de bodega');
    } finally {
      setWarehouseModalLoading(false);
    }
  }

  function closeWarehousePermissions() {
    if (warehouseModalSaving) return;
    setWarehouseModalOpen(false);
    setWarehouseModalUser(null);
    setWarehouseModalError(null);
  }

  function toggleWarehouseSelection(warehouseId: string) {
    setSelectedWarehouseIds((prev) =>
      prev.includes(warehouseId) ? prev.filter((id) => id !== warehouseId) : [...prev, warehouseId]
    );
  }

  async function saveWarehousePermissions() {
    if (!warehouseModalUser) return;
    setWarehouseModalSaving(true);
    setWarehouseModalError(null);

    try {
      const payload = {
        all_warehouses: allWarehousesAccess,
        can_view_stock: canViewStock,
        warehouse_ids: allWarehousesAccess ? [] : selectedWarehouseIds,
      };

      const response = await fetch(`/api/users/${warehouseModalUser.id}/warehouse-permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'No se pudieron guardar los permisos');
      }

      alert('Permisos por bodega actualizados correctamente');
      closeWarehousePermissions();
    } catch (error: any) {
      setWarehouseModalError(error?.message || 'Error al guardar permisos por bodega');
    } finally {
      setWarehouseModalSaving(false);
    }
  }

  async function openModulePermissions(user: UserProfile) {
    setModuleModalOpen(true);
    setModuleModalUser(user);
    setModuleModalLoading(true);
    setModuleModalSaving(false);
    setModuleModalError(null);
    setModuleOptions([]);
    setModuleModes({});
    setModuleSearch('');

    try {
      const response = await fetch(`/api/users/${user.id}/module-permissions`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'No se pudieron cargar permisos por módulo');
      }

      const modules = Array.isArray(data?.modules) ? (data.modules as ModulePermissionOption[]) : [];
      const modeMap: Record<string, 'inherit' | 'allow' | 'deny'> = {};
      for (const moduleRow of modules) {
        modeMap[moduleRow.module] = moduleRow.override_mode || 'inherit';
      }
      setModuleOptions(modules);
      setModuleModes(modeMap);
    } catch (error: any) {
      setModuleModalError(error?.message || 'Error al cargar permisos por módulo');
    } finally {
      setModuleModalLoading(false);
    }
  }

  function closeModulePermissions() {
    if (moduleModalSaving) return;
    setModuleModalOpen(false);
    setModuleModalUser(null);
    setModuleModalError(null);
  }

  function setModuleMode(module: string, mode: 'inherit' | 'allow' | 'deny') {
    setModuleModes((prev) => ({ ...prev, [module]: mode }));
  }

  async function saveModulePermissions() {
    if (!moduleModalUser) return;
    setModuleModalSaving(true);
    setModuleModalError(null);

    try {
      const overrides = moduleOptions.map((moduleRow) => ({
        module: moduleRow.module,
        mode: moduleModes[moduleRow.module] || 'inherit',
      }));

      const response = await fetch(`/api/users/${moduleModalUser.id}/module-permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'No se pudieron guardar permisos por módulo');
      }

      alert('Permisos por módulo actualizados correctamente');
      closeModulePermissions();
    } catch (error: any) {
      setModuleModalError(error?.message || 'Error al guardar permisos por módulo');
    } finally {
      setModuleModalSaving(false);
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

  async function setModulePermissions(module: string, enable: boolean) {
    if (!selectedRole) return;

    const modulePerms = permissions.filter((p) => p.module === module);
    if (modulePerms.length === 0) return;

    setSavingPermission(true);
    try {
      for (const perm of modulePerms) {
        const hasPerm = rolePermissions.some((rp) => rp.permission_code === perm.code);
        if ((enable && hasPerm) || (!enable && !hasPerm)) continue;

        await fetch('/api/role-permissions', {
          method: enable ? 'POST' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: selectedRole, permission_code: perm.code })
        });
      }

      await loadRolePermissions(selectedRole);
    } catch (error) {
      console.error('Error bulk updating module permissions:', error);
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

  const filteredUsers = users.filter((u) => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return true;
    return [u.full_name, u.email, ROLE_DEFINITIONS[u.role]?.name || u.role]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  const filteredWarehouseOptions = warehouseOptions.filter((warehouse) => {
    const q = warehouseSearch.trim().toLowerCase();
    if (!q) return true;
    return `${warehouse.code} ${warehouse.name}`.toLowerCase().includes(q);
  });

  const filteredModuleOptions = moduleOptions.filter((moduleRow) => {
    const q = moduleSearch.trim().toLowerCase();
    if (!q) return true;
    return `${moduleRow.label} ${moduleRow.module}`.toLowerCase().includes(q);
  });

  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.module]) acc[perm.module] = [];
    acc[perm.module].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

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
              <div style={{ marginBottom: 10 }}>
                <Input
                  placeholder="Buscar usuario por nombre o correo"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                />
              </div>
              {usersError && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: 10,
                    borderRadius: 6,
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#fecaca',
                    fontSize: 12,
                  }}
                >
                  {usersError}
                </div>
              )}
              <div style={{ display: 'grid', gap: 8 }}>
                {loading ? (
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
                              onClick={() => openModulePermissions(user)}
                              title="Permisos por módulo"
                              style={{
                                height: 28,
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                background: 'var(--panel)',
                                color: 'var(--text)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                cursor: 'pointer',
                                padding: '0 10px',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              <Blocks size={14} color="var(--muted)" />
                              Módulos
                            </button>
                            <button
                              onClick={() => openWarehousePermissions(user)}
                              title="Permisos de bodegas"
                              style={{
                                height: 28,
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                background: 'var(--panel)',
                                color: 'var(--text)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                cursor: 'pointer',
                                padding: '0 10px',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              <Building2 size={14} color="var(--muted)" />
                              Bodegas
                            </button>
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
                <div>
                  <Input
                    placeholder="Buscar permiso por nombre, código o módulo"
                    value={permissionQuery}
                    onChange={(e) => setPermissionQuery(e.target.value)}
                  />
                </div>
                {savingPermission && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: 'var(--brand-primary)10', borderRadius: 4 }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 13 }}>Actualizando permisos...</span>
                  </div>
                )}
                {permissions.length === 0 && (
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 13,
                      color: permissionsError ? '#fecaca' : 'var(--muted)',
                      background: permissionsError ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                    }}
                  >
                    {permissionsError
                      ? `Error cargando permisos: ${permissionsError}`
                      : 'No hay permisos cargados en la tabla `permissions`. Ejecuta el script `permissions-schema.sql`.'}
                  </div>
                )}
                {Object.entries(groupedPermissions).map(([module, perms]) => {
                  const query = permissionQuery.trim().toLowerCase();
                  const visiblePerms = query
                    ? perms.filter((perm) =>
                        [perm.module, perm.name, perm.code, perm.description || ''].join(' ').toLowerCase().includes(query)
                      )
                    : perms;

                  if (visiblePerms.length === 0) return null;

                  const modulePermsEnabled = visiblePerms.filter((perm) =>
                    rolePermissions.some((rp) => rp.permission_code === perm.code)
                  ).length;

                  return (
                  <div key={module}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        {module} ({modulePermsEnabled}/{visiblePerms.length})
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button variant="ghost" size="sm" onClick={() => setModulePermissions(module, true)}>
                          Activar todo
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setModulePermissions(module, false)}>
                          Quitar todo
                        </Button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {visiblePerms.map((perm) => {
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
                )})}
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                Selecciona un rol para ver y modificar sus permisos
              </div>
            )}
          </div>
        </Card>
      </div>

      {moduleModalOpen && moduleModalUser && (
        <div
          onClick={closeModulePermissions}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 101,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(820px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel-2)',
              padding: 16,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div className="h-subtitle" style={{ marginBottom: 2 }}>Permisos por Módulo</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {moduleModalUser.full_name || moduleModalUser.email}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={closeModulePermissions}>Cerrar</Button>
            </div>

            {moduleModalLoading ? (
              <div style={{ padding: 18, textAlign: 'center', color: 'var(--muted)' }}>
                Cargando módulos...
              </div>
            ) : (
              <>
                {moduleModalError && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 13,
                      color: '#fecaca',
                    }}
                  >
                    {moduleModalError}
                  </div>
                )}

                <Input
                  placeholder="Buscar módulo por nombre o código"
                  value={moduleSearch}
                  onChange={(event) => setModuleSearch(event.target.value)}
                />

                <div
                  style={{
                    maxHeight: 430,
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 8,
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  {filteredModuleOptions.length === 0 ? (
                    <div style={{ padding: 10, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                      No hay módulos para mostrar.
                    </div>
                  ) : (
                    filteredModuleOptions.map((moduleRow) => {
                      const mode = moduleModes[moduleRow.module] || 'inherit';
                      const effectiveAccess =
                        mode === 'allow' ? true : mode === 'deny' ? false : moduleRow.allowed_by_role;

                      return (
                        <div
                          key={moduleRow.module}
                          style={{
                            display: 'grid',
                            gap: 8,
                            padding: 10,
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: effectiveAccess ? 'var(--success)10' : 'var(--panel)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{moduleRow.label}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{moduleRow.module}</div>
                            </div>
                            <div style={{ fontSize: 11, color: effectiveAccess ? 'var(--success)' : 'var(--danger)' }}>
                              {effectiveAccess ? 'Acceso habilitado' : 'Acceso denegado'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => setModuleMode(moduleRow.module, 'inherit')}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: mode === 'inherit' ? '1px solid var(--brand-primary)' : '1px solid var(--border)',
                                background: mode === 'inherit' ? 'var(--brand-primary)20' : 'var(--panel)',
                                color: 'var(--text)',
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              Heredar ({moduleRow.allowed_by_role ? 'rol: permitido' : 'rol: denegado'})
                            </button>
                            <button
                              type="button"
                              onClick={() => setModuleMode(moduleRow.module, 'allow')}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: mode === 'allow' ? '1px solid var(--success)' : '1px solid var(--border)',
                                background: mode === 'allow' ? 'var(--success)20' : 'var(--panel)',
                                color: 'var(--text)',
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              Permitir
                            </button>
                            <button
                              type="button"
                              onClick={() => setModuleMode(moduleRow.module, 'deny')}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: mode === 'deny' ? '1px solid var(--danger)' : '1px solid var(--border)',
                                background: mode === 'deny' ? 'rgba(239,68,68,0.18)' : 'var(--panel)',
                                color: 'var(--text)',
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              Denegar
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button variant="secondary" size="sm" onClick={closeModulePermissions} disabled={moduleModalSaving}>
                    Cancelar
                  </Button>
                  <Button variant="primary" size="sm" onClick={saveModulePermissions} disabled={moduleModalSaving}>
                    {moduleModalSaving ? 'Guardando...' : 'Guardar permisos'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {warehouseModalOpen && warehouseModalUser && (
        <div
          onClick={closeWarehousePermissions}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(760px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel-2)',
              padding: 16,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div className="h-subtitle" style={{ marginBottom: 2 }}>Permisos de Bodega</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {warehouseModalUser.full_name || warehouseModalUser.email}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={closeWarehousePermissions}>Cerrar</Button>
            </div>

            {warehouseModalLoading ? (
              <div style={{ padding: 18, textAlign: 'center', color: 'var(--muted)' }}>
                Cargando configuración...
              </div>
            ) : (
              <>
                {warehouseModalError && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 13,
                      color: '#fecaca',
                    }}
                  >
                    {warehouseModalError}
                  </div>
                )}

                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={canViewStock}
                      onChange={(event) => setCanViewStock(event.target.checked)}
                    />
                    Permitir ver stock
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={allWarehousesAccess}
                      onChange={(event) => setAllWarehousesAccess(event.target.checked)}
                      disabled={!canViewStock}
                    />
                    Acceso a todas las bodegas
                  </label>
                </div>

                {!allWarehousesAccess && canViewStock && (
                  <>
                    <Input
                      placeholder="Buscar bodega por código o nombre"
                      value={warehouseSearch}
                      onChange={(event) => setWarehouseSearch(event.target.value)}
                    />
                    <div
                      style={{
                        maxHeight: 320,
                        overflowY: 'auto',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: 8,
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      {filteredWarehouseOptions.length === 0 ? (
                        <div style={{ padding: 10, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                          No hay bodegas para mostrar.
                        </div>
                      ) : (
                        filteredWarehouseOptions.map((warehouse) => (
                          <label
                            key={warehouse.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: 8,
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: selectedWarehouseIds.includes(warehouse.id) ? 'var(--brand-primary)15' : 'var(--panel)',
                              fontSize: 13,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedWarehouseIds.includes(warehouse.id)}
                              onChange={() => toggleWarehouseSelection(warehouse.id)}
                            />
                            <span style={{ fontWeight: 600 }}>{warehouse.code}</span>
                            <span style={{ color: 'var(--muted)' }}>{warehouse.name}</span>
                            {!warehouse.active && (
                              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--warning)' }}>Inactiva</span>
                            )}
                          </label>
                        ))
                      )}
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {allWarehousesAccess
                      ? 'Acceso completo a bodegas activado.'
                      : `${selectedWarehouseIds.length} bodega(s) seleccionada(s).`}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="secondary" size="sm" onClick={closeWarehousePermissions} disabled={warehouseModalSaving}>
                      Cancelar
                    </Button>
                    <Button variant="primary" size="sm" onClick={saveWarehousePermissions} disabled={warehouseModalSaving}>
                      {warehouseModalSaving ? 'Guardando...' : 'Guardar permisos'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
