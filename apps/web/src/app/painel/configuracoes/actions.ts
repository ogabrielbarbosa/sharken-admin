'use server';

import { createAdminClient, inviteToWorkspace, slugify } from '@lps/db';
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

async function invite(workspaceId: string, email: string, role: 'owner' | 'member', invitedBy: string, aba: Tab) {
  if (!/^\S+@\S+\.\S+$/.test(email)) back(aba, { erro: 'E-mail inválido.' });
  try {
    return await inviteToWorkspace(createAdminClient(), { workspaceId, email, role, invitedBy });
  } catch (err) {
    return back(aba, { erro: (err as Error).message });
  }
}

const invitedMessage = (email: string, result: 'adicionado' | 'convidado') =>
  result === 'adicionado'
    ? `${email} já tinha conta e entrou no workspace.`
    : `${email} adicionado. Peça para a pessoa abrir o painel, clicar em Criar conta e usar esse e-mail.`;

export async function addMemberAction(formData: FormData) {
  const { workspace, user } = await requireOwner('membros');
  const email = text(formData, 'email').toLowerCase();
  const result = await invite(workspace.id, email, formData.get('role') === 'member' ? 'member' : 'owner', user.id, 'membros');
  revalidatePath(HERE);
  back('membros', { ok: invitedMessage(email, result) });
}

export async function cancelInviteAction(formData: FormData) {
  const { workspace } = await requireOwner('membros');
  const { error } = await createAdminClient().from('workspace_invites').delete().eq('id', text(formData, 'invite_id')).eq('workspace_id', workspace.id);
  if (error) back('membros', { erro: error.message });
  revalidatePath(HERE);
  back('membros', { ok: 'Convite cancelado.' });
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

/** Admin: cria o workspace de uma operação nova e, se informado, já adiciona o dono pelo e-mail. */
export async function createWorkspaceAction(formData: FormData) {
  const { user } = await requireAdmin();
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
  const result = email ? await invite(data!.id, email, 'owner', user.id, 'workspaces') : null;
  revalidatePath('/painel', 'layout');
  back('workspaces', { ok: `Workspace ${name} criado.${email && result ? ` ${invitedMessage(email, result)}` : ' Entre nele para configurar.'}` });
}
