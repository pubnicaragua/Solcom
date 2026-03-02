import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const adminCheck = await requireAdminProfile(supabase);
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }
    const moduleAccess = await getEffectiveModuleAccess(supabase, adminCheck.userId, adminCheck.role);
    if (!hasModuleAccess(moduleAccess, 'roles')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }
    const { role, full_name } = await request.json();

    const updates: any = {};
    if (role) updates.role = role;
    if (full_name) updates.full_name = full_name;

    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const adminCheck = await requireAdminProfile(supabase);
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }
    const moduleAccess = await getEffectiveModuleAccess(supabase, adminCheck.userId, adminCheck.role);
    if (!hasModuleAccess(moduleAccess, 'roles')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    const { error } = await supabase.auth.admin.deleteUser(params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
