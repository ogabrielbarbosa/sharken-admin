import { secretMatches } from '@lps/config';
import { parseWebhookEvent } from '@lps/integrations';
import { handleInstagramResult, handleMapsResult } from '@/lib/capture';

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!secretMatches(url.searchParams.get('secret'), process.env.WEBHOOK_SECRET)) {
    return Response.json({ error: 'não autorizado' }, { status: 401 });
  }
  const batchId = url.searchParams.get('batch');
  if (!batchId) return Response.json({ error: 'batch ausente' }, { status: 400 });

  const event = parseWebhookEvent(await request.json());
  if (url.searchParams.get('kind') === 'instagram') await handleInstagramResult(batchId, event);
  else await handleMapsResult(batchId, event);
  return Response.json({ ok: true });
}
