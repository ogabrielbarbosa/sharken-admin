import type { LeadReview } from './apify-mapper';
import type { Criteria } from './criteria';
import type { LeadStage } from './stages';

export type Flow = 'sem_site' | 'melhorar_site';
export type SiteStatus = 'sem_link' | 'somente_social' | 'fora_do_ar' | 'funcionando';
export type BatchStatus = 'buscando' | 'analisando' | 'concluido' | 'erro';

export type Batch = {
  id: string;
  created_at: string;
  location: string;
  location_key: string;
  business_type: string;
  quantity: number;
  criteria: Criteria;
  status: BatchStatus;
  error: string | null;
  apify_run_id: string | null;
  instagram_run_id: string | null;
};

export type SiteSignal = { key: string; label: string; ok: boolean };

export type SiteData = {
  title: string | null;
  description: string | null;
  headings: string[];
  text: string;
  images: string[];
  themeColor: string | null;
  logo: string | null;
};

export type ScoreReason = { label: string; points: number; met: boolean };

export type Lead = {
  id: string;
  created_at: string;
  updated_at: string;
  batch_id: string | null;
  place_id: string;
  name: string;
  business_type: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
  address: string | null;
  city: string | null;
  is_open: boolean;
  rating: number | null;
  reviews_count: number;
  images_count: number;
  description: string | null;
  categories: string[];
  photos: string[];
  reviews: LeadReview[];
  website_url: string | null;
  instagram_url: string | null;
  instagram_last_post_at: string | null;
  site_status: SiteStatus | null;
  site_checks: unknown[];
  site_data: SiteData | null;
  site_signals: SiteSignal[] | null;
  flow: Flow | null;
  summary: string | null;
  reason: string | null;
  comment: string | null;
  score: number | null;
  score_reasons: ScoreReason[] | null;
  stage: LeadStage;
  exit_reason: string | null;
  needs_data: boolean;
  error: string | null;
  contacted_at: string | null;
  follow_up_at: string | null;
  responded_at: string | null;
  sold_at: string | null;
};
