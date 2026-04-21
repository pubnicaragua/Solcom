import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
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
    const { role, full_name, email, password } = await request.json();

    // Actualizar user_profiles (incluye email para mantener sincronización)
    const updates: any = {};
    if (role) updates.role = role;
    if (full_name) updates.full_name = full_name;
    if (email) updates.email = email;

    // Obtener rol anterior e información para auditoría
    let previousRole = null;
    let userNameForAudit = params.id;
    if (role) {
      const { data: prevProfile } = await supabase.from('user_profiles').select('role, full_name, email').eq('id', params.id).single();
      if (prevProfile) {
        userNameForAudit = prevProfile.full_name || prevProfile.email || params.id;
        if (prevProfile.role !== role) {
          previousRole = prevProfile.role;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', params.id);

      if (error) throw error;

      if (role && previousRole !== null) {
        // Log de desvinculación del rol viejo
        if (previousRole) {
          await supabase.from('role_audit_logs').insert({
            role_identifier: previousRole,
            actor_id: adminCheck.userId,
            action: 'USER_UNLINKED',
            details: `Usuario ${updates.full_name || userNameForAudit} desvinculado del rol`,
            previous_state: { user_id: params.id, role: previousRole },
            new_state: { user_id: params.id, role: role }
          });
        }
        
        // Log de vinculación al rol nuevo
        await supabase.from('role_audit_logs').insert({
          role_identifier: role,
          actor_id: adminCheck.userId,
          action: 'USER_LINKED',
          details: `Usuario ${updates.full_name || userNameForAudit} vinculado al rol`,
          previous_state: { user_id: params.id, role: previousRole },
          new_state: { user_id: params.id, role: role }
        });
      }
    }

    // Actualizar auth.users: email, contraseña y/o user_metadata (requiere service role)
    if (email || password || full_name) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const authUpdates: any = {};
      if (email) authUpdates.email = email;
      if (password) authUpdates.password = password;
      if (full_name) authUpdates.user_metadata = { full_name };

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        params.id,
        authUpdates
      );

      if (authError) throw authError;
    }

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

    // Usar service role para eliminar usuario de auth
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabaseAdmin.auth.admin.deleteUser(params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
