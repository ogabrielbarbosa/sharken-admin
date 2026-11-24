import type { InstagramMedia } from './instagram-media';
import type { LeadReview } from './apify-mapper';
import type { Criteria } from './criteria';
import type { Enrichment } from './enrichment';
import type { Place } from './places';
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
  workspace_id: string;
  /** Onde o batch começou a buscar. Depois dá para rodar a outra fonte em cima dele. */
  source: BatchSource | 'manual';
  /** Cidades ("Cidade, UF"). Vazio nos batches antigos: vale `location`. */
  locations: string[];
  /** Cidades fora do Brasil, com país e coordenadas (migração 0033). Vazio: as cidades são do Brasil. */
  places?: Place[];
  /** Variações do nicho e da localização usadas na busca do Instagram pelo Google. */
  niche_terms: string[];
  location_terms: string[];
  /** Execuções no Apify da busca do Instagram: busca no Google e leitura dos perfis. */
  google_run_id: string | null;
  profiles_run_id: string | null;
};

export type BatchSource = 'instagram' | 'maps';

export type SiteSignal = { key: string; label: string; ok: boolean };

export type SiteData = {
  title: string | null;
  description: string | null;
  headings: string[];
  text: string;
  images: string[];
  themeColor: string | null;
  logo: string | null;
  /** E-mails e links de WhatsApp da página (mailto, texto, wa.me). Leads antigos não têm. */
  emails?: string[];
  whatsappLinks?: string[];
  /** Links para o Instagram que aparecem na página. Leads antigos não têm. */
  instagramLinks?: string[];
};

export type ScoreReason = { label: string; points: number; met: boolean };

export type Lead = {
  id: string;
  created_at: string;
  updated_at: string;
  batch_id: string | null;
  /** Null quando o lead veio só do Instagram. */
  place_id: string | null;
  /** Calculados pelo banco a partir de instagram_url e website_url (migração 0023). */
  instagram_handle?: string | null;
  site_domain?: string | null;
  /** Membro responsável pelo lead (independente do responsável do atendimento). */
  responsible_id?: string | null;
  name: string;
  business_type: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
  email: string | null;
  enrichment: Enrichment | null;
  franchise: boolean | null;
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
  /** Link do Google Meu Negócio colado à mão (migração 0034). */
  maps_url?: string | null;
  instagram_url: string | null;
  instagram_last_post_at: string | null;
  instagram_media: InstagramMedia[];
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
  page_url: string | null;
  loom_url: string | null;
  stage_changed_at: string;
};
