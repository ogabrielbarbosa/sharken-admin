'use server';

import { createAdminClient, createCatalogItem, deleteWorkspaceBilling, getWorkspaceBilling, inviteToWorkspace, saveWorkspaceBilling, scopeDb, slugify, updateCatalogItem } from '@lps/db';
import { abacateKeyMode, parseBRLToCents, CYCLES, type Cycle } from '@lps/domain';
import { abacatePay } from '@lps/integrations';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, WORKSPACE_COOKIE } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { abacateWebhookUrl } from '@/lib/billing';

const HERE = '/painel/configuracoes';
type Tab = 'workspace' | 'membros' | 'whatsapp' | 'pagamentos' | 'servicos' | 'mcp' | 'workspaces';
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

/**
 * Salva a chave da AbacatePay do workspace e registra o webhook dele (com segredo próprio) na conta da chave.
 * Criar o webhook também confere a chave: se a AbacatePay recusar, nada é salvo.
 */
export async function saveBillingAction(formData: FormData) {
  const { workspace } = await requireOwner('pagamentos');
  const apiKey = text(formData, 'api_key');
  const mode = abacateKeyMode(apiKey);
  if (!mode) back('pagamentos', { erro: 'Cole a chave de API da AbacatePay: começa com abc_prod_ (produção) ou abc_dev_ (Modo Teste).' });
  const db = createAdminClient();
  const previous = await getWorkspaceBilling(db, workspace.id);
  const secret = randomBytes(32).toString('hex');
  let webhookId: string;
  try {
    webhookId = (await abacatePay(apiKey).createWebhook(abacateWebhookUrl(workspace.id), secret)).id;
  } catch (err) {
    return back('pagamentos', { erro: `${(err as Error).message}. Confira se a chave tem a permissão WEBHOOK:CREATE.` });
  }
  // O webhook antigo fica sem uso: tenta apagar com a chave antiga (ela pode já ter sido revogada).
  if (previous?.webhook_id) await abacatePay(previous.api_key).deleteWebhook(previous.webhook_id).catch(() => undefined);
  await saveWorkspaceBilling(db, { workspace_id: workspace.id, api_key: apiKey, dev_mode: mode === 'teste', webhook_id: webhookId, webhook_secret: secret });
  revalidatePath(HERE);
  back('pagamentos', { ok: mode === 'teste' ? 'AbacatePay conectada no Modo Teste: os pagamentos são simulados.' : 'AbacatePay conectada. As próximas cobranças já saem por ela.' });
}

export async function removeBillingAction() {
  const { workspace } = await requireOwner('pagamentos');
  const db = createAdminClient();
  const current = await getWorkspaceBilling(db, workspace.id);
  if (current?.webhook_id) await abacatePay(current.api_key).deleteWebhook(current.webhook_id).catch(() => undefined);
  await deleteWorkspaceBilling(db, workspace.id);
  revalidatePath(HERE);
  back('pagamentos', { ok: 'AbacatePay desconectada. As cobranças já emitidas continuam registradas, mas os pagamentos delas não serão mais confirmados aqui.' });
}

function catalogFields(formData: FormData) {
  const name = text(formData, 'name');
  const amount = parseBRLToCents(text(formData, 'amount'));
  const kind = text(formData, 'kind') === 'recorrente' ? 'recorrente' as const : 'unico' as const;
  const cycle = text(formData, 'cycle') as Cycle;
  if (!name) back('servicos', { erro: 'Dê um nome ao serviço.' });
  if (amount === null || amount <= 0) back('servicos', { erro: 'Informe um valor maior que zero.' });
  if (kind === 'recorrente' && !CYCLES.some((c) => c.value === cycle)) back('servicos', { erro: 'Escolha a periodicidade do serviço recorrente.' });
  return { name, amount_cents: amount!, kind, cycle: kind === 'recorrente' ? cycle : null, description: text(formData, 'description') || null };
}

export async function saveCatalogItemAction(formData: FormData) {
  const { workspace } = await requireOwner('servicos');
  const db = scopeDb(createAdminClient(), workspace.id);
  const fields = catalogFields(formData);
  const id = text(formData, 'id');
  try {
    if (id) await updateCatalogItem(db, id, fields);
    else await createCatalogItem(db, fields);
  } catch (err) {
    back('servicos', { erro: (err as Error).message });
  }
  revalidatePath('/painel', 'layout');
  back('servicos', { ok: id ? 'Serviço atualizado.' : `${fields.name} entrou no catálogo.` });
}

export async function toggleCatalogItemAction(formData: FormData) {
  const { workspace } = await requireOwner('servicos');
  const active = text(formData, 'active') === 'true';
  await updateCatalogItem(scopeDb(createAdminClient(), workspace.id), text(formData, 'id'), { active });
  revalidatePath('/painel', 'layout');
  back('servicos', { ok: active ? 'Serviço reativado.' : 'Serviço arquivado: some do Fechar negócio, mas os clientes que já têm continuam iguais.' });
}

/** Desconecta uma ferramenta (Claude, Cursor…) do MCP: revoga o consentimento e derruba as sessões dela. */
export async function revokeMcpConnectionAction(formData: FormData) {
  await getSession();
  const clientId = text(formData, 'client_id');
  if (!clientId) back('mcp', { erro: 'Conexão não encontrada.' });
  const supabase = await createServerClient();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) back('mcp', { erro: 'Não foi possível desconectar. Tente de novo.' });
  revalidatePath(HERE);
  back('mcp', { ok: 'Conexão removida. A ferramenta perdeu o acesso.' });
}
