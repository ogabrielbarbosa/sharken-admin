import { secretMatches } from '@lps/config';
import { parseWebhookEvent } from '@lps/integrations';
import { handleGoogleResult, handleInstagramResult, handleMapsResult, handleProfilesResult } from '@lps/integrations';

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!secretMatches(url.searchParams.get('secret'), process.env.WEBHOOK_SECRET)) {
    return Response.json({ error: 'não autorizado' }, { status: 401 });
  }
  const batchId = url.searchParams.get('batch');
  if (!batchId) return Response.json({ error: 'batch ausente' }, { status: 400 });

  const event = parseWebhookEvent(await request.json());
  const kind = url.searchParams.get('kind');
  if (kind === 'instagram') await handleInstagramResult(batchId, event);
  else if (kind === 'google') await handleGoogleResult(batchId, event);
  else if (kind === 'profiles') await handleProfilesResult(batchId, event);
  else await handleMapsResult(batchId, event);
  return Response.json({ ok: true });
}
