import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Db = SupabaseClient;

/** Cliente com service role. Só para servidor e worker: ignora o RLS. */
export function createAdminClient(): Db {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false } });
}
