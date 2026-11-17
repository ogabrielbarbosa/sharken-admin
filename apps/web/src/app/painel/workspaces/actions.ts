'use server';

import { createAdminClient, slugify } from '@lps/db';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, WORKSPACE_COOKIE } from '@/lib/auth';

const HERE = '/painel/workspaces';
const back = (erro?: string, ok?: string): never =>
  redirect(`${HERE}?${new URLSearchParams({ ...(erro ? { erro } : {}), ...(ok ? { ok } : {}) })}`);

async function setWorkspaceCookie(id: string) {
  (await cookies()).set(WORKSPACE_COOKIE, id, { path: '/', maxAge: 31536000, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
}

/** Troca o workspace em uso. Só aceita um de que o usuário é membro. */
export async function switchWorkspaceAction(id: string) {
  const { workspaces } = await getSession();
  if (!workspaces.some((w) => w.id === id)) return;
  await setWorkspaceCookie(id);
  revalidatePath('/painel', 'layout');
  redirect('/painel');
}

/** Dono do workspace (role owner). Só donos mexem em membros. */
async function requireOwner(workspaceId: string) {
  const session = await getSession();
  const ws = session.workspaces.find((w) => w.id === workspaceId);
  if (!ws || ws.role !== 'owner') back('Só o dono do workspace pode fazer isso.');
  return session;
}

/** Cria um workspace vazio; quem cria vira dono e passa a usá-lo. */
export async function createWorkspaceAction(formData: FormData) {
  const { user, workspaces } = await getSession();
  if (!workspaces.some((w) => w.role === 'owner')) back('Só quem é dono de algum workspace pode criar outro.');
  const name = String(formData.get('name') ?? '').trim();
  if (!name) back('Dê um nome ao workspace.');
  const db = createAdminClient();
  let slug = slugify(name);
  const { data: same } = await db.from('workspaces').select('slug').like('slug', `${slug}%`);
  if (same?.some((s) => s.slug === slug)) slug = `${slug}-${(same?.length ?? 0) + 1}`;
  const { data, error } = await db.from('workspaces').insert({ name, slug }).select('id').single();
  if (error || !data) back(`Não foi possível criar: ${error?.message}`);
  const { error: memberError } = await db.from('workspace_members').insert({ workspace_id: data!.id, user_id: user.id, role: 'owner' });
  if (memberError) back(`Não foi possível criar: ${memberError.message}`);
  await setWorkspaceCookie(data!.id);
  revalidatePath('/painel', 'layout');
  back(undefined, `Workspace ${name} criado. Você já está nele.`);
}

export async function renameWorkspaceAction(formData: FormData) {
  const workspaceId = String(formData.get('workspace_id') ?? '');
  await requireOwner(workspaceId);
  const name = String(formData.get('name') ?? '').trim();
  if (!name) back('Dê um nome ao workspace.');
  const { error } = await createAdminClient().from('workspaces').update({ name }).eq('id', workspaceId);
  if (error) back(error.message);
  revalidatePath('/painel', 'layout');
  back(undefined, 'Nome salvo.');
}

async function findUserByEmail(email: string) {
  const db = createAdminClient();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Adiciona alguém ao workspace pelo e-mail. Se a conta não existe, cria com a senha informada
 * (a pessoa entra com ela e pode trocar depois). Se já existe, a senha é ignorada.
 */
export async function addMemberAction(formData: FormData) {
  const workspaceId = String(formData.get('workspace_id') ?? '');
  await requireOwner(workspaceId);
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const role = formData.get('role') === 'member' ? 'member' : 'owner';
  if (!/^\S+@\S+\.\S+$/.test(email)) back('E-mail inválido.');

  const db = createAdminClient();
  let user = await findUserByEmail(email);
  let created = false;
  if (!user) {
    if (password.length < 8) back('Conta nova: defina uma senha com pelo menos 8 caracteres.');
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) back(`Não foi possível criar a conta: ${error?.message}`);
    user = data.user!;
    created = true;
  }
  const { error } = await db.from('workspace_members').upsert({ workspace_id: workspaceId, user_id: user!.id, role }, { onConflict: 'workspace_id,user_id' });
  if (error) back(error.message);
  revalidatePath(HERE);
  back(undefined, created ? `Conta criada para ${email}. Mande o e-mail e a senha para a pessoa entrar.` : `${email} adicionado.`);
}

export async function removeMemberAction(formData: FormData) {
  const workspaceId = String(formData.get('workspace_id') ?? '');
  const { user } = await requireOwner(workspaceId);
  const userId = String(formData.get('user_id') ?? '');
  if (userId === user.id) back('Você não pode se remover do próprio workspace.');
  const { error } = await createAdminClient().from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', userId);
  if (error) back(error.message);
  revalidatePath(HERE);
  back(undefined, 'Membro removido.');
}
