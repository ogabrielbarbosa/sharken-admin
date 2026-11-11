import type { SiteContent, VideoStatus } from '@lps/domain';
import type { Db } from './client';

export type SiteScreenshots = { mobile: string; desktop: string };
export type SiteRecord = {
  id: string;
  lead_id: string;
  slug: string;
  content: SiteContent;
  status: 'modelo' | 'removido';
  expires_at: string | null;
  generator: 'template' | 'agente';
  html_path: string | null;
  screenshots: SiteScreenshots | null;
  published_at: string | null;
  sent_at: string | null;
  attempts: number;
  instruction: string | null;
};
export type VideoRecord = { lead_id: string; status: VideoStatus; progress: number; storage_path: string | null; duration_seconds: number | null; error: string | null };

export async function getSite(db: Db, leadId: string): Promise<SiteRecord | null> {
  const { data } = await db.from('sites').select().eq('lead_id', leadId).maybeSingle();
  return data as SiteRecord | null;
}

export async function listSites(db: Db, leadIds: string[]): Promise<Map<string, SiteRecord>> {
  if (!leadIds.length) return new Map();
  const { data } = await db.from('sites').select().in('lead_id', leadIds);
  return new Map((data as SiteRecord[]).map((s) => [s.lead_id, s]));
}

export async function saveSite(db: Db, site: { lead_id: string; slug: string; content: SiteContent; expires_at: string | null }) {
  const { error } = await db
    .from('sites')
    .upsert({ ...site, status: 'modelo', generator: 'template', html_path: null, screenshots: null }, { onConflict: 'lead_id' });
  if (error) throw new Error(error.message);
}

/** Página escrita pelo agente. Fica sem validade e sem publicação até a aprovação em Material. */
export async function saveAgentSite(
  db: Db,
  site: { lead_id: string; slug: string; html_path: string; screenshots: SiteScreenshots; attempts: number; instruction: string | null },
) {
  const { error } = await db
    .from('sites')
    .upsert(
      { ...site, content: {}, status: 'modelo', generator: 'agente', expires_at: null, published_at: null },
      { onConflict: 'lead_id' },
    );
  if (error) throw new Error(error.message);
}

export async function getVideo(db: Db, leadId: string): Promise<VideoRecord | null> {
  const { data } = await db.from('videos').select().eq('lead_id', leadId).maybeSingle();
  return data as VideoRecord | null;
}

export async function listVideos(db: Db, leadIds: string[]): Promise<Map<string, VideoRecord>> {
  if (!leadIds.length) return new Map();
  const { data } = await db.from('videos').select().in('lead_id', leadIds);
  return new Map((data as VideoRecord[]).map((v) => [v.lead_id, v]));
}

export async function saveVideo(db: Db, leadId: string, patch: Partial<VideoRecord>) {
  const { error } = await db.from('videos').upsert({ lead_id: leadId, ...patch }, { onConflict: 'lead_id' });
  if (error) throw new Error(error.message);
}
