import type { SupabaseClient, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getDefaultModuleAccess, mapOverrides, mergeModuleOverrides, restrictAdminOnlyModules } from './module-permissions';

export type UserRole = 'admin' | 'manager' | 'operator' | 'auditor';
export interface RoleState {
  role: UserRole;
  moduleAccess: Record<string, boolean>;
  permissionCodes: string[];
  loading: boolean;
  error: string | null;
}
type RoleClient = Pick<SupabaseClient, 'from' | 'auth'>;
const pendingByClient = new WeakMap<RoleClient, Map<string, Promise<RoleState>>>();
const emptyState = (): RoleState => ({ role: 'operator', moduleAccess: {}, permissionCodes: [], loading: true, error: null });

function loadRole(client: RoleClient, userId: string): Promise<RoleState> {
  let pending = pendingByClient.get(client);
  if (!pending) { pending = new Map(); pendingByClient.set(client, pending); }
  const existing = pending.get(userId);
  if (existing) return existing;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const query = async (): Promise<RoleState> => {
    const profile = await client.from('user_profiles').select('role').eq('id', userId)
      .abortSignal(controller.signal).maybeSingle();
    if (profile.error || !profile.data) throw new Error('No se pudo cargar el perfil');
    const rawRole = String(profile.data.role || '').trim();
    const normalized = rawRole.toLowerCase();
    const role: UserRole = ['admin', 'manager', 'operator', 'auditor'].includes(normalized)
      ? normalized as UserRole : 'operator';
    const [overrides, permissions] = await Promise.all([
      client.from('user_module_permissions').select('module, can_access').eq('user_id', userId).abortSignal(controller.signal),
      client.from('role_permissions').select('permission_code').eq('role', rawRole).abortSignal(controller.signal),
    ]);
    if (overrides.error || permissions.error) throw new Error('No se pudieron cargar los permisos');
    const base = getDefaultModuleAccess(role);
    for (const permission of permissions.data || []) {
      const code = String(permission.permission_code);
      if (/\.(read|view|write|use)$/.test(code)) base[code.split('.')[0]] = true;
    }
    return { role, moduleAccess: restrictAdminOnlyModules(mergeModuleOverrides(base, mapOverrides(overrides.data)), role), permissionCodes: (permissions.data || []).map(row => String(row.permission_code)), loading: false, error: null };
  };
  const promise = Promise.race([
    query(),
    new Promise<RoleState>((_, reject) => {
      timeout = setTimeout(() => { controller.abort(); reject(new Error('Tiempo de espera agotado')); }, 8000);
    }),
  ]).finally(() => { clearTimeout(timeout); pending!.delete(userId); });
  pending.set(userId, promise);
  return promise;
}

// UI permissions only. API routes and middleware retain their own authorization.
// Use the SDK's initial session event rather than validating the user again in
// every hook. Defer queries until the auth callback has released its session lock.
export function subscribeToRole(client: RoleClient, emit: (state: RoleState) => void) {
  let state = emptyState();
  let disposed = false;
  let currentUser: string | null = null;
  let resolvedUser: string | null = null;
  let generation = 0;
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  const publish = (next: RoleState) => { state = next; if (!disposed) emit(next); };
  publish(state);
  const startAuthDeadline = () => setTimeout(() => {
    if (!disposed && state.loading && !currentUser) publish({ ...emptyState(), loading: false, error: 'No se pudo cargar la sesión' });
  }, 8000);
  let authDeadline = startAuthDeadline();

  async function refresh(userId: string) {
    const request = ++generation;
    if (resolvedUser !== userId) publish(emptyState());
    try {
      const next = await loadRole(client, userId);
      if (disposed || request !== generation || currentUser !== userId) return;
      resolvedUser = userId;
      publish(next);
    } catch {
      if (disposed || request !== generation) return;
      publish({ ...state, loading: false, error: 'No se pudieron cargar los permisos' });
    }
  }
  const schedule = (userId: string) => {
    if (scheduled !== null) clearTimeout(scheduled);
    scheduled = setTimeout(() => { scheduled = null; void refresh(userId); }, 0);
  };
  const onAuthChange = (_event: AuthChangeEvent, session: Session | null) => {
    if (disposed) return;
    clearTimeout(authDeadline);
    const userId = session?.user?.id || null;
    if (userId !== currentUser) {
      generation++;
      resolvedUser = null;
      publish({ ...emptyState(), loading: Boolean(userId) });
    }
    currentUser = userId;
    if (scheduled !== null) { clearTimeout(scheduled); scheduled = null; }
    if (!userId) { generation++; resolvedUser = null; publish({ ...emptyState(), loading: false }); return; }
    schedule(userId);
  };
  let { data: { subscription } } = client.auth.onAuthStateChange(onAuthChange);
  return {
    reload() {
      if (disposed) return;
      if (currentUser) { schedule(currentUser); return; }
      subscription.unsubscribe();
      clearTimeout(authDeadline);
      publish(emptyState());
      authDeadline = startAuthDeadline();
      subscription = client.auth.onAuthStateChange(onAuthChange).data.subscription;
    },
    dispose() {
      disposed = true; generation++;
      clearTimeout(authDeadline);
      if (scheduled !== null) clearTimeout(scheduled);
      subscription.unsubscribe();
    },
  };
}
