import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getEnv, whatsappWebhookUrl } from '@lps/config';
import { setConnection } from '@lps/db';
import { getEvolutionAdmin } from '@lps/integrations';
import { BookOpen, CheckCircle2, ExternalLink, Server, TriangleAlert, Webhook } from 'lucide-react';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ConnectPanel, ConnectionRealtime, InstanceActions } from '@/components/connections/whatsapp-connect';
import { Markdown } from '@/components/connections/markdown';
import { Avatar } from '@/components/crm/avatar';
import { Topbar } from '@/components/layout/topbar';
import { Card, Status, type Tone } from '@/components/ui';
import { authedDb } from '@/lib/auth';
import { CONNECTIONS, displayValue, isConfigured, type ConnectionDef } from '@/lib/connections';

const STATE_LABEL = { conectado: 'Conectado', conectando: 'Aguardando leitura do QR', desconectado: 'Desconectado' } as const;
const STATE_TONE: Record<keyof typeof STATE_LABEL, Tone> = { conectado: 'success', conectando: 'warning', desconectado: 'danger' };

function Section({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-right font-mono text-xs leading-5">{children}</span>
    </div>
  );
}

function Variables({ def }: { def: ConnectionDef }) {
  return (
    <Section title="Variáveis no .env" icon={<Server />}>
      {def.vars.map((v) => {
        const value = displayValue(v.key, v.secret);
        return (
          <Row key={v.key} label={v.key}>
            {value ?? <span className={v.required ? 'text-destructive' : 'text-muted-foreground'}>{v.required ? 'faltando' : 'opcional'}</span>}
          </Row>
        );
      })}
    </Section>
  );
}

const mask = (url: string) => url.replace(/token=[^&]+/, 'token=••••••');

async function evolutionDocs(): Promise<{ file: string; source: string }[]> {
  for (const dir of [path.resolve(process.cwd(), '../../docs/evolution-api'), path.resolve(process.cwd(), 'docs/evolution-api')]) {
    try {
      const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort((a, b) => (a === 'README.md' ? -1 : b === 'README.md' ? 1 : a.localeCompare(b)));
      return await Promise.all(files.map(async (file) => ({ file, source: await readFile(path.join(dir, file), 'utf8') })));
    } catch {
      // tenta o próximo caminho
    }
  }
  return [];
}

async function WhatsAppConnection({ def }: { def: ConnectionDef }) {
  const db = await authedDb();
  const admin = getEvolutionAdmin();
  const configured = isConfigured(def) && !!admin;
  const [overview, docs] = await Promise.all([admin ? admin.overview() : null, evolutionDocs()]);
  const instance = overview?.instance ?? null;
  const state = instance?.state ?? 'desconectado';

  // O estado salvo acompanha o real: o CRM e o menu nunca ficam com um estado velho.
  const { data: saved } = await db.from('whatsapp_connection').select('state, phone, profile_name').eq('id', 1).maybeSingle();
  if (overview?.reachable && (saved?.state !== state || (instance?.phone && saved?.phone !== instance.phone))) {
    await setConnection(db, { state, phone: instance?.phone ?? null, profileName: instance?.profileName ?? null, profilePicUrl: instance?.profilePicUrl ?? null, instance: admin!.instanceName }, new Date());
  }

  const expectedHook = whatsappWebhookUrl(getEnv());
  const hook = overview?.webhook ?? null;
  const hookOk = !!hook && hook.enabled && hook.url === expectedHook;

  return (
    <div className="space-y-4">
      <ConnectionRealtime />
      {!configured && (
        <Card className="flex items-start gap-3 border-warning/40 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>Preencha as variáveis da Evolution no <code className="font-mono">.env.local</code>. Para rodar a Evolution na sua máquina: <code className="font-mono">docker compose -f infra/evolution/docker-compose.yml --env-file .env.local up -d</code>.</p>
        </Card>
      )}
      {overview && !overview.reachable && (
        <Card className="flex items-start gap-3 border-destructive/40 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Servidor da Evolution fora do ar</p>
            <p className="text-muted-foreground">{overview.error}</p>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={instance?.profileName ?? 'WhatsApp'} src={instance?.profilePicUrl} size={56} seed="instancia" />
            <div className="space-y-1">
              <p className="text-base font-semibold">{instance?.profileName ?? (state === 'conectado' ? 'WhatsApp' : 'Nenhum celular conectado')}</p>
              <p className="font-mono text-xs text-muted-foreground">{instance?.phone ?? '—'} · instância {admin?.instanceName ?? '—'}</p>
              <Status tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Status>
            </div>
          </div>
          <InstanceActions state={state} configured={configured && !!overview?.reachable} />
        </div>
        {state !== 'conectado' && configured && overview?.reachable && (
          <div className="mt-6 border-t border-border pt-6">
            <ConnectPanel state={state} configured />
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Servidor" icon={<Server />}>
          <Row label="Endereço">{process.env.EVOLUTION_URL ?? '—'}</Row>
          <Row label="Versão da Evolution">{overview?.version ?? '—'}</Row>
          <Row label="WhatsApp Web">{overview?.whatsappWebVersion ?? '—'}</Row>
          <Row label="Instância criada">{instance?.createdAt ? new Date(instance.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'ainda não'}</Row>
        </Section>
        <Section title="Webhook" icon={<Webhook />} action={hook ? <Status tone={hookOk ? 'success' : 'warning'}>{hookOk ? 'Registrado' : 'Diferente do esperado'}</Status> : <Status tone="neutral">Não registrado</Status>}>
          <Row label="Na instância">{hook ? mask(hook.url) : '—'}</Row>
          <Row label="Esperado">{expectedHook ? mask(expectedHook) : 'defina WHATSAPP_WEBHOOK_SECRET'}</Row>
          <Row label="Eventos">{hook?.events.join(', ') || '—'}</Row>
          {!hookOk && <p className="mt-3 text-xs text-muted-foreground">Use Registrar webhook. O botão Conectar celular também registra.</p>}
          {hookOk && <p className="mt-3 flex items-center gap-1.5 text-xs text-success-foreground"><CheckCircle2 className="size-3.5" />Mensagens, status, conexão e fotos chegam em tempo real.</p>}
        </Section>
      </div>

      <Variables def={def} />

      <Section title="Documentação da Evolution API" icon={<BookOpen />} action={<a href={def.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Site oficial<ExternalLink className="size-3" /></a>}>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">A documentação local fica em <code className="font-mono">docs/evolution-api/</code>.</p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {docs.map((d) => {
              const title = d.source.match(/^#\s+(.+)$/m)?.[1] ?? d.file;
              return (
                <details key={d.file} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-accent/50">
                    <span className="font-medium">{title}</span>
                    <span className="font-mono text-xs text-muted-foreground">{d.file}</span>
                  </summary>
                  <div className="border-t border-border px-4 py-4"><Markdown source={d.source} /></div>
                </details>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

export default async function ConexaoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const def = CONNECTIONS.find((c) => c.slug === slug);
  if (!def) notFound();
  const configured = isConfigured(def);
  return (
    <>
      <Topbar crumbs={[{ label: 'Conexões', href: '/painel/conexoes' }, { label: def.label }]} />
      <div className="mx-auto max-w-5xl p-4 lg:p-6">
        <p className="mb-5 text-sm text-muted-foreground">{def.provider} · {def.description}</p>
        {def.slug === 'whatsapp' ? (
          <WhatsAppConnection def={def} />
        ) : (
          <div className="space-y-4">
            <Card className="flex items-center justify-between gap-3 p-5">
              <Status tone={configured ? 'success' : 'neutral'}>{configured ? 'Chave configurada' : 'Não configurado'}</Status>
              <a href={def.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Documentação<ExternalLink className="size-3" /></a>
            </Card>
            <Variables def={def} />
          </div>
        )}
      </div>
    </>
  );
}
