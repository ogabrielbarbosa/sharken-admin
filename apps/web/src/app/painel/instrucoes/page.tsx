import { Download, ExternalLink, Plug } from 'lucide-react';
import type { ReactNode } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Card, LinkButton } from '@/components/ui';
import { CopyButton } from '@/components/ui/copy-button';
import { APP_DOWNLOADS, LOOM_WEB_URL, MAC_UNBLOCK, SKILL_ZIP } from './content';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-medium">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
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

export default function InstrucoesPage() {
  const unzip = 'unzip ~/Downloads/create-page-sharken.zip -d ~/.claude/skills/';
  return (
    <>
      <Topbar crumbs={[{ label: 'Instruções' }]} />
      <main className="mx-auto max-w-4xl space-y-6 p-4 lg:p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Como vender com o Sharken</h1>
          <p className="text-sm text-muted-foreground">Instale a skill e baixe o aplicativo de gravação.</p>
        </div>

        <Section
          title="Skill create-page-sharken"
          description="Ensina o Claude a montar a página de um lead: puxa os dados pelo MCP, aplica no template, publica e devolve o link."
        >
          <div className="space-y-5">
            <LinkButton href={SKILL_ZIP} external>
              <Download />Baixar create-page-sharken.zip
            </LinkButton>

            <div className="space-y-3">
              <p className="text-sm font-medium">Antes: conecte o MCP</p>
              <p className="text-sm text-muted-foreground">
                A skill lê os leads pelo servidor MCP do Sharken. Se ainda não conectou, siga o passo a passo em Configurações › MCP.
              </p>
              <LinkButton href="/painel/configuracoes?aba=mcp" variant="outline">
                <Plug />Abrir Configurações › MCP
              </LinkButton>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">No claude.ai ou no app do Claude</p>
              <ol className="space-y-4">
                <Step n={1} title="Baixe o arquivo">
                  <p className="text-muted-foreground">Clique no botão acima. Não precisa descompactar.</p>
                </Step>
                <Step n={2} title="Abra as Skills">
                  <p className="text-muted-foreground">Configurações › Capacidades › Skills.</p>
                </Step>
                <Step n={3} title="Envie o zip">
                  <p className="text-muted-foreground">Clique em Enviar skill (Upload skill), escolha o create-page-sharken.zip e deixe a skill ativada.</p>
                </Step>
                <Step n={4} title="Use">
                  <p className="text-muted-foreground">Numa conversa nova, peça algo como “cria a página do lead qualificado do batch de dentistas em Campinas”.</p>
                </Step>
              </ol>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">No Claude Code</p>
              <ol className="space-y-4">
                <Step n={1} title="Descompacte na pasta de skills">
                  <CodeLine value={unzip} />
                </Step>
                <Step n={2} title="Reabra o Claude Code">
                  <p className="text-muted-foreground">A skill aparece sozinha. Peça a página do lead do mesmo jeito.</p>
                </Step>
              </ol>
            </div>
          </div>
        </Section>

        <Section title="Aplicativo Sharken Loom" description="Grava os vídeos para os leads. Baixe a versão do seu computador.">
          <div className="mb-5 space-y-3 rounded-card border border-border p-4">
            <p className="text-sm font-medium">Login</p>
            <p className="text-sm text-muted-foreground">
              Entre com o mesmo e-mail e a mesma senha que você usa aqui no admin.sharkenapps.com, tanto no aplicativo quanto no
              site. No site ficam os vídeos que você gravou, com o link de cada um.
            </p>
            <LinkButton href={LOOM_WEB_URL} external variant="outline">
              <ExternalLink />Abrir loom.sharkenapps.com
            </LinkButton>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {APP_DOWNLOADS.map((d, i) => (
              <div key={d.href} className="space-y-3 rounded-card border border-border p-4">
                <div className="space-y-2">
                  <LinkButton href={d.href} external>
                    <Download />{d.label}
                  </LinkButton>
                  <p className="text-xs text-muted-foreground">{d.detail}</p>
                </div>
                <p className="text-sm text-muted-foreground">{d.hint}</p>
                {i === 0 && <CodeLine value={MAC_UNBLOCK} />}
              </div>
            ))}
          </div>
        </Section>
      </main>
    </>
  );
}
