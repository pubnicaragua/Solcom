import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export type UserRole = 'admin' | 'manager' | 'operator' | 'auditor';

export function useUserRole() {
  const [role, setRole] = useState<UserRole>('operator');
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
          }
          return;
        }

        const { data: profile } = await (supabase as any)
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (!canceled) {
          setRole((profile?.role as UserRole) || 'operator');
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

  return { role, loading };
}

export function hasPermission(role: UserRole, module: string): boolean {
  const permissions: Record<UserRole, string[]> = {
    admin: ['inventory', 'ventas', 'reports', 'ai-agents', 'roles', 'settings', 'entregables', 'next-steps', 'transfers', 'fase2'],
    manager: ['inventory', 'ventas', 'reports', 'ai-agents', 'transfers'],
    operator: ['inventory', 'ventas'],
    auditor: ['reports'],
  };

  return permissions[role]?.includes(module) || false;
}
