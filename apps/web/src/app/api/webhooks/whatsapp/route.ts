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

  try {
    const db = createAdminClient();
    for (const event of getWhatsAppProvider().normalize(raw)) {
      try {
        await ingestEvent(db, event, new Date());
      } catch (e) {
        console.error('whatsapp_erro_evento', event.kind, (e as Error).message);
      }
    }
  } catch (e) {
    console.error('whatsapp_erro', (e as Error).message);
  }
  return Response.json({ ok: true });
}
