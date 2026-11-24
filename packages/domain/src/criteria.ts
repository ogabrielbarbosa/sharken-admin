export type Criteria = {
  minReviews: number;
  minRating: number;
  minPhotos: number;
  instagramActiveDays: number;
  recontactDays: number;
  /** Marcados à mão no batch: quem não atende vai para descartado. Batches antigos não têm (não exige). */
  requireInstagramActive?: boolean;
  requirePhone?: boolean;
  /** Batch a partir de um perfil: lead sem celular e sem e-mail fica. Nos outros, é descartado. */
  allowNoContact?: boolean;
  site?: SiteRequirement;
};

export type SiteRequirement = 'qualquer' | 'sem_site' | 'com_site';

export const DEFAULT_CRITERIA: Criteria = {
  minReviews: 20,
  minRating: 4,
  minPhotos: 3,
  instagramActiveDays: 90,
  recontactDays: 180,
};
