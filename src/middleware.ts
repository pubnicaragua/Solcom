import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  console.log(`🟡 [Middleware] Procesando: ${path}`);

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

  // Debug: Ver todas las cookies
  const allCookies = request.cookies.getAll();
  console.log(`🟡 [Middleware] Cookies totales: ${allCookies.length}`);
  const supabaseCookies = allCookies.filter(c => c.name.includes('sb-'));
  console.log(`🟡 [Middleware] Cookies de Supabase: ${supabaseCookies.length}`, supabaseCookies.map(c => c.name));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log(`🟡 [Middleware] Usuario: ${user ? user.email : 'No autenticado'}`);

  // Rutas públicas que no requieren autenticación
  const publicRoutes = ['/login', '/signup', '/reset-password'];
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route));

  console.log(`🟡 [Middleware] Es ruta pública: ${isPublicRoute}`);

  // Si no hay usuario y no es ruta pública, redirigir a login
  if (!user && !isPublicRoute) {
    console.log(`🔴 [Middleware] Sin usuario en ruta protegida → Redirigiendo a /login`);
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Si hay usuario y está en login, redirigir al dashboard
  if (user && isPublicRoute) {
    console.log(`🟢 [Middleware] Usuario autenticado en ruta pública → Redirigiendo a /inventory`);
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
        console.error('⚠️ Error al obtener perfil de usuario:', error);
        // Si hay error, permitir acceso temporal y loggear
        console.log('🔄 Permitiendo acceso temporal para:', user.email);
        return response;
      }

      const userRole = profile?.role || 'operator';
      const path = request.nextUrl.pathname;

      // Definir permisos por rol
      const rolePermissions: Record<string, string[]> = {
        admin: ['/inventory', '/reports', '/ai-agents', '/roles', '/settings', '/how-it-works'],
        manager: ['/inventory', '/reports', '/ai-agents', '/how-it-works'],
        operator: ['/inventory', '/reports', '/how-it-works'],
        auditor: ['/reports', '/how-it-works'],
      };

      const allowedPaths = rolePermissions[userRole] || rolePermissions.operator;
      const hasAccess = allowedPaths.some(allowedPath => path.startsWith(allowedPath));

      if (!hasAccess && !isPublicRoute) {
        console.log(`🚫 Acceso denegado para ${user.email} (${userRole}) a ${path}`);
        return NextResponse.redirect(new URL('/inventory', request.url));
      }

      console.log(`✅ [Middleware] Acceso permitido para ${user.email} (${userRole}) a ${path}`);
    } catch (error) {
      console.error('❌ [Middleware] Error:', error);
      // En caso de error, permitir acceso para no bloquear la app
      return response;
    }
  }

  console.log(`🟢 [Middleware] Permitiendo acceso a ${path}`);
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|site.webmanifest|.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)',
  ],
};
