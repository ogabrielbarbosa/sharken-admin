import { getEnv, isLocalUrl, whatsappWebhookUrl } from '@lps/config';
import { getActiveInstance, setConnection } from '@lps/db';
import { evolutionConfigured, getEvolutionAdmin } from '@lps/integrations';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { AddInstance, ConnectPanel, ConnectionRealtime, InstanceActions } from '@/components/connections/whatsapp-connect';
import { Avatar } from '@/components/crm/avatar';
import { Topbar } from '@/components/layout/topbar';
import { Card, Status, type Tone } from '@/components/ui';
import { authedDb } from '@/lib/auth';
import { WHATSAPP, whatsappConfigured } from '@/lib/connections';

const STATE_LABEL = { conectado: 'Conectado', conectando: 'Aguardando leitura do QR', desconectado: 'Desconectado' } as const;
const STATE_TONE: Record<keyof typeof STATE_LABEL, Tone> = { conectado: 'success', conectando: 'warning', desconectado: 'danger' };

function Warning({ tone, title, children }: { tone: 'warning' | 'destructive'; title: string; children?: ReactNode }) {
  return (
    <Card className={`flex items-start gap-3 p-4 text-sm ${tone === 'warning' ? 'border-warning/40' : 'border-destructive/40'}`}>
      <TriangleAlert className={`mt-0.5 size-4 shrink-0 ${tone === 'warning' ? 'text-warning' : 'text-destructive'}`} />
      <div>
        <p className="font-medium">{title}</p>
        {children && <p className="text-muted-foreground">{children}</p>}
      </div>
    </Card>
  );
}

async function WhatsAppConnection() {
  const db = await authedDb();
  const configured = evolutionConfigured() && whatsappConfigured();
  const admin = configured ? getEvolutionAdmin(await getActiveInstance(db)) : null;
  const overview = admin ? await admin.overview() : null;
  const reachable = !!overview?.reachable;
  const instance = overview?.instance ?? null;
  const state = instance?.state ?? 'desconectado';
  const instances = admin && reachable ? await admin.listInstances().catch(() => []) : [];

  // O estado salvo acompanha o real: o CRM e o menu nunca ficam com um estado velho.
  const { data: saved } = await db.from('whatsapp_connection').select('state, phone').eq('id', 1).maybeSingle();
  if (admin?.instanceName && reachable && (saved?.state !== state || (instance?.phone && saved?.phone !== instance.phone))) {
    await setConnection(db, { state, phone: instance?.phone ?? null, profileName: instance?.profileName ?? null, profilePicUrl: instance?.profilePicUrl ?? null, instance: admin.instanceName }, new Date());
  }
  // Webhook sempre apontado para este painel: se a URL mudou, corrige sozinho.
  const hookUrl = whatsappWebhookUrl(getEnv());
  if (admin && instance && hookUrl && (overview?.webhook?.url !== hookUrl || !overview.webhook.enabled)) {
    await admin.ensureWebhook(hookUrl).catch((e) => console.error('whatsapp_webhook', (e as Error).message));
  }

  // A Evolution remota só entrega mensagens num endereço público: sem isso, nada que chega entra no CRM.
  const hook = overview?.webhook ?? null;
  const evolutionRemote = !!process.env.EVOLUTION_URL && !isLocalUrl(process.env.EVOLUTION_URL);
  const webhookBroken = !!(admin && instance && reachable) && (!hook?.enabled || !hook.url || (evolutionRemote && isLocalUrl(hook.url)));

  const ready = configured && reachable;
  const hasInstance = !!admin?.instanceName;

  return (
    <div className="space-y-4">
      <ConnectionRealtime />
      {!configured && (
        <Warning tone="warning" title="Evolution não configurada">
          Preencha EVOLUTION_URL, EVOLUTION_API_KEY e WHATSAPP_WEBHOOK_SECRET no <code className="font-mono">.env</code>.
        </Warning>
      )}
      {overview && !reachable && <Warning tone="destructive" title="Servidor da Evolution fora do ar">{overview.error}</Warning>}
      {webhookBroken && (
        <Warning tone="destructive" title="As mensagens recebidas não estão chegando">
          A Evolution não tem um endereço público deste painel para entregar as mensagens. No Mac, rode o painel com{' '}
          <code className="font-mono">pnpm local</code> (ele abre o túnel e aponta o webhook sozinho) e depois use Importar últimos 2 dias.
        </Warning>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={instance?.profileName ?? 'WhatsApp'} src={instance?.profilePicUrl} size={56} seed="instancia" />
            <div className="space-y-1">
              <p className="text-base font-semibold">{instance?.profileName ?? (state === 'conectado' ? 'WhatsApp' : hasInstance ? 'Nenhum celular conectado' : 'Nenhuma instância')}</p>
              <p className="font-mono text-xs text-muted-foreground">{instance?.phone ?? '—'} · instância {admin?.instanceName || '—'}</p>
              {hasInstance && <Status tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Status>}
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {hasInstance && <InstanceActions state={state} configured={ready} />}
            <AddInstance disabled={!ready} existing={instances} current={admin?.instanceName ?? null} primary={!hasInstance} />
          </div>
        </div>
        {hasInstance && state !== 'conectado' && ready && (
          <div className="mt-6 border-t border-border pt-6">
            <ConnectPanel state={state} configured />
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ConexoesPage() {
  return (
    <>
      <Topbar crumbs={[{ label: 'Atendimento', href: '/painel/crm' }, { label: 'Conexões' }]} />
      <div className="mx-auto max-w-5xl p-4 lg:p-6">
        <p className="mb-5 text-sm text-muted-foreground">{WHATSAPP.label} · {WHATSAPP.provider} · {WHATSAPP.description}</p>
        <WhatsAppConnection />
      </div>
    </>
  );
}
