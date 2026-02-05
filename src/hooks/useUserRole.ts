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
        console.log('[useUserRole] Iniciando fetch de rol...');
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        console.log('[useUserRole] Usuario obtenido:', {
          id: user?.id,
          email: user?.email,
          error: userError
        });
        
        if (!user) {
          console.log('[useUserRole] No hay usuario autenticado');
          setLoading(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        console.log('[useUserRole] Perfil obtenido desde Supabase:', {
          profile,
          role: profile?.role,
          error: profileError
        });

        if (profile?.role) {
          console.log('[useUserRole] Rol asignado:', profile.role);
          setRole(profile.role as UserRole);
        } else {
          console.log('[useUserRole] No se encontró rol, usando default: operator');
        }
      } catch (error) {
        console.error('[useUserRole] Error fetching user role:', error);
      } finally {
        setLoading(false);
        console.log('[useUserRole] Fetch completado');
      }
    }

    fetchRole();
  }, [supabase]);

  return { role, loading };
}

export function hasPermission(role: UserRole, module: string): boolean {
  const permissions: Record<UserRole, string[]> = {
    admin: ['inventory', 'reports', 'ai-agents', 'roles', 'settings', 'entregables', 'next-steps'],
    manager: ['inventory', 'reports', 'ai-agents', 'entregables'],
    operator: ['inventory', 'reports'],
    auditor: ['reports'],
  };

  return permissions[role]?.includes(module) || false;
}
