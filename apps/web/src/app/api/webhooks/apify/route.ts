import { secretMatches } from '@lps/config';
import { after } from 'next/server';
import { parseWebhookEvent } from '@lps/integrations';
import { handleGoogleResult, handleInstagramResult, handleMapsResult, handleNetworkResult, handleProfilesResult } from '@lps/integrations';

/** Centenas de perfis levam minutos para gravar. */
export const maxDuration = 300;

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
  else if (kind === 'network') await handleNetworkResult(batchId, event);
  // Responde antes de gravar: se demorasse, o Apify reenviaria o aviso e os leads entrariam em dobro.
  else if (kind === 'profiles') after(() => handleProfilesResult(batchId, event));
  else await handleMapsResult(batchId, event);
  return Response.json({ ok: true });
}
