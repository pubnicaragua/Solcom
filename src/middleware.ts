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

const AUTH_REQUEST_TIMEOUT_MS = 3500;

const timedFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  const upstreamSignal = init?.signal;
  const abortFromUpstream = () => controller.abort();

  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener('abort', abortFromUpstream);
  }
};

type SupabaseServerClient = ReturnType<typeof createServerClient>;

async function getModuleAccessForUser(
  supabase: SupabaseServerClient,
  userId: string,
) {
  const [{ data: profile }, { data: overrideRows, error: overrideError }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('user_module_permissions')
      .select('module, can_access')
      .eq('user_id', userId),
  ]);

  const role = normalizeRole(profile?.role);
  const baseAccess = getDefaultModuleAccess(role);
  return !overrideError
    ? mergeModuleOverrides(baseAccess, mapOverrides(overrideRows || []))
    : baseAccess;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicRoutes = ['/login', '/signup', '/reset-password', '/login-clientes', '/alistamiento/escanear'];
  const clientRoutes = ['/cliente'];
  const isScannerRoute = path.startsWith('/alistamiento/escanear');
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
      global: {
        fetch: timedFetch,
      },
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


  let user: any = null;
  let userError: any = null;
  try {
    const {
      data: { user: authenticatedUser },
      error,
    } = await supabase.auth.getUser();
    user = authenticatedUser;
    userError = error;
  } catch (error) {
    userError = error;
  }

  // If auth is temporarily down, keep public routes reachable and fail closed on protected ones.
  if (userError && !user) {
    if (isPublicRoute) return response;
    if (isClientRoute) return NextResponse.redirect(new URL('/login-clientes', request.url));
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (path === '/' && user) {
    try {
      const moduleAccess = await getModuleAccessForUser(supabase, user.id);
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

  if (user && isPublicRoute && !path.startsWith('/login-clientes') && !isScannerRoute) {
    try {
      const moduleAccess = await getModuleAccessForUser(supabase, user.id);
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

  // Keep role/module enforcement in the middleware, but resolve the profile
  // and per-user overrides in parallel to avoid adding another round-trip.
  if (user) {
    try {
      const [{ data: profile, error }, { data: overrideRows, error: overrideError }] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single(),
        supabase
          .from('user_module_permissions')
          .select('module, can_access')
          .eq('user_id', user.id),
      ]);

      // Si el usuario no tiene perfil (como el cliente), permitir acceso solo a rutas de cliente
      if (error) {
        if (isClientRoute) {
          return response;
        }
        return NextResponse.redirect(new URL('/login-clientes', request.url));
      }

      const userRole = normalizeRole(profile?.role || 'operator');
      const baseAccess = getDefaultModuleAccess(userRole);
      const moduleAccess = !overrideError
        ? mergeModuleOverrides(baseAccess, mapOverrides(overrideRows || []))
        : baseAccess;

      const hasAccess = canAccessPath(path, moduleAccess);
      if (!hasAccess && !isPublicRoute && !isClientRoute) {
        return NextResponse.redirect(new URL(getFallbackPath(moduleAccess), request.url));
      }
    } catch (_error) {
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
