import { useCallback, useEffect, useRef, useState } from 'react';
import { getDefaultModuleAccess } from '@/lib/auth/module-permissions';
import { subscribeToRole, type RoleState, type UserRole } from '@/lib/auth/user-role-loader';
import { supabase } from '@/lib/supabase/client';

export type { UserRole };
export type ModuleAccessMap = Record<string, boolean>;

export function useUserRole() {
  const [state, setState] = useState<RoleState>({ role: 'operator', moduleAccess: {}, permissionCodes: [], loading: true, error: null });
  const subscriptionRef = useRef<ReturnType<typeof subscribeToRole> | null>(null);

  useEffect(() => {
    const subscription = subscribeToRole(supabase, setState);
    subscriptionRef.current = subscription;
    return () => { subscription.dispose(); subscriptionRef.current = null; };
  }, [supabase]);

  const hasModuleAccess = useCallback((module: string) => Boolean(module && state.moduleAccess[module]), [state.moduleAccess]);
  const retry = useCallback(() => subscriptionRef.current?.reload(), []);
  return { ...state, hasModuleAccess, retry };
}

export function hasPermission(role: UserRole, module: string): boolean {
  return Boolean(getDefaultModuleAccess(role)[module]);
}
