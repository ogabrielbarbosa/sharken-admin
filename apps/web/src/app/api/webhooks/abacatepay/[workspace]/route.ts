import { secretMatches } from '@lps/config';
import { applyAbacateEvent, createAdminClient, getWorkspaceBilling, scopeDb } from '@lps/db';
import type { AbacateEvent } from '@lps/domain';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Webhook da AbacatePay de um workspace. Cada workspace tem o seu, com segredo próprio, registrado quando a
 * chave é salva em Configurações › Pagamentos. O segredo chega na URL (`webhookSecret`) e no header.
 */
export async function POST(request: Request, { params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  if (!UUID.test(workspace)) return Response.json({ error: 'não autorizado' }, { status: 401 });
  const db = createAdminClient();
  const billing = await getWorkspaceBilling(db, workspace);
  const provided = new URL(request.url).searchParams.get('webhookSecret') ?? request.headers.get('x-webhook-secret');
  if (!billing || !secretMatches(provided, billing.webhook_secret)) return Response.json({ error: 'não autorizado' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as AbacateEvent | null;
  if (!body?.event || !body.data) return Response.json({ ok: true });
  // Evento do Modo Teste com chave de produção (ou o contrário): é de outro webhook da mesma conta.
  if (typeof body.devMode === 'boolean' && body.devMode !== billing.dev_mode) return Response.json({ ok: true, result: 'ignorado' });

  const result = await applyAbacateEvent(scopeDb(db, workspace), body);
  return Response.json({ ok: true, result });
}
