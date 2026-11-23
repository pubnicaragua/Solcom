import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

let browserClient: BrowserSupabaseClient | null = null;

function createConfiguredClient(): BrowserSupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase no está configurado: faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    // The SSR package expects this object when options are supplied. An empty
    // object keeps browser cookie access on its document.cookie fallback and
    // also makes server-side module evaluation safe during Next.js builds.
    cookies: {},
    cookieOptions: {
      // Keep the refresh token across browser restarts. Supabase still controls
      // the actual token lifetime and can invalidate it server-side.
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

export function getSupabaseClient(): BrowserSupabaseClient {
  if (!browserClient) browserClient = createConfiguredClient();
  return browserClient;
}

// Defer client creation until a Supabase method/property is accessed. This
// keeps imports safe for tests and build-time module evaluation without
// weakening the runtime configuration checks above.
export const supabase = new Proxy({} as BrowserSupabaseClient, {
  get(_target, property) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
