import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
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
