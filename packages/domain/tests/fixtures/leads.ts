import type { Lead } from '../../src/types';

const base: Lead = {
  id: 'l1', created_at: '2026-11-01', updated_at: '2026-11-01', batch_id: 'b1', place_id: 'p1',
  name: 'Pet Shop Patinhas', business_type: 'Pet shop', phone_raw: '(19) 98765-4321', phone_e164: '5519987654321',
  address: 'Rua Barão de Jaguara, 1020, Campinas', city: 'Campinas', is_open: true, rating: 4.8, reviews_count: 132,
  images_count: 24, description: 'Banho e tosa com carinho', categories: ['Pet shop'], photos: ['https://img/1.jpg', 'https://img/2.jpg', 'https://img/3.jpg'],
  reviews: [{ text: 'Atendimento ótimo', stars: 5 }], website_url: null, instagram_url: null, instagram_last_post_at: null,
  site_status: 'sem_link', site_checks: [], site_data: null, site_signals: null, flow: 'sem_site', summary: null, reason: null,
  comment: null, score: 86, score_reasons: null, stage: 'revisar', exit_reason: null, needs_data: false, error: null,
  contacted_at: null, follow_up_at: null, responded_at: null, sold_at: null,
  page_url: null, loom_url: null, stage_changed_at: '2026-01-01T00:00:00Z',
};

export const completeLead: Lead = base;
export const improveLead: Lead = {
  ...base, id: 'l2', place_id: 'p2', name: 'Clínica Sorriso', business_type: 'Dentista', categories: ['Dentista'], flow: 'melhorar_site',
  site_status: 'funcionando', website_url: 'https://sorriso.com.br', reason: 'não funciona bem no celular',
  site_data: { title: 'Clínica Sorriso', description: null, headings: ['Implantes', 'Clareamento'], text: 'Implantes e clareamento dental.', images: ['https://sorriso.com.br/a.jpg'], themeColor: '#0055aa', logo: null },
};
export const noReviewsLead: Lead = { ...base, id: 'l3', place_id: 'p3', reviews: [], reviews_count: 0 };
export const noPhotosLead: Lead = { ...base, id: 'l4', place_id: 'p4', photos: [], images_count: 0 };
export const noDescriptionLead: Lead = { ...base, id: 'l5', place_id: 'p5', description: null };
export const specialCharsLead: Lead = { ...base, id: 'l6', place_id: 'p6', name: 'Pão & Café "São João" <Centro>' };
export const allFixtures = [completeLead, improveLead, noReviewsLead, noPhotosLead, noDescriptionLead, specialCharsLead];
