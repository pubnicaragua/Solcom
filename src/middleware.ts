import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  canAccessPath,
  getDefaultModuleAccess,
  getFallbackPath,
  mapOverrides,
  mergeModuleOverrides,
  restrictAdminOnlyModules,
} from '@/lib/auth/module-permissions';
import type { AppRole } from '@/lib/auth/warehouse-permissions';
import { isClientPortalUser } from '@/lib/auth/client-portal';

function normalizeRole(value: unknown): AppRole {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'admin' || role === 'manager' || role === 'operator' || role === 'auditor') {
    return role;
  }
  return 'operator';
}

const AUTH_REQUEST_TIMEOUT_MS = 3500;
const MODULE_ACCESS_TIMEOUT_MS = 1800;

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
type AuthCookieMutation = { value: string; options: CookieOptions };

function redirectPreservingAuthCookies(
  destination: URL,
  mutations: Map<string, AuthCookieMutation>,
) {
  const redirectResponse = NextResponse.redirect(destination);
  for (const [name, mutation] of mutations) {
    redirectResponse.cookies.set({ name, value: mutation.value, ...mutation.options });
  }
  return redirectResponse;
}

async function getModuleAccessForUser(
  supabase: SupabaseServerClient,
  userId: string,
  signal: AbortSignal,
) {
  const [{ data: profile }, { data: overrideRows, error: overrideError }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .abortSignal(signal)
      .maybeSingle(),
    supabase
      .from('user_module_permissions')
      .select('module, can_access')
      .eq('user_id', userId)
      .abortSignal(signal),
  ]);

  const role = normalizeRole(profile?.role);
  const baseAccess = getDefaultModuleAccess(role);
  const moduleAccess = !overrideError
    ? mergeModuleOverrides(baseAccess, mapOverrides(overrideRows || []))
    : baseAccess;
  return restrictAdminOnlyModules(moduleAccess, role);
}

async function getModuleAccessWithDeadline(
  supabase: SupabaseServerClient,
  userId: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODULE_ACCESS_TIMEOUT_MS);

  try {
    return await getModuleAccessForUser(supabase, userId, controller.signal);
  } catch (_error) {
    // Middleware must not hold the whole page hostage when Supabase's
    // permission tables are slow. APIs still enforce authorization server-side.
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

  // Supabase may rotate the access/refresh token while getUser() runs. Keep
  // those Set-Cookie mutations when a protected/public route is redirected;
  // otherwise the browser receives the redirect but loses the renewed session.
  const authCookieMutations = new Map<string, AuthCookieMutation>();

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
          authCookieMutations.set(name, { value, options });
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
          authCookieMutations.set(name, { value: '', options });
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
    if (isClientRoute) {
      return redirectPreservingAuthCookies(new URL('/login-clientes', request.url), authCookieMutations);
    }
    return redirectPreservingAuthCookies(new URL('/login', request.url), authCookieMutations);
  }

  if (user && isClientPortalUser(user.id)) {
    if (isClientRoute) return response;
    return redirectPreservingAuthCookies(new URL('/cliente/dashboard', request.url), authCookieMutations);
  }

  if (path === '/' && user) {
    // Keep the root redirect auth-only. Resolving the full module matrix here
    // added two database round trips before the user could see the ERP.
    return redirectPreservingAuthCookies(new URL('/inventory', request.url), authCookieMutations);
  }

  if (path === '/' && !user) {
    return redirectPreservingAuthCookies(new URL('/login', request.url), authCookieMutations);
  }

  if (!user && !isPublicRoute && !isClientRoute) {
    return redirectPreservingAuthCookies(new URL('/login', request.url), authCookieMutations);
  }

  if (user && isPublicRoute && !path.startsWith('/login-clientes') && !isScannerRoute) {
    return redirectPreservingAuthCookies(new URL('/inventory', request.url), authCookieMutations);
  }

  // Permitir acceso a rutas de cliente si está autenticado
  if (isClientRoute && !user) {
    return redirectPreservingAuthCookies(new URL('/login-clientes', request.url), authCookieMutations);
  }

  // Si es ruta de cliente y está autenticado, permitir acceso sin verificar rol
  if (isClientRoute && user) {
    return response;
  }

  // Keep role/module enforcement in the middleware, but resolve the profile
  // and per-user overrides in parallel to avoid adding another round-trip.
  if (user) {
    try {
      const moduleAccess = await getModuleAccessWithDeadline(supabase, user.id);
      if (!moduleAccess) return response;

      const hasAccess = canAccessPath(path, moduleAccess);
      if (!hasAccess && !isPublicRoute && !isClientRoute) {
        return redirectPreservingAuthCookies(
          new URL(getFallbackPath(moduleAccess), request.url),
          authCookieMutations,
        );
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
