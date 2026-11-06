import { createAdminClient } from '@lps/db';
import { redirect } from 'next/navigation';
import { createServerClient } from './supabase/server';

/** Confere a sessão antes de liberar o cliente com service role. */
export async function authedDb() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  return createAdminClient();
}
