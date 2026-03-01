import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
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
    const { data: modules, error } = await supabase
      .from('modules')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json(modules);
  } catch (error: any) {
    console.warn('Tabla modules no encontrada, usando datos mock:', error.message);
    return NextResponse.json([
      { id: 'mock-m1', code: 'inventory', name: 'Inventario' },
      { id: 'mock-m2', code: 'ventas', name: 'Ventas' },
      { id: 'mock-m3', code: 'reports', name: 'Reportes' },
      { id: 'mock-m4', code: 'users', name: 'Usuarios y Roles' },
      { id: 'mock-m5', code: 'settings', name: 'Configuración' },
      { id: 'mock-m6', code: 'transfers', name: 'Transferencias' }
    ]);
  }
}