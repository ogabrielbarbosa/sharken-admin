import { secretMatches } from '@lps/config';
import { createAdminClient } from '@lps/db';
import { pageAccess } from '@lps/domain';
import { createServerClient } from '@/lib/supabase/server';

export type PageSite = {
  lead_id: string;
  slug: string;
  status: 'modelo' | 'removido';
  generator: 'template' | 'agente';
  html_path: string | null;
  published_at: string | null;
  sent_at: string | null;
  expires_at: string | null;
  content: unknown;
};

export type PageLookup =
  | { kind: 'missing' }
  | { kind: 'unavailable'; site: PageSite }
  | { kind: 'ok'; site: PageSite; capture: boolean; preview: boolean };

/** Captura (token) e prévia (Gabriel logado) enxergam a página mesmo sem publicação, sem abertura contada. */
export async function lookupPage(slug: string, captura: string | null | undefined): Promise<PageLookup> {
  const { data } = await createAdminClient()
    .from('sites')
    .select('lead_id, slug, status, generator, html_path, published_at, sent_at, expires_at, content')
    .eq('slug', slug)
    .maybeSingle();
  const site = data as PageSite | null;
  if (!site) return { kind: 'missing' };

  const capture = secretMatches(captura ?? undefined, process.env.CAPTURE_TOKEN);
  const owner = capture ? false : !!(await (await createServerClient()).auth.getUser()).data.user;
  if (capture || owner) return { kind: 'ok', site, capture, preview: true };
  if (pageAccess(site, new Date()) !== 'ok') return { kind: 'unavailable', site };
  return { kind: 'ok', site, capture: false, preview: false };
}
