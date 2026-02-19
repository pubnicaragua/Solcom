import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export type UserRole = 'admin' | 'manager' | 'operator' | 'auditor';

export function useUserRole() {
  const [role, setRole] = useState<UserRole>('operator');
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function fetchRole() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (!user) {
          setLoading(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role) {
          setRole(profile.role as UserRole);
        }
      } catch (error) {
        // Error silencioso en producción
      } finally {
        setLoading(false);
      }
    }

    fetchRole();
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
