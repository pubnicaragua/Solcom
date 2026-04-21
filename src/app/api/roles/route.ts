import { NextResponse } from 'next/server';


export const dynamic = 'force-dynamic'; import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  try {
    const { data: roles, error } = await supabase
      .from('roles')
      .select('*, creator:created_by(id, full_name)')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Aplanar el campo creator para la UI
    const rolesWithCreator = (roles || []).map((role: any) => ({
      ...role,
      created_by_name: role.creator?.full_name || null,
      creator: undefined,
    }));

    return NextResponse.json(rolesWithCreator);
  } catch (error: any) {
    // FALLBACK para cuando la tabla 'roles' aún no se ha creado en Supabase
    console.warn('Tabla roles no encontrada, usando datos mock:', error.message);
    return NextResponse.json([
      { id: 'mock-1', name: 'admin', description: 'Administrador', is_custom: false, created_by_name: null },
      { id: 'mock-2', name: 'manager', description: 'Gerente de Bodega', is_custom: false, created_by_name: null },
      { id: 'mock-3', name: 'operator', description: 'Vendedor', is_custom: false, created_by_name: null },
      { id: 'mock-4', name: 'auditor', description: 'Auditor', is_custom: false, created_by_name: null }
    ]);
  }
}

export async function POST(request: Request) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  try {
    const { name, description, is_custom } = await request.json();

    // Obtener el usuario autenticado
    const { data: { user } } = await supabase.auth.getUser();

    // Verificar si el rol ya existe
    const { data: existingRole } = await supabase
      .from('roles')
      .select('id')
      .eq('name', name)
      .single();

    if (existingRole) {
      return NextResponse.json({ error: `El rol "${name}" ya existe` }, { status: 409 });
    }

    const { data: role, error } = await supabase
      .from('roles')
      .insert([
        { name, description, is_custom, created_by: user?.id || null }
      ])
      .select()
      .single();

    if (error) throw error;

    if (user?.id) {
      await supabase.from('role_audit_logs').insert({
        role_identifier: name,
        actor_id: user.id,
        action: 'CREATED',
        details: `Rol creado: ${name}`,
        new_state: { name, description, is_custom }
      });
    }

    return NextResponse.json(role);
  } catch (error: any) {
    // Manejar específicamente error de constraint duplicada
    if (error.message?.includes('duplicate key') || error.message?.includes('roles_name_key')) {
      return NextResponse.json({ error: 'El nombre del rol ya existe. Por favor usa otro nombre.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get('id');

    if (!roleId) {
      return NextResponse.json({ error: 'ID del rol es requerido' }, { status: 400 });
    }

    // 1. Obtener la información del rol para tener su nombre (logical role)
    const { data: roleToDeleted, error: fetchError } = await supabase
      .from('roles')
      .select('name')
      .eq('id', roleId)
      .single();

    if (fetchError || !roleToDeleted) {
      // Si no se encuentra por UUID, tal vez se envió el nombre por error (retrocompatibilidad o error de cache)
      // Intentamos buscar por nombre si el ID no es un UUID válido o no se encontró
      const { data: roleByName } = await supabase
        .from('roles')
        .select('id, name')
        .eq('name', roleId)
        .single();
      
      if (!roleByName) {
        return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
      }
      
      // Si se encontró por nombre, actualizamos las variables
      return NextResponse.json({ error: 'ID de rol inválido (se recibió nombre en lugar de UUID). Por favor refresca la página.' }, { status: 400 });
    }

    const roleName = roleToDeleted.name;

    // 2. Verificar si el rol tiene usuarios asignados usando el NOMBRE del rol
    // ya que en user_profiles se guarda el nombre del rol como string
    const { data: usersWithRole } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('role', roleName)
      .limit(1);

    if (usersWithRole && usersWithRole.length > 0) {
      return NextResponse.json({ error: 'No se puede eliminar un rol con usuarios asignados' }, { status: 400 });
    }

    // 3. Eliminar permisos del rol primero usando el NOMBRE del rol
    // ya que en role_permissions la columna 'role' es el nombre
    const { error: permsError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role', roleName);

    if (permsError) throw permsError;

    // 4. Eliminar el rol definitivamente por su ID (UUID)
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', roleId);

    if (error) throw error;

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      await supabase.from('role_audit_logs').insert({
        role_identifier: roleName,
        actor_id: user.id,
        action: 'DELETED',
        details: `Rol eliminado: ${roleName}`,
        previous_state: { id: roleId, name: roleName }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}