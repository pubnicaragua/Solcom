import { NextResponse } from 'next/server';


export const dynamic = 'force-dynamic';import { createServerClient, type CookieOptions } from '@supabase/ssr';
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
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json(roles);
  } catch (error: any) {
    // FALLBACK para cuando la tabla 'roles' aún no se ha creado en Supabase
    console.warn('Tabla roles no encontrada, usando datos mock:', error.message);
    return NextResponse.json([
      { id: 'mock-1', name: 'admin', description: 'Administrador', is_custom: false },
      { id: 'mock-2', name: 'manager', description: 'Gerente de Bodega', is_custom: false },
      { id: 'mock-3', name: 'operator', description: 'Vendedor', is_custom: false },
      { id: 'mock-4', name: 'auditor', description: 'Auditor', is_custom: false }
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
        { name, description, is_custom }
      ])
      .select()
      .single();

    if (error) throw error;

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

    // Verificar si el rol tiene usuarios asignados
    const { data: usersWithRole } = await supabase
      .from('users')
      .select('id')
      .eq('role', roleId)
      .limit(1);

    if (usersWithRole && usersWithRole.length > 0) {
      return NextResponse.json({ error: 'No se puede eliminar un rol con usuarios asignados' }, { status: 400 });
    }

    // Eliminar permisos del rol primero
    const { error: permsError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role', roleId);

    if (permsError) throw permsError;

    // Eliminar el rol
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', roleId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}