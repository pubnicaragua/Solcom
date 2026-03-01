import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export type UserRole = string;

export function useUserRole() {
  const [role, setRole] = useState<UserRole>('operator');
  const [allowedModules, setAllowedModules] = useState<Set<string>>(new Set());
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
    let isFirstLoad = true;

    async function fetchRoleAndPermissions() {
      // Solo mostrar loading en la carga inicial, no en re-fetches (ej. cambio de pestaña)
      if (!canceled && isFirstLoad) setLoading(true);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!user) {
          if (!canceled) {
            setRole('operator');
            setAllowedModules(new Set());
          }
          return;
        }

        const { data: profile } = await (supabase as any)
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        const userRole = profile?.role || 'operator';

        if (!canceled) {
          setRole(userRole);
        }

        // Fetch permitted modules from role_permissions + permissions tables
        const { data: rolePerms } = await (supabase as any)
          .from('role_permissions')
          .select('permission_code, permissions(module)')
          .eq('role', userRole);

        if (!canceled) {
          const modules = new Set<string>();
          if (rolePerms && Array.isArray(rolePerms)) {
            rolePerms.forEach((rp: any) => {
              const mod = rp.permissions?.module;
              if (mod) modules.add(mod);
            });
          }
          setAllowedModules(modules);
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError' && process.env.NODE_ENV !== 'production') {
          console.warn('useUserRole error:', error?.message || error);
        }
      } finally {
        if (!canceled) setLoading(false);
        isFirstLoad = false;
      }
    }

    fetchRoleAndPermissions();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (canceled) return;
      if (!session?.user) {
        setRole('operator');
        setAllowedModules(new Set());
        setLoading(false);
        return;
      }
      void fetchRoleAndPermissions();
    });

    return () => {
      canceled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return { role, loading, allowedModules };
}

export function hasPermission(role: UserRole, module: string, allowedModules?: Set<string>): boolean {
  // Módulos públicos siempre accesibles para cualquier rol autenticado
  const publicModules = ['public', 'reuniones', 'how-it-works'];
  if (publicModules.includes(module)) return true;

  // admin siempre tiene acceso a todo
  if (role === 'admin') return true;

  // Si tenemos módulos desde la BD, usarlos
  if (allowedModules && allowedModules.size > 0) {
    return allowedModules.has(module);
  }

  // Fallback hardcodeado solo si la BD no responde (no debería pasar en producción)
  const fallback: Record<string, string[]> = {
    admin: ['inventory', 'ventas', 'reports', 'ai-agents', 'roles', 'settings', 'entregables', 'next-steps', 'transfers', 'fase2'],
    manager: ['inventory', 'ventas', 'reports', 'transfers'],
    operator: ['inventory', 'ventas', 'reports'],
    auditor: ['reports'],
  };

  return fallback[role]?.includes(module) || false;
}
