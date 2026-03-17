import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  getDefaultModuleAccess,
  mapOverrides,
  mergeModuleOverrides,
} from '@/lib/auth/module-permissions';

export type UserRole = 'admin' | 'manager' | 'operator' | 'auditor';
export type ModuleAccessMap = Record<string, boolean>;

function normalizeRole(value: unknown): UserRole {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'admin' || role === 'manager' || role === 'operator' || role === 'auditor') {
    return role;
  }
  return 'operator';
}

export function useUserRole() {
  const [role, setRole] = useState<UserRole>('operator');
  const [moduleAccess, setModuleAccess] = useState<ModuleAccessMap>(getDefaultModuleAccess('operator'));
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  useEffect(() => {
    let canceled = false;

    async function fetchRole() {
      if (!canceled) setLoading(true);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!user) {
          if (!canceled) {
            setRole('operator');
            setModuleAccess(getDefaultModuleAccess('operator'));
          }
          return;
        }

        const { data: profile } = await (supabase as any)
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        const normalizedRole = normalizeRole(profile?.role);
        const baseAccess = getDefaultModuleAccess(normalizedRole);

        let overridesMap: ModuleAccessMap = {};
        const { data: overrides, error: overridesError } = await (supabase as any)
          .from('user_module_permissions')
          .select('module, can_access')
          .eq('user_id', user.id);

        if (!overridesError) {
          overridesMap = mapOverrides(overrides || []);
        }

        // --- Carga dinámica por Role Permissions ---
        const { data: rolePerms } = await supabase
          .from('role_permissions')
          .select('permission_code')
          .eq('role', normalizedRole);

        if (rolePerms) {
          for (const rp of rolePerms) {
            const code = String(rp.permission_code);
            const modulePart = code.split('.')[0];
            if (code.endsWith('.read') || code.endsWith('.view') || code.endsWith('.write') || code.endsWith('.use')) {
              baseAccess[modulePart] = true;
            }
          }
        }
        // ------------------------------------------

        if (!canceled) {
          setRole(normalizedRole);
          setModuleAccess(mergeModuleOverrides(baseAccess, overridesMap));
        }
      } catch (error: any) {
        // Ignore aborted auth locks (seen on rapid remounts in dev).
        if (error?.name !== 'AbortError' && process.env.NODE_ENV !== 'production') {
          console.warn('useUserRole error:', error?.message || error);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    fetchRole();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (canceled) return;
      if (!session?.user) {
        setRole('operator');
        setModuleAccess(getDefaultModuleAccess('operator'));
        setLoading(false);
        return;
      }
      void fetchRole();
    });

    return () => {
      canceled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const hasModuleAccess = (module: string) => {
    if (!module) return false;
    return Boolean(moduleAccess[module]);
  };

  return { role, loading, moduleAccess, hasModuleAccess };
}

export function hasPermission(role: UserRole, module: string): boolean {
  return Boolean(getDefaultModuleAccess(role)[module]);
}
