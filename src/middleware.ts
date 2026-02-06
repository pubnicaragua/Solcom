import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

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
  } = await supabase.auth.getUser();

  const publicRoutes = ['/login', '/signup', '/reset-password', '/reuniones', '/login-clientes'];
  const clientRoutes = ['/cliente'];
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route));
  const isClientRoute = clientRoutes.some(route => request.nextUrl.pathname.startsWith(route));

  if (path === '/' && user) {
    return NextResponse.redirect(new URL('/inventory', request.url));
  }

  if (path === '/' && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!user && !isPublicRoute && !isClientRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && isPublicRoute && !path.startsWith('/reuniones') && !path.startsWith('/login-clientes')) {
    return NextResponse.redirect(new URL('/inventory', request.url));
  }

  // Permitir acceso a rutas de cliente si está autenticado
  if (isClientRoute && !user) {
    return NextResponse.redirect(new URL('/login-clientes', request.url));
  }

  // Si es ruta de cliente y está autenticado, permitir acceso sin verificar rol
  if (isClientRoute && user) {
    return response;
  }

  // Verificar permisos por rol si el usuario está autenticado
  if (user) {
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error) {
        return response;
      }

      const userRole = profile?.role || 'operator';
      const path = request.nextUrl.pathname;

      // Definir permisos por rol
      const rolePermissions: Record<string, string[]> = {
        admin: ['/inventory', '/reports', '/ai-agents', '/roles', '/settings', '/how-it-works', '/next-steps', '/entregables', '/cliente'],
        manager: ['/inventory', '/reports', '/ai-agents', '/how-it-works', '/entregables', '/cliente'],
        operator: ['/inventory', '/reports', '/how-it-works', '/cliente'],
        auditor: ['/reports', '/how-it-works', '/cliente'],
      };

      const allowedPaths = rolePermissions[userRole] || rolePermissions.operator;
      const hasAccess = allowedPaths.some(allowedPath => path.startsWith(allowedPath));

      // Permitir acceso a /entregables y /cliente para todos los usuarios autenticados
      if (!hasAccess && !isPublicRoute && !isClientRoute && !path.startsWith('/entregables')) {
        return NextResponse.redirect(new URL('/inventory', request.url));
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
