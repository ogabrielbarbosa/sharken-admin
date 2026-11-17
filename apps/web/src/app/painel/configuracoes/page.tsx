import { getEnv } from '@lps/config';
import { createAdminClient, pendingInvites } from '@lps/db';
import { Building2, Check, Clock, LogIn, Plus, Trash2, UserPlus, Users, X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { getSession } from '@/lib/auth';
import { addMemberAction, cancelInviteAction, createWorkspaceAction, removeMemberAction, saveWorkspaceAction, switchWorkspaceAction } from './actions';

type Tab = 'workspace' | 'membros' | 'workspaces';
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
  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'workspace', label: 'Workspace', icon: Building2 },
    { key: 'membros', label: 'Membros', icon: Users },
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
                  <Field label="Nome comercial" hint="Usado em $empresa nas respostas rápidas">
                    <Input name="commercial_name" defaultValue={workspace.commercial_name ?? ''} placeholder={env.COMMERCIAL_NAME} />
                  </Field>
                  <Field label="Primeiros contatos por dia" hint="Acima disso, o CRM pede confirmação antes de enviar">
                    <Input name="daily_first_contact_limit" type="number" min={1} defaultValue={workspace.daily_first_contact_limit ?? ''} placeholder={String(env.DAILY_FIRST_CONTACT_LIMIT)} />
                  </Field>
                </fieldset>
              </Section>
            </form>
          )}

          {tab === 'workspace' && (
            <Section title="WhatsApp" description="O número que conversa com os leads deste workspace.">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Conecte o celular lendo o QR na tela de conexões.</p>
                <Link href="/painel/crm/conexoes" className="press inline-flex h-8 items-center rounded-md border border-input bg-input-bg px-3 text-sm font-medium hover:bg-white/5">Abrir conexões</Link>
              </div>
            </Section>
          )}

          {tab === 'membros' && <MembersTab workspaceId={workspace.id} me={user.id} canEdit={canEdit} />}

          {tab === 'workspaces' && isAdmin && <WorkspacesTab workspaces={workspaces} current={workspace.id} />}
        </div>
      </div>
    </>
  );
}

async function MembersTab({ workspaceId, me, canEdit }: { workspaceId: string; me: string; canEdit: boolean }) {
  const [members, invites] = await Promise.all([membersOf(workspaceId), pendingInvites(createAdminClient(), { workspaceId })]);
  return (
    <>
      <Section title="Membros" description="Quem trabalha neste workspace. Cada pessoa entra com o próprio e-mail e senha.">
        <ul className="-my-2 divide-y divide-border">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-muted text-xs font-semibold text-brand-soft">{initial(m.email)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{m.email}{m.user_id === me && <span className="text-muted-foreground"> · você</span>}</p>
              </div>
              <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{ROLE[m.role]}</Badge>
              {canEdit && m.user_id !== me && (
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
