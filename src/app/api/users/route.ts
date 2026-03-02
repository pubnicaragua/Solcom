import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

export async function GET() {
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

    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(users);
  } catch (error: any) {
    console.warn('Tabla user_profiles con error o no encontrada, usando datos mock:', error.message);
    return NextResponse.json([
      { id: 'mock-u1', email: 'admin@soliscomercial.com', full_name: 'Admin Sistema', role: 'admin', created_at: new Date().toISOString() },
      { id: 'mock-u2', email: 'vendedor@soliscomercial.com', full_name: 'Vendedor Demo', role: 'operator', created_at: new Date().toISOString() }
    ]);
  }
}

export async function POST(request: Request) {
  try {
    console.log('[API] POST /api/users request received');
    console.log('[API] Service Role Key present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    const supabase = createRouteHandlerClient({ cookies });
    const adminCheck = await requireAdminProfile(supabase);
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }
    const moduleAccess = await getEffectiveModuleAccess(supabase, adminCheck.userId, adminCheck.role);
    if (!hasModuleAccess(moduleAccess, 'roles')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    // Admin operations REQUIRE a service role client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL or Key is missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    const { email, full_name, role, password } = await request.json();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || Math.random().toString(36).slice(-8),
      email_confirm: true,
      user_metadata: {
        full_name,
        role
      }
    });

    if (authError) throw authError;

    // Enviar notificación a todos los admins sobre el nuevo usuario
    try {
      const { data: admins } = await supabaseAdmin
        .from('user_profiles')
        .select('id')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        const notifications = admins.map((admin: any) => ({
          user_id: admin.id,
          title: 'Nuevo usuario creado',
          message: `Se ha creado el usuario ${full_name} (${email}) con rol ${role}.`,
          type: 'user_created',
          is_read: false,
        }));

        await supabaseAdmin.from('notifications').insert(notifications);
      }
    } catch (notifErr) {
      console.warn('Error enviando notificación de nuevo usuario:', notifErr);
    }

    return NextResponse.json({ success: true, user: authData.user });
  } catch (error: any) {
    console.error('API Error:', error);
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return NextResponse.json({
      error: error.message,
      debug: {
        timestamp: new Date().toISOString(),
        keyPresent: !!key,
        keyPrefix: key ? key.substring(0, 5) + '...' : 'MISSING',
        isAnon: key === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        env: process.env.NODE_ENV
      }
    }, { status: 500 });
  }
}
