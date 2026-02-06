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

  const publicRoutes = ['/login', '/signup', '/reset-password', '/reuniones'];
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route));

  if (path === '/' && user) {
    return NextResponse.redirect(new URL('/inventory', request.url));
  }

  if (path === '/' && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && isPublicRoute && !path.startsWith('/reuniones')) {
    return NextResponse.redirect(new URL('/inventory', request.url));
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
        admin: ['/inventory', '/reports', '/ai-agents', '/roles', '/settings', '/how-it-works', '/next-steps', '/entregables'],
        manager: ['/inventory', '/reports', '/ai-agents', '/how-it-works', '/entregables'],
        operator: ['/inventory', '/reports', '/how-it-works'],
        auditor: ['/reports', '/how-it-works'],
      };

      const allowedPaths = rolePermissions[userRole] || rolePermissions.operator;
      const hasAccess = allowedPaths.some(allowedPath => path.startsWith(allowedPath));

      if (!hasAccess && !isPublicRoute) {
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
