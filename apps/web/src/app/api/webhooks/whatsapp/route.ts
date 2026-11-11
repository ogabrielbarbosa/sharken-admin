import { secretMatches } from '@lps/config';
import { createAdminClient, ingestEvent } from '@lps/db';
import { getWhatsAppProvider } from '@lps/integrations';

export async function POST(request: Request) {
  if (!secretMatches(new URL(request.url).searchParams.get('token'), process.env.WHATSAPP_WEBHOOK_SECRET)) {
    return Response.json({ error: 'não autorizado' }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch (e) {
    console.error('whatsapp_json_invalido', (e as Error).message);
    return Response.json({ ok: true });
  }

  // Se algum evento falhar, responde 500 para a Evolution tentar de novo: a ingestão é idempotente
  // (external_id único e messageExists), então reprocessar os eventos que já deram certo é seguro.
  let failed = false;
  try {
    const db = createAdminClient();
    for (const event of getWhatsAppProvider().normalize(raw)) {
      try {
        await ingestEvent(db, event, new Date());
      } catch (e) {
        failed = true;
        console.error('whatsapp_erro_evento', event.kind, (e as Error).message);
      }
    }
  } catch (e) {
    failed = true;
    console.error('whatsapp_erro', (e as Error).message);
  }
  return failed ? Response.json({ ok: false }, { status: 500 }) : Response.json({ ok: true });
}
