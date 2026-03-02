import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  canAccessPath,
  getDefaultModuleAccess,
  getFallbackPath,
  mapOverrides,
  mergeModuleOverrides,
} from '@/lib/auth/module-permissions';
import type { AppRole } from '@/lib/auth/warehouse-permissions';

function normalizeRole(value: unknown): AppRole {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'admin' || role === 'manager' || role === 'operator' || role === 'auditor') {
    return role;
  }
  return 'operator';
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicRoutes = ['/login', '/signup', '/reset-password', '/login-clientes'];
  const clientRoutes = ['/cliente'];
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route));
  const isClientRoute = clientRoutes.some(route => request.nextUrl.pathname.startsWith(route));

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Fast path for anonymous users: avoid calling Supabase Auth on every public request.
  // This keeps /login responsive when Supabase auth is under heavy load.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));

  if (!hasAuthCookie) {
    if (path === '/') {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (isClientRoute) {
      return NextResponse.redirect(new URL('/login-clientes', request.url));
    }

    if (!isPublicRoute && !isClientRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );


  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // If auth is temporarily down, keep public routes reachable and fail closed on protected ones.
  if (userError && !user) {
    if (isPublicRoute) return response;
    if (isClientRoute) return NextResponse.redirect(new URL('/login-clientes', request.url));
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (path === '/' && user) {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const role = normalizeRole(profile?.role);
      const baseAccess = getDefaultModuleAccess(role);
      let moduleAccess = baseAccess;

      const { data: overrideRows, error: overrideError } = await supabase
        .from('user_module_permissions')
        .select('module, can_access')
        .eq('user_id', user.id);
      if (!overrideError) {
        moduleAccess = mergeModuleOverrides(baseAccess, mapOverrides(overrideRows || []));
      }

      return NextResponse.redirect(new URL(getFallbackPath(moduleAccess), request.url));
    } catch (_error) {
      return NextResponse.redirect(new URL('/inventory', request.url));
    }
  }

  if (path === '/' && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!user && !isPublicRoute && !isClientRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && isPublicRoute && !path.startsWith('/login-clientes')) {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const role = normalizeRole(profile?.role);
      const baseAccess = getDefaultModuleAccess(role);
      let moduleAccess = baseAccess;

      const { data: overrideRows, error: overrideError } = await supabase
        .from('user_module_permissions')
        .select('module, can_access')
        .eq('user_id', user.id);
      if (!overrideError) {
        moduleAccess = mergeModuleOverrides(baseAccess, mapOverrides(overrideRows || []));
      }

      return NextResponse.redirect(new URL(getFallbackPath(moduleAccess), request.url));
    } catch (_error) {
      return NextResponse.redirect(new URL('/inventory', request.url));
    }
  }

  // Permitir acceso a rutas de cliente si está autenticado
  if (isClientRoute && !user) {
    return NextResponse.redirect(new URL('/login-clientes', request.url));
  }

  // Si es ruta de cliente y está autenticado, permitir acceso sin verificar rol
  if (isClientRoute && user) {
    return response;
  }

  // Permitir acceso directo al usuario cliente específico
  const CLIENT_USER_ID = '8abe3739-ba0d-4b5b-9e67-a1d9b5e6c588';
  if (user && user.id === CLIENT_USER_ID) {
    // Usuario cliente tiene acceso completo a /cliente
    if (isClientRoute) {
      return response;
    }
  }

  // Verificar permisos por rol si el usuario está autenticado
  if (user) {
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      // Si el usuario no tiene perfil (como el cliente), permitir acceso solo a rutas de cliente
      if (error) {
        if (isClientRoute) {
          return response;
        }
        return NextResponse.redirect(new URL('/login-clientes', request.url));
      }

      const userRole = normalizeRole(profile?.role || 'operator');
      const path = request.nextUrl.pathname;

      const baseAccess = getDefaultModuleAccess(userRole);
      let moduleAccess = baseAccess;

      const { data: overrideRows, error: overrideError } = await supabase
        .from('user_module_permissions')
        .select('module, can_access')
        .eq('user_id', user.id);

      if (!overrideError) {
        moduleAccess = mergeModuleOverrides(baseAccess, mapOverrides(overrideRows || []));
      }

      const hasAccess = canAccessPath(path, moduleAccess);
      if (!hasAccess && !isPublicRoute && !isClientRoute) {
        return NextResponse.redirect(new URL(getFallbackPath(moduleAccess), request.url));
      }
    } catch (error) {
      return response;
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|site.webmanifest|.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)',
  ],
};
