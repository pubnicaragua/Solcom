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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}