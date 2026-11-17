'use server';

import { createAdminClient, slugify } from '@lps/db';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, WORKSPACE_COOKIE } from '@/lib/auth';

const HERE = '/painel/configuracoes';
type Tab = 'workspace' | 'membros' | 'workspaces';
const back = (aba: Tab, msg: { erro?: string; ok?: string }): never =>
  redirect(`${HERE}?${new URLSearchParams({ aba, ...(msg.erro ? { erro: msg.erro } : {}), ...(msg.ok ? { ok: msg.ok } : {}) })}`);

async function setWorkspaceCookie(id: string) {
  (await cookies()).set(WORKSPACE_COOKIE, id, { path: '/', maxAge: 31536000, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
}

/** Dono do workspace em uso, ou administrador da plataforma. */
async function requireOwner(aba: Tab) {
  const session = await getSession();
  if (!session.isAdmin && session.workspace.role !== 'owner') back(aba, { erro: 'Só o dono do workspace pode fazer isso.' });
  return session;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session.isAdmin) redirect(HERE);
  return session;
}

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export async function saveWorkspaceAction(formData: FormData) {
  const { workspace } = await requireOwner('workspace');
  const name = text(formData, 'name');
  if (!name) back('workspace', { erro: 'Dê um nome ao workspace.' });
  const limitRaw = text(formData, 'daily_first_contact_limit');
  const limit = limitRaw ? Number(limitRaw) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) back('workspace', { erro: 'O limite diário precisa ser um número inteiro maior que zero.' });
  const { error } = await createAdminClient().from('workspaces').update({
    name,
    commercial_name: text(formData, 'commercial_name') || null,
    signature_name: text(formData, 'signature_name') || null,
    daily_first_contact_limit: limit,
  }).eq('id', workspace.id);
  if (error) back('workspace', { erro: error.message });
  revalidatePath('/painel', 'layout');
  back('workspace', { ok: 'Configurações salvas.' });
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

/** Acha a conta pelo e-mail ou cria com a senha dada, e põe no workspace. */
async function addMember(workspaceId: string, email: string, password: string, role: 'owner' | 'member', aba: Tab) {
  if (!/^\S+@\S+\.\S+$/.test(email)) back(aba, { erro: 'E-mail inválido.' });
  const db = createAdminClient();
  let user = await findUserByEmail(email);
  let created = false;
  if (!user) {
    if (password.length < 8) back(aba, { erro: 'Conta nova: defina uma senha com pelo menos 8 caracteres.' });
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) back(aba, { erro: `Não foi possível criar a conta: ${error?.message}` });
    user = data.user!;
    created = true;
  }
  const { error } = await db.from('workspace_members').upsert({ workspace_id: workspaceId, user_id: user!.id, role }, { onConflict: 'workspace_id,user_id' });
  if (error) back(aba, { erro: error.message });
  return created;
}

export async function addMemberAction(formData: FormData) {
  const { workspace } = await requireOwner('membros');
  const email = text(formData, 'email').toLowerCase();
  const created = await addMember(workspace.id, email, String(formData.get('password') ?? ''), formData.get('role') === 'member' ? 'member' : 'owner', 'membros');
  revalidatePath(HERE);
  back('membros', { ok: created ? `Conta criada para ${email}. Mande o e-mail e a senha para a pessoa entrar.` : `${email} adicionado.` });
}

export async function removeMemberAction(formData: FormData) {
  const { workspace, user } = await requireOwner('membros');
  const userId = text(formData, 'user_id');
  if (userId === user.id) back('membros', { erro: 'Você não pode se remover.' });
  const { error } = await createAdminClient().from('workspace_members').delete().eq('workspace_id', workspace.id).eq('user_id', userId);
  if (error) back('membros', { erro: error.message });
  revalidatePath(HERE);
  back('membros', { ok: 'Membro removido.' });
}

/** Admin: troca o workspace em uso. */
export async function switchWorkspaceAction(id: string) {
  const { workspaces } = await requireAdmin();
  if (!workspaces.some((w) => w.id === id)) return;
  await setWorkspaceCookie(id);
  revalidatePath('/painel', 'layout');
  redirect('/painel');
}

/** Admin: cria o workspace de uma operação nova e, se informado, já cria a conta do dono. */
export async function createWorkspaceAction(formData: FormData) {
  await requireAdmin();
  const name = text(formData, 'name');
  if (!name) back('workspaces', { erro: 'Dê um nome ao workspace.' });
  const db = createAdminClient();
  const base = slugify(name);
  const { data: same } = await db.from('workspaces').select('slug').like('slug', `${base}%`);
  const slug = same?.some((s) => s.slug === base) ? `${base}-${(same?.length ?? 0) + 1}` : base;
  const { data, error } = await db.from('workspaces').insert({
    name,
    slug,
    signature_name: text(formData, 'signature_name') || null,
    commercial_name: text(formData, 'commercial_name') || null,
  }).select('id').single();
  if (error || !data) back('workspaces', { erro: `Não foi possível criar: ${error?.message}` });
  const email = text(formData, 'email').toLowerCase();
  let created = false;
  if (email) created = await addMember(data!.id, email, String(formData.get('password') ?? ''), 'owner', 'workspaces');
  revalidatePath('/painel', 'layout');
  back('workspaces', {
    ok: email
      ? `Workspace ${name} criado com ${email} como dono.${created ? ' Mande o e-mail e a senha para a pessoa entrar.' : ''}`
      : `Workspace ${name} criado. Entre nele para configurar.`,
  });
}
