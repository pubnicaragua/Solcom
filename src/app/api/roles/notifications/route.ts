import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roleName = searchParams.get('role');

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
    let query = supabase.from('role_notification_prefs').select('*');

    if (roleName) {
      query = query.eq('role_name', roleName);
    }

    const { data: preferences, error } = await query;

    if (error) throw error;

    return NextResponse.json(preferences);
  } catch (error: any) {
    console.warn('Tabla role_notification_prefs no encontrada, usando mock:', error.message);
    return NextResponse.json([]);
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
    const preferences = await request.json();

    const { data, error } = await supabase
      .from('role_notification_prefs')
      .upsert(preferences, { onConflict: 'role_name,notification_type_code' })
      .select();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.warn('Tabla role_notification_prefs no encontrada, usando mock:', error.message);
    return NextResponse.json([]);
  }
}