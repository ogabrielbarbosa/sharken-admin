'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

async function decide(id: string, kind: 'approveAuthorization' | 'denyAuthorization'): Promise<never> {
  if (typeof id !== 'string' || !id.trim()) redirect('/oauth/consent?erro=invalido');
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.oauth[kind](id);
  // Só segue para a URL que o próprio Supabase devolveu.
  if (error || !data?.redirect_url) redirect(`/oauth/consent?${new URLSearchParams({ authorization_id: id, erro: 'falhou' })}`);
  redirect(data.redirect_url);
}

export async function approve(id: string) {
  return decide(id, 'approveAuthorization');
}

export async function deny(id: string) {
  return decide(id, 'denyAuthorization');
}
