import { getEnv } from '@lps/config';
import { createAdminClient, getWorkspaceApify, getWorkspaceBilling, listCatalog, listProfiles, listQuickReplies, pendingInvites, scopeDb, type Workspace } from '@lps/db';
import { CYCLES, formatBRL, QUICK_REPLY_VARIABLES, maskApiKey, maskApifyToken } from '@lps/domain';
import { Archive, ArchiveRestore, Building2, Radar, Check, Clock, CreditCard, LogIn, MessageSquareText, Package, Plug, Plus, Trash2, Unplug, UserPlus, Users, X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { WhatsAppConnection, whatsappIntro } from '@/components/connections/whatsapp-connection';
import { ProfileEditor } from '@/components/settings/profile-editor';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { Topbar } from '@/components/layout/topbar';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { CopyButton } from '@/components/ui/copy-button';
import { getSession, workspaceProfile } from '@/lib/auth';
import { formatDate } from '@/lib/lead-labels';
import { listMcpConnections, mcpEndpoint } from '@/lib/mcp/connections';
import {
  addMemberAction, cancelInviteAction, createWorkspaceAction, removeApifyAction, removeBillingAction, removeMemberAction, revokeMcpConnectionAction, saveApifyAction, saveBillingAction,
  saveCatalogItemAction, saveWorkspaceAction, switchWorkspaceAction, toggleCatalogItemAction,
} from './actions';

type Tab = 'workspace' | 'membros' | 'whatsapp' | 'pagamentos' | 'apify' | 'servicos' | 'mensagens' | 'mcp' | 'workspaces';
const ROLE = { owner: 'Dono', member: 'Membro' } as const;
const HERE = '/painel/configuracoes';

async function membersOf(workspaceId: string) {
  const db = createAdminClient();
  const { data } = await db.from('workspace_members').select('user_id, role, created_at').eq('workspace_id', workspaceId).order('created_at');
  return Promise.all(
    ((data ?? []) as { user_id: string; role: keyof typeof ROLE }[]).map(async (m) => {
      const { data: u } = await db.auth.admin.getUserById(m.user_id);
      return { ...m, email: u.user?.email ?? '—' };
    }),
  );
}

async function memberCounts(): Promise<Map<string, number>> {
  const { data } = await createAdminClient().from('workspace_members').select('workspace_id');
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { workspace_id: string }[]) counts.set(r.workspace_id, (counts.get(r.workspace_id) ?? 0) + 1);
  return counts;
}

function Section({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-medium">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
      {footer && <div className="flex items-center justify-end gap-2 border-t border-border bg-white/[0.015] px-5 py-3">{footer}</div>}
    </Card>
  );
}

const initial = (name: string) => name.trim().slice(0, 1).toUpperCase() || 'W';

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string; erro?: string; ok?: string }> }) {
  const params = await searchParams;
  const { user, isAdmin, workspaces, workspace } = await getSession();
  const tabs: { key: Tab; label: string; icon: (props: { className?: string }) => ReactNode }[] = [
    { key: 'workspace', label: 'Workspace', icon: Building2 },
    { key: 'membros', label: 'Membros', icon: Users },
    { key: 'whatsapp', label: 'WhatsApp', icon: WhatsAppIcon },
    { key: 'mensagens', label: 'Mensagens rápidas', icon: MessageSquareText },
    { key: 'servicos', label: 'Serviços', icon: Package },
    { key: 'pagamentos', label: 'Pagamentos', icon: CreditCard },
    { key: 'apify', label: 'Apify', icon: Radar },
    { key: 'mcp', label: 'MCP (Claude)', icon: Plug },
    ...(isAdmin ? [{ key: 'workspaces' as const, label: 'Todos os workspaces', icon: LogIn }] : []),
  ];
  const tab = tabs.find((t) => t.key === params.aba)?.key ?? 'workspace';
  const canEdit = isAdmin || workspace.role === 'owner';
  const env = getEnv();

  return (
    <>
      <Topbar crumbs={[{ label: 'Configurações' }]} />
      <div className="mx-auto grid max-w-5xl gap-6 p-4 lg:grid-cols-[13rem_1fr] lg:p-6">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Seções">
          {tabs.map(({ key, label, icon: Icon }) => (
            <Link
              key={key}
              href={`${HERE}?aba=${key}`}
              aria-current={tab === key ? 'page' : undefined}
              className={`flex h-9 shrink-0 items-center gap-2.5 rounded-md px-3 text-sm ${tab === key ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          {params.erro && <p className="rounded-md border border-destructive/40 bg-destructive-subtle px-3 py-2 text-sm text-destructive">{params.erro}</p>}
          {params.ok && <p className="rounded-md border border-success/40 px-3 py-2 text-sm text-success">{params.ok}</p>}

          {tab === 'workspace' && (
            <form action={saveWorkspaceAction}>
              <Section
                title="Workspace"
                description="Os dados da sua operação. O nome e a empresa aparecem nas mensagens que você manda."
                footer={canEdit ? <Button type="submit">Salvar</Button> : <span className="text-xs text-muted-foreground">Só o dono pode alterar.</span>}
              >
                <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome do workspace">
                    <Input name="name" defaultValue={workspace.name} required />
                  </Field>
                  <Field label="Seu nome nas mensagens" hint={`"Aqui é o ${workspace.signature_name || 'Fulano'}…" e a assinatura no CRM`}>
                    <Input name="signature_name" defaultValue={workspace.signature_name ?? ''} placeholder="Ex.: João" />
                  </Field>
                  <Field label="Nome comercial" hint="Usado em $empresa nas mensagens rápidas">
                    <Input name="commercial_name" defaultValue={workspace.commercial_name ?? ''} placeholder={env.COMMERCIAL_NAME} />
                  </Field>
                  <Field label="Primeiros contatos por dia" hint="Acima disso, o CRM pede confirmação antes de enviar">
                    <Input name="daily_first_contact_limit" type="number" min={1} defaultValue={workspace.daily_first_contact_limit ?? ''} placeholder={String(env.DAILY_FIRST_CONTACT_LIMIT)} />
                  </Field>
                </fieldset>
              </Section>
            </form>
          )}

          {tab === 'whatsapp' && (
            <>
              <p className="text-sm text-muted-foreground">{whatsappIntro}</p>
              <WhatsAppConnection />
            </>
          )}

          {tab === 'membros' && <MembersTab workspaceId={workspace.id} me={user} canEdit={canEdit} />}

          {tab === 'mensagens' && <QuickRepliesTab workspace={workspace} canEdit={canEdit} />}

          {tab === 'servicos' && <CatalogTab workspaceId={workspace.id} canEdit={canEdit} />}

          {tab === 'pagamentos' && <BillingTab workspaceId={workspace.id} canEdit={canEdit} />}

          {tab === 'apify' && <ApifyTab workspaceId={workspace.id} canEdit={canEdit} />}

          {tab === 'mcp' && <McpTab endpoint={mcpEndpoint(env.APP_URL)} />}

          {tab === 'workspaces' && isAdmin && <WorkspacesTab workspaces={workspaces} current={workspace.id} />}
        </div>
      </div>
    </>
  );
}

async function MembersTab({ workspaceId, me, canEdit }: { workspaceId: string; me: { id: string; email: string }; canEdit: boolean }) {
  const [members, invites] = await Promise.all([membersOf(workspaceId), pendingInvites(createAdminClient(), { workspaceId })]);
  const profiles = await listProfiles(createAdminClient(), [me.id, ...members.map((m) => m.user_id)]);
  return (
    <>
      {/* O administrador da plataforma pode não ser membro deste workspace. */}
      {!members.some((m) => m.user_id === me.id) && (
        <Section title="Meu perfil" description="Seu nome e sua foto no chat, em todos os workspaces.">
          <ProfileEditor userId={me.id} name={profiles.get(me.id)?.name ?? null} email={me.email} avatarUrl={profiles.get(me.id)?.avatarUrl ?? null} isMe canEdit />
        </Section>
      )}
      <Section title="Membros" description="Quem trabalha neste workspace. Cada pessoa entra com o próprio e-mail e senha.">
        <ul className="-my-2 divide-y divide-border">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 py-2.5">
              <ProfileEditor
                userId={m.user_id}
                name={profiles.get(m.user_id)?.name ?? null}
                email={m.email}
                avatarUrl={profiles.get(m.user_id)?.avatarUrl ?? null}
                isMe={m.user_id === me.id}
                canEdit={canEdit || m.user_id === me.id}
              />
              <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{ROLE[m.role]}</Badge>
              {canEdit && m.user_id !== me.id && (
                <form action={removeMemberAction}>
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <Button type="submit" variant="ghost" aria-label={`Remover ${m.email}`}><Trash2 /></Button>
                </form>
              )}
            </li>
          ))}
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-border text-muted-foreground"><Clock className="size-3.5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{inv.email}</p>
                <p className="text-xs text-muted-foreground">Aguardando criar a conta</p>
              </div>
              <Badge tone={inv.role === 'owner' ? 'brand' : 'neutral'}>{ROLE[inv.role]}</Badge>
              {canEdit && (
                <form action={cancelInviteAction}>
                  <input type="hidden" name="invite_id" value={inv.id} />
                  <Button type="submit" variant="ghost" aria-label={`Cancelar convite de ${inv.email}`}><X /></Button>
                </form>
              )}
            </li>
          ))}
          {!members.length && !invites.length && <li className="py-2.5 text-sm text-muted-foreground">Ninguém ainda.</li>}
        </ul>
      </Section>
      {canEdit && (
        <form action={addMemberAction}>
          <Section
            title="Adicionar pessoa"
            description="Só o e-mail. A pessoa cria a própria senha em Criar conta, na tela de entrada, e já cai neste workspace."
            footer={<Button type="submit"><UserPlus />Adicionar</Button>}
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <Field label="E-mail"><Input name="email" type="email" required /></Field>
              <Field label="Papel">
                <Select name="role" defaultValue="member">
                  <option value="member">Membro</option>
                  <option value="owner">Dono</option>
                </Select>
              </Field>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Dono altera as configurações e os membros. Membro só trabalha na operação.</p>
          </Section>
        </form>
      )}
    </>
  );
}

async function WorkspacesTab({ workspaces, current }: { workspaces: { id: string; name: string; signature_name: string | null }[]; current: string }) {
  const counts = await memberCounts();
  return (
    <>
      <Section title="Todos os workspaces" description="Só você, como administrador, vê esta lista. Cada pessoa só enxerga o workspace dela.">
        <ul className="-my-2 divide-y divide-border">
          {workspaces.map((w) => (
            <li key={w.id} className="flex items-center gap-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand text-sm font-semibold text-brand-foreground">{initial(w.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{w.name}</p>
                <p className="text-xs text-muted-foreground">{counts.get(w.id) ?? 0} {counts.get(w.id) === 1 ? 'membro' : 'membros'}{w.signature_name ? ` · ${w.signature_name}` : ''}</p>
              </div>
              {w.id === current ? (
                <Badge tone="brand"><Check className="size-3" />Em uso</Badge>
              ) : (
                <form action={switchWorkspaceAction.bind(null, w.id)}>
                  <Button type="submit" variant="outline"><LogIn />Entrar</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Section>
      <form action={createWorkspaceAction}>
        <Section
          title="Novo workspace"
          description="Uma operação nova, vazia. Informe o e-mail do dono: ele cria a senha em Criar conta e já cai aqui."
          footer={<Button type="submit"><Plus />Criar workspace</Button>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do workspace"><Input name="name" placeholder="Ex.: Operação do João" required /></Field>
            <Field label="Nome dele nas mensagens"><Input name="signature_name" placeholder="Ex.: João" /></Field>
            <Field label="Nome comercial" hint="Opcional"><Input name="commercial_name" /></Field>
            <div />
            <Field label="E-mail do dono" hint="Opcional: dá para adicionar depois em Membros"><Input name="email" type="email" /></Field>
          </div>
        </Section>
      </form>
    </>
  );
}

const PERMISSIONS = ['CUSTOMER:CREATE', 'PRODUCT:CREATE', 'CHECKOUT:CREATE', 'SUBSCRIPTION:CREATE', 'SUBSCRIPTION:DELETE', 'WEBHOOK:CREATE', 'WEBHOOK:DELETE'];

async function BillingTab({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const billing = await getWorkspaceBilling(createAdminClient(), workspaceId);
  return (
    <>
      <Section title="AbacatePay" description="A conta onde este workspace recebe. Cada workspace usa a própria chave, e o dinheiro cai na conta dela.">
        {billing ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-success/15 text-success"><Check className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Conectada <span className="font-mono text-xs font-normal text-muted-foreground">{maskApiKey(billing.api_key)}</span></p>
              <p className="text-xs text-muted-foreground">Desde {formatDate(billing.updated_at)} · confirmação de pagamento automática</p>
            </div>
            <Badge tone={billing.dev_mode ? 'warning' : 'success'}>{billing.dev_mode ? 'Modo Teste' : 'Produção'}</Badge>
            {canEdit && (
              <form action={removeBillingAction}>
                <Button type="submit" variant="ghost">Desconectar</Button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não conectada. Sem ela, o botão Gerar cobrança avisa que falta a chave.</p>
        )}
      </Section>
      {canEdit && (
        <form action={saveBillingAction}>
          <Section
            title={billing ? 'Trocar a chave' : 'Conectar'}
            description="Cole a chave de API v2. O sistema registra sozinho o aviso de pagamento deste workspace na AbacatePay."
            footer={<Button type="submit">{billing ? 'Salvar chave nova' : 'Conectar'}</Button>}
          >
            <Field label="Chave de API" hint="abc_prod_… recebe de verdade; abc_dev_… é o Modo Teste, com pagamento simulado">
              <Input name="api_key" type="password" autoComplete="off" placeholder="abc_prod_…" required />
            </Field>
            <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              <p>No painel da AbacatePay: <span className="text-foreground">Integração › API › Nova chave</span>, versão v2, com estas permissões:</p>
              <p className="flex flex-wrap gap-1">{PERMISSIONS.map((p) => <code key={p} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground">{p}</code>)}</p>
              <p>A chave aparece uma vez só lá. Aqui ela fica guardada no servidor e nunca volta para a tela.</p>
            </div>
          </Section>
        </form>
      )}
    </>
  );
}

async function ApifyTab({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const apify = await getWorkspaceApify(createAdminClient(), workspaceId);
  return (
    <>
      <Section title="Apify" description="A conta que faz as buscas deste workspace: Google Maps, Instagram dos leads e as imagens dos qualificados. Cada workspace usa a própria conta, e o gasto sai dela.">
        {apify ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-success/15 text-success"><Check className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Conectado como {apify.username ?? 'conta do Apify'} <span className="font-mono text-xs font-normal text-muted-foreground">{maskApifyToken(apify.token)}</span></p>
              <p className="text-xs text-muted-foreground">Desde {formatDate(apify.updated_at)}</p>
            </div>
            {apify.plan && <Badge tone={apify.plan === 'FREE' ? 'warning' : 'success'}>{apify.plan === 'FREE' ? 'Gratuito' : apify.plan}</Badge>}
            {canEdit && (
              <form action={removeApifyAction}>
                <Button type="submit" variant="ghost">Desconectar</Button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não conectado. Sem ele, não dá para criar batch nem baixar as imagens do Instagram.</p>
        )}
      </Section>
      {canEdit && (
        <form action={saveApifyAction}>
          <Section
            title={apify ? 'Trocar o token' : 'Conectar'}
            description="Cole o token pessoal da sua conta do Apify. O sistema confere com o Apify antes de salvar."
            footer={<Button type="submit">{apify ? 'Salvar token novo' : 'Conectar'}</Button>}
          >
            <Field label="Token da API" hint="Começa com apify_api_">
              <Input name="token" type="password" autoComplete="off" placeholder="apify_api_…" required />
            </Field>
            <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              <p>No Apify: <span className="text-foreground">Settings › API &amp; Integrations › Personal API tokens</span> (<a className="underline hover:text-foreground" href="https://console.apify.com/settings/integrations" target="_blank" rel="noreferrer">abrir</a>).</p>
              <p>A conta gratuita traz US$ 5 de crédito por mês, uns 7 batches de 50 lugares. Quando acaba, as buscas param até o mês seguinte, sem cobrança extra.</p>
              <p>O token fica guardado no servidor e nunca volta para a tela.</p>
            </div>
          </Section>
        </form>
      )}
    </>
  );
}

const kindLabel = (item: { kind: 'unico' | 'recorrente'; cycle: string | null }) =>
  item.kind === 'unico' ? 'Único' : (CYCLES.find((c) => c.value === item.cycle)?.label ?? 'Recorrente');

function CatalogFields({ item }: { item?: { name: string; kind: 'unico' | 'recorrente'; amount_cents: number; cycle: string | null; description: string | null } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome"><Input name="name" defaultValue={item?.name} placeholder="Ex.: Site institucional" required /></Field>
      <Field label="Valor"><Input name="amount" defaultValue={item ? formatBRL(item.amount_cents) : ''} placeholder="R$ 1.200,00" inputMode="decimal" required /></Field>
      <Field label="Tipo">
        <Select name="kind" defaultValue={item?.kind ?? 'unico'}>
          <option value="unico">Único (paga uma vez)</option>
          <option value="recorrente">Recorrente (assinatura)</option>
        </Select>
      </Field>
      <Field label="Periodicidade" hint="Só para recorrente">
        <Select name="cycle" defaultValue={item?.cycle ?? 'mensal'}>
          {CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Descrição" hint="Opcional: escopo ou o que está incluso. Vai para as observações do serviço."><Input name="description" defaultValue={item?.description ?? ''} /></Field>
      </div>
    </div>
  );
}

async function CatalogTab({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const items = await listCatalog(scopeDb(createAdminClient(), workspaceId));
  return (
    <>
      <Section title="Serviços" description="O que este workspace vende. Em Fechar negócio, escolher um serviço daqui já preenche nome, valor e periodicidade.">
        <ul className="-my-2 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className={`py-2.5 ${item.active ? '' : 'opacity-60'}`}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-muted text-brand-soft"><Package className="size-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBRL(item.amount_cents)} · {kindLabel(item)}{item.active ? '' : ' · arquivado'}</p>
                  </div>
                  {canEdit && <span className="text-xs text-muted-foreground group-open:hidden">Editar</span>}
                </summary>
                {canEdit && (
                  <div className="mt-3 space-y-3 rounded-md border border-border p-4">
                    <form action={saveCatalogItemAction} className="space-y-3">
                      <input type="hidden" name="id" value={item.id} />
                      <CatalogFields item={item} />
                      <div className="flex justify-end"><Button type="submit">Salvar</Button></div>
                    </form>
                    <form action={toggleCatalogItemAction} className="flex justify-end border-t border-border pt-3">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="active" value={String(!item.active)} />
                      <Button type="submit" variant="ghost">{item.active ? <><Archive />Arquivar</> : <><ArchiveRestore />Reativar</>}</Button>
                    </form>
                  </div>
                )}
              </details>
            </li>
          ))}
          {!items.length && <li className="py-2.5 text-sm text-muted-foreground">Nenhum serviço ainda. Cadastre abaixo o que você vende.</li>}
        </ul>
      </Section>
      {canEdit && (
        <form action={saveCatalogItemAction}>
          <Section title="Novo serviço" footer={<Button type="submit"><Plus />Adicionar ao catálogo</Button>}>
            <CatalogFields />
          </Section>
        </form>
      )}
    </>
  );
}

async function QuickRepliesTab({ workspace, canEdit }: { workspace: Workspace; canEdit: boolean }) {
  const items = await listQuickReplies(scopeDb(createAdminClient(), workspace.id));
  const profile = workspaceProfile(workspace);
  const mine: Record<string, string> = { empresa: profile.company, meu_nome: profile.signer };
  const variables = QUICK_REPLY_VARIABLES.map((v) => ({ key: v.key, label: v.label, value: mine[v.key] ?? v.sample }));
  return <QuickRepliesManager items={items} variables={variables} canEdit={canEdit} />;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium">{n}</span>
      <div className="min-w-0 space-y-1.5 text-sm">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

function CodeLine({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-input-bg px-3 py-1.5 font-mono text-xs">{value}</code>
      <CopyButton text={value} />
    </div>
  );
}

async function McpTab({ endpoint }: { endpoint: string }) {
  const connections = await listMcpConnections();
  const claudeCode = `claude mcp add --transport http sharken ${endpoint}`;
  return (
    <>
      <Section
        title="Servidor MCP"
        description="Liga o Claude (ou outra ferramenta com MCP) aos seus batches, leads com imagens e atendimentos. Só leitura: a ferramenta não altera nada no Sharken."
      >
        <div className="space-y-5">
          <Field label="Endereço do servidor">
            <CodeLine value={endpoint} />
          </Field>
          <ol className="space-y-4">
            <Step n={1} title="claude.ai ou app do Claude">
              <p className="text-muted-foreground">
                Configurações › Conectores › Adicionar conector personalizado. Dê um nome (ex.: Sharken), cole o endereço acima e clique em Conectar.
              </p>
            </Step>
            <Step n={2} title="Claude Code">
              <p className="text-muted-foreground">Rode no terminal e depois digite /mcp para entrar:</p>
              <CodeLine value={claudeCode} />
            </Step>
            <Step n={3} title="Cursor e outras ferramentas">
              <p className="text-muted-foreground">Adicione um servidor MCP remoto (HTTP) com o mesmo endereço. O login é descoberto sozinho.</p>
            </Step>
          </ol>
          <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
            Ao conectar, abre a tela do Sharken para você entrar e autorizar. A ferramenta vê os mesmos workspaces que você vê aqui.
          </p>
        </div>
      </Section>

      <Section title="Conexões" description="Ferramentas que você autorizou. Desconectar tira o acesso na hora.">
        {connections === null ? (
          <p className="text-sm text-destructive">Não consegui carregar as conexões agora. Recarregue a página.</p>
        ) : connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ferramenta conectada ainda. Siga os passos acima e ela aparece aqui.</p>
        ) : (
          <ul className="divide-y divide-border">
            {connections.map((c) => (
              <li key={c.clientId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
                  <Plug className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.site ? `${c.site} · ` : ''}Conectado em {formatDate(c.grantedAt)}
                  </p>
                </div>
                <Badge tone="success">Ativa</Badge>
                <form action={revokeMcpConnectionAction}>
                  <input type="hidden" name="client_id" value={c.clientId} />
                  <Button type="submit" variant="danger">
                    <Unplug />Desconectar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
