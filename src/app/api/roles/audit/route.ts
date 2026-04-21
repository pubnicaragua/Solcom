import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Check permissions
    const adminCheck = await requireAdminProfile(supabase);
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }
    const moduleAccess = await getEffectiveModuleAccess(supabase, adminCheck.userId, adminCheck.role);
    if (!hasModuleAccess(moduleAccess, 'roles')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get('role'); // can be role name or id

    let query = supabase
      .from('role_audit_logs')
      .select('*, actor:user_profiles!actor_id(id, full_name, email)')
      .order('created_at', { ascending: false });

    if (roleId) {
      query = query.eq('role_identifier', roleId);
    }

    const { data, error } = await query;

    if (error) {
       // if relation does not exist, means they didn't run the SQL
       if (error.code === '42P01') {
           return NextResponse.json({ error: 'Falta ejecutar la migración SQL de role_audit_logs en Supabase' }, { status: 500 });
       }
       throw error;
    }

    // Flatten actor for frontend
    const logs = (data || []).map(log => ({
       ...log,
       actor_name: log.actor?.full_name || log.actor?.email || 'Desconocido',
       actor: undefined
    }));

    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
