'use server';

import { acceptInvites, createAdminClient, findUserByEmail, normalizeEmail, pendingInvites } from '@lps/db';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { safeNext } from './safe-next';

const configured = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function signIn(formData: FormData) {
  if (!configured()) redirect('/login?erro=config');
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(String(formData.get('email') ?? '')),
    password: String(formData.get('password') ?? ''),
  });
  if (error || !data.user) redirect('/login?erro=credenciais');
  // Convidado para outro workspace depois de já ter conta: entra nele agora.
  await acceptInvites(createAdminClient(), { id: data.user.id, email: data.user.email ?? '' });
  redirect(safeNext(formData.get('next')));
}

/**
 * Primeiro acesso: só cria conta quem tem convite pendente para o e-mail. A conta nasce confirmada
 * (o convite já prova que o e-mail é esperado) e entra direto nos workspaces do convite.
 */
export async function signUp(formData: FormData) {
  if (!configured()) redirect('/cadastro?erro=config');
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  // Mesmo retorno do login (ex.: consentimento OAuth), só se for um destino interno válido.
  const dest = safeNext(formData.get('next'));
  const keep: Record<string, string> = formData.get('next') === dest ? { next: dest } : {};
  const back = (erro: string): never => redirect(`/cadastro?${new URLSearchParams({ erro, email, ...keep })}`);
  if (!/^\S+@\S+\.\S+$/.test(email)) back('email');
  if (password.length < 8) back('senha-curta');
  if (password !== confirm) back('senha-diferente');

  const db = createAdminClient();
  if (await findUserByEmail(db, email)) back('ja-existe');
  if (!(await pendingInvites(db, { email })).length) back('sem-convite');

  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) back('falhou');
  await acceptInvites(db, { id: data.user!.id, email });

  const supabase = await createServerClient();
  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
  if (loginError) redirect(keep.next ? `/login?${new URLSearchParams(keep)}` : '/login');
  redirect(dest);
}

export async function signOut() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
