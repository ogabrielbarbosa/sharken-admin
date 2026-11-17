import { createAdminClient } from '@lps/db';
import { Check, Plus, Trash2, UserPlus } from 'lucide-react';
import { Topbar } from '@/components/layout/topbar';
import { Badge, Button, Card, Field, Input, SectionTitle, Select } from '@/components/ui';
import { getSession } from '@/lib/auth';
import { addMemberAction, createWorkspaceAction, removeMemberAction, renameWorkspaceAction, switchWorkspaceAction } from './actions';

const ROLE = { owner: 'Dono', member: 'Membro' } as const;

async function membersOf(workspaceId: string) {
  const db = createAdminClient();
  const { data } = await db.from('workspace_members').select('user_id, role, created_at').eq('workspace_id', workspaceId).order('created_at');
  return Promise.all(
    ((data ?? []) as { user_id: string; role: keyof typeof ROLE }[]).map(async (m) => {
      const { data: u } = await db.auth.admin.getUserById(m.user_id);
      return { ...m, email: u.user?.email ?? m.user_id };
    }),
  );
}

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { erro, ok } = await searchParams;
  const { user, workspaces, workspace } = await getSession();
  const owner = workspace.role === 'owner';
  const members = await membersOf(workspace.id);

  return (
    <>
      <Topbar crumbs={[{ label: 'Workspaces' }]} />
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <p className="text-sm text-muted-foreground">
          Cada workspace é uma operação separada: batches, leads, conversas, conexão do WhatsApp, contatos, clientes, contratos e
          cobranças só aparecem dentro dele. Quem pediu para não receber mensagens fica bloqueado em todos.
        </p>
        {erro && <p className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">{erro}</p>}
        {ok && <p className="rounded-md border border-success/40 px-3 py-2 text-sm text-success">{ok}</p>}

        <section className="space-y-3">
          <SectionTitle count={workspaces.length}>Seus workspaces</SectionTitle>
          <Card className="divide-y divide-border">
            {workspaces.map((w) => (
              <div key={w.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-muted text-sm font-semibold text-brand-soft">{w.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">{ROLE[w.role]}</p>
                </div>
                {w.id === workspace.id ? (
                  <Badge tone="brand"><Check className="size-3" />Em uso</Badge>
                ) : (
                  <form action={switchWorkspaceAction.bind(null, w.id)}>
                    <Button variant="outline">Entrar</Button>
                  </form>
                )}
              </div>
            ))}
          </Card>
          <form action={createWorkspaceAction} className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Novo workspace"><Input name="name" placeholder="Ex.: Operação do João" required /></Field>
            </div>
            <Button><Plus />Criar</Button>
          </form>
        </section>

        <section className="space-y-3">
          <SectionTitle count={members.length}>Membros de {workspace.name}</SectionTitle>
          {owner && (
            <form action={renameWorkspaceAction} className="flex items-end gap-2">
              <input type="hidden" name="workspace_id" value={workspace.id} />
              <div className="flex-1">
                <Field label="Nome"><Input name="name" defaultValue={workspace.name} required /></Field>
              </div>
              <Button variant="outline">Salvar nome</Button>
            </form>
          )}
          <Card className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{m.email}{m.user_id === user.id && <span className="text-muted-foreground"> (você)</span>}</p>
                  <p className="text-xs text-muted-foreground">{ROLE[m.role]}</p>
                </div>
                {owner && m.user_id !== user.id && (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="workspace_id" value={workspace.id} />
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <Button variant="ghost" aria-label={`Remover ${m.email}`}><Trash2 /></Button>
                  </form>
                )}
              </div>
            ))}
          </Card>
          {owner && (
            <Card className="p-4">
              <form action={addMemberAction} className="space-y-3">
                <input type="hidden" name="workspace_id" value={workspace.id} />
                <p className="text-sm font-medium">Adicionar pessoa</p>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
                  <Field label="E-mail"><Input name="email" type="email" required /></Field>
                  <Field label="Senha" hint="Só para conta nova (mín. 8)"><Input name="password" type="text" autoComplete="off" /></Field>
                  <Field label="Papel">
                    <Select name="role" defaultValue="owner">
                      <option value="owner">Dono</option>
                      <option value="member">Membro</option>
                    </Select>
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">Dono gerencia membros e cria workspaces. Membro só trabalha na operação.</p>
                <Button><UserPlus />Adicionar</Button>
              </form>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
