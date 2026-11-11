import { createBrowserClient } from '@supabase/ssr';

/** Cliente do navegador, com a sessão do Gabriel. Serve ao Realtime (as políticas liberam `authenticated`). */
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
