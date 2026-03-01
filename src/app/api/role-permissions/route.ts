import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');

    let query = supabase
      .from('role_permissions')
      .select('*, permissions(*)');

    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.warn('Error fetching role_permissions, returning empty:', error.message);
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await request.json();

    // Support bulk replacement: { role: string, permission_codes: string[] }
    if (body.role && Array.isArray(body.permission_codes)) {
      const { role, permission_codes } = body;

      // Delete existing permissions for this role
      const { error: deleteError } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role', role);

      if (deleteError) throw deleteError;

      // Insert new permissions
      if (permission_codes.length > 0) {
        const rows = permission_codes.map((code: string) => ({
          role,
          permission_code: code
        }));

        const { error: insertError } = await supabase
          .from('role_permissions')
          .insert(rows);

        if (insertError) throw insertError;
      }

      // Enviar notificación a todos los usuarios con este rol
      try {
        const { data: usersWithRole } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('role', role);

        if (usersWithRole && usersWithRole.length > 0) {
          const notifications = usersWithRole.map((u: any) => ({
            user_id: u.id,
            title: 'Permisos actualizados',
            message: `Los permisos del rol "${role}" han sido modificados por un administrador.`,
            type: 'role_change',
            is_read: false,
          }));

          await supabase.from('notifications').insert(notifications);
        }
      } catch (notifErr) {
        console.warn('Error enviando notificaciones de cambio de rol:', notifErr);
      }

      return NextResponse.json({ success: true });
    }

    // Support single insert: { role: string, permission_code: string }
    const { role, permission_code } = body;
    const { error } = await supabase
      .from('role_permissions')
      .insert({ role, permission_code });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.warn('Error saving role_permissions:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { role, permission_code } = await request.json();

    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role', role)
      .eq('permission_code', permission_code);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
