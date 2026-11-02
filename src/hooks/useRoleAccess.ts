import { useMemo } from 'react';
import { useUserRole, type UserRole } from './useUserRole';

export interface ModuleAccess {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  can_import: boolean;
}

export function resolveRoleAccess(role: UserRole, permissionCodes: string[], moduleCode: string): ModuleAccess {
  if (role === 'admin') {
    return { can_view: true, can_create: true, can_edit: true, can_delete: true, can_export: true, can_import: true };
  }
  const codes = new Set(permissionCodes);
  return {
    can_view: codes.has(`${moduleCode}.view`) || codes.has(`${moduleCode}.read`),
    can_create: codes.has(`${moduleCode}.create`) || codes.has(`${moduleCode}.write`),
    can_edit: codes.has(`${moduleCode}.edit`) || codes.has(`${moduleCode}.write`),
    can_delete: codes.has(`${moduleCode}.delete`),
    can_export: codes.has(`${moduleCode}.export`),
    can_import: codes.has(`${moduleCode}.import`),
  };
}

export function useRoleAccess(moduleCode: string) {
  const { role, permissionCodes, loading } = useUserRole();
  const access = useMemo(() => resolveRoleAccess(role, permissionCodes, moduleCode), [role, permissionCodes, moduleCode]);
  return { access, loading };
}
