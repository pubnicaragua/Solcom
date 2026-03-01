import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export interface ModuleAccess {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
}

export function useRoleAccess(moduleCode: string) {
  const [access, setAccess] = useState<ModuleAccess>({
    can_view: false,
    can_create: false,
    can_edit: false,
    can_delete: false,
    can_export: false
  });
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

    async function fetchAccess() {
      if (!canceled) setLoading(true);

      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          if (!canceled) setLoading(false);
          return;
        }

        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        const role = userProfile?.role || 'operator';

        // Admin siempre tiene acceso total
        if (role === 'admin') {
          if (!canceled) {
            setAccess({ can_view: true, can_create: true, can_edit: true, can_delete: true, can_export: true });
            setLoading(false);
          }
          return;
        }

        // Consultar permisos reales desde role_permissions para este módulo
        const { data: rolePerms } = await supabase
          .from('role_permissions')
          .select('permission_code')
          .eq('role', role)
          .like('permission_code', `${moduleCode}.%`);

        if (!canceled) {
          const codes = new Set((rolePerms || []).map((rp: any) => rp.permission_code));
          setAccess({
            can_view: codes.has(`${moduleCode}.view`),
            can_create: codes.has(`${moduleCode}.create`),
            can_edit: codes.has(`${moduleCode}.edit`),
            can_delete: codes.has(`${moduleCode}.delete`),
            can_export: codes.has(`${moduleCode}.export`),
          });
        }
      } catch (error) {
        console.error('Error fetching role access:', error);
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    fetchAccess();

    return () => { canceled = true; };
  }, [supabase, moduleCode]);

  return { access, loading };
}
