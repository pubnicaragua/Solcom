import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const noStoreFetch: typeof fetch = (input, init) => {
    const nextInit = { ...(init || {}) } as RequestInit;
    nextInit.cache = 'no-store';
    return fetch(input, nextInit);
  };

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
    global: {
      fetch: noStoreFetch,
    },
  });
}
