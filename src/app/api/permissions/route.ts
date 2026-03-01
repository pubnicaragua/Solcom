import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAuthenticatedProfile } from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

function isMissingTable(error: any): boolean {
  return String(error?.code || '') === '42P01';
}

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const auth = await getAuthenticatedProfile(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const moduleAccess = await getEffectiveModuleAccess(supabase, auth.userId, auth.role);
    if (!hasModuleAccess(moduleAccess, 'roles')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    const { data: permissions, error } = await supabase
      .from('permissions')
      .select('*')
      .order('module', { ascending: true });

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: 'Falta migración de permisos. Ejecuta permissions-schema.sql' },
          { status: 500 }
        );
      }
      throw error;
    }

    return NextResponse.json(permissions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
