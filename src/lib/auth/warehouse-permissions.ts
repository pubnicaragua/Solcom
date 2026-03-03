import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export type AppRole = 'admin' | 'manager' | 'operator' | 'auditor';

type SupabaseRouteClient = ReturnType<typeof createRouteHandlerClient>;

type AuthResult =
  | {
      ok: true;
      userId: string;
      role: AppRole;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

interface WarehouseSettingRow {
  all_warehouses: boolean | null;
  can_view_stock: boolean | null;
}

interface WarehousePermissionRow {
  warehouse_id: string | null;
  can_view_stock: boolean | null;
}

export interface WarehouseAccessScope {
  canViewStock: boolean;
  allWarehouses: boolean;
  warehouseIds: string[];
  hasExplicitScope: boolean;
}

export interface WarehouseRecord {
  id: string;
  code: string;
  name: string;
  active: boolean;
  warehouse_type?: string | null;
  parent_warehouse_id?: string | null;
}

const VALID_ROLES: AppRole[] = ['admin', 'manager', 'operator', 'auditor'];

function normalizeRole(value: unknown): AppRole {
  const role = String(value ?? '').trim().toLowerCase();
  return (VALID_ROLES.includes(role as AppRole) ? role : 'operator') as AppRole;
}

function isMissingRelationError(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? '');
  return code === '42P01';
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) set.add(normalized);
  }
  return Array.from(set);
}

export async function getAuthenticatedProfile(supabase: SupabaseRouteClient): Promise<AuthResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      status: 401,
      error: 'No autorizado',
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      status: 403,
      error: 'No se pudo validar el perfil del usuario',
    };
  }

  if (!profile) {
    return {
      ok: false,
      status: 403,
      error: 'El usuario no tiene perfil asignado',
    };
  }

  return {
    ok: true,
    userId: user.id,
    role: normalizeRole((profile as { role?: string }).role),
  };
}

export async function requireAdminProfile(supabase: SupabaseRouteClient): Promise<AuthResult> {
  const auth = await getAuthenticatedProfile(supabase);
  if (!auth.ok) return auth;

  if (auth.role !== 'admin') {
    return {
      ok: false,
      status: 403,
      error: 'Solo administradores pueden realizar esta acción',
    };
  }

  return auth;
}

export async function getWarehouseAccessScope(
  supabase: SupabaseRouteClient,
  userId: string,
  role: AppRole
): Promise<WarehouseAccessScope> {
  if (role === 'admin') {
    return {
      canViewStock: true,
      allWarehouses: true,
      warehouseIds: [],
      hasExplicitScope: true,
    };
  }

  const [settingsRes, permissionsRes] = await Promise.all([
    supabase
      .from('user_warehouse_settings')
      .select('all_warehouses, can_view_stock')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_warehouse_permissions')
      .select('warehouse_id, can_view_stock')
      .eq('user_id', userId),
  ]);

  const missingSettingsTable = isMissingRelationError(settingsRes.error);
  const missingPermissionsTable = isMissingRelationError(permissionsRes.error);
  if (missingSettingsTable || missingPermissionsTable) {
    // Backward-compatible fallback before migration is applied.
    return {
      canViewStock: true,
      allWarehouses: true,
      warehouseIds: [],
      hasExplicitScope: false,
    };
  }

  if (settingsRes.error) throw settingsRes.error;
  if (permissionsRes.error) throw permissionsRes.error;

  const settings = (settingsRes.data || null) as WarehouseSettingRow | null;
  const permissions = (permissionsRes.data || []) as WarehousePermissionRow[];

  const hasSettings = Boolean(settings);
  const hasRows = permissions.length > 0;
  const hasExplicitScope = hasSettings || hasRows;

  if (!hasExplicitScope) {
    return {
      canViewStock: false,
      allWarehouses: false,
      warehouseIds: [],
      hasExplicitScope: false,
    };
  }

  const canViewStock = settings?.can_view_stock ?? true;
  if (!canViewStock) {
    return {
      canViewStock: false,
      allWarehouses: false,
      warehouseIds: [],
      hasExplicitScope: true,
    };
  }

  const allWarehouses = settings?.all_warehouses ?? false;
  if (allWarehouses) {
    return {
      canViewStock: true,
      allWarehouses: true,
      warehouseIds: [],
      hasExplicitScope: true,
    };
  }

  const warehouseIds = uniqueIds(
    permissions
      .filter((row) => row.can_view_stock !== false)
      .map((row) => row.warehouse_id)
  );

  return {
    canViewStock: true,
    allWarehouses: false,
    warehouseIds,
    hasExplicitScope: true,
  };
}

export function isWarehouseAllowed(scope: WarehouseAccessScope, warehouseId: string): boolean {
  if (!scope.canViewStock) return false;
  if (scope.allWarehouses) return true;
  return scope.warehouseIds.includes(warehouseId);
}

export async function listWarehousesForScope(
  supabase: SupabaseRouteClient,
  scope: WarehouseAccessScope,
  options?: { activeOnly?: boolean; warehouseType?: string }
): Promise<WarehouseRecord[]> {
  if (!scope.canViewStock) return [];

  const activeOnly = options?.activeOnly ?? false;
  let query = supabase
    .from('warehouses')
    .select('id, code, name, active, warehouse_type, parent_warehouse_id')
    .order('code', { ascending: true });

  if (activeOnly) {
    query = query.eq('active', true);
  }

  if (options?.warehouseType) {
    query = query.eq('warehouse_type', options.warehouseType);
  }

  if (!scope.allWarehouses) {
    if (scope.warehouseIds.length === 0) return [];
    query = query.in('id', scope.warehouseIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    active: Boolean(row.active),
    warehouse_type: row.warehouse_type || null,
    parent_warehouse_id: row.parent_warehouse_id || null,
  }));
}
