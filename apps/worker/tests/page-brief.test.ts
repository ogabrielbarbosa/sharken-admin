import type { Lead, LeadAsset } from '@lps/domain';
import { describe, expect, it } from 'vitest';
import { buildPageBrief } from '../src/page-brief';

const lead = (patch: Partial<Lead> = {}): Lead =>
  ({
    id: 'lead-1',
    name: 'Padaria Sol',
    business_type: 'padaria',
    categories: ['Padaria'],
    phone_e164: '+5512999990000',
    address: 'Rua A, 10',
    city: 'São José dos Campos',
    description: 'Pães artesanais',
    rating: 4.8,
    reviews_count: 120,
    reviews: [{ text: 'Pão ótimo', stars: 5, author: 'Maria Silva', name: 'Maria Silva' }],
    photos: [],
    flow: 'sem_site',
    reason: 'não funciona bem no celular',
    comment: 'comentário interno',
    site_data: null,
    ...patch,
  }) as unknown as Lead;

const asset = (patch: Partial<LeadAsset>): LeadAsset =>
  ({
    id: 'a',
    lead_id: 'lead-1',
    kind: 'texto',
    label: null,
    url: null,
    storage_path: null,
    mime_type: null,
    body: null,
    extracted_text: null,
    extracted_images: [],
    status: 'pronto',
    error: null,
    created_at: '',
    ...patch,
  }) as LeadAsset;

describe('buildPageBrief', () => {
  it('não inclui autores das avaliações', () => {
    const brief = buildPageBrief(lead(), [], []);
    expect(brief.avaliacoes).toEqual([{ texto: 'Pão ótimo', estrelas: 5 }]);
    expect(JSON.stringify(brief)).not.toContain('Maria Silva');
  });

  it('inclui o texto extraído dos itens prontos e ignora os com erro', () => {
    const brief = buildPageBrief(
      lead(),
      [
        asset({ id: 'a1', label: 'Instagram', extracted_text: 'Fornada às 6h' }),
        asset({ id: 'a2', status: 'erro', extracted_text: 'texto do erro' }),
        asset({ id: 'a3', extracted_text: null }),
      ],
      [],
    );
    expect(brief.material).toHaveLength(1);
    expect(brief.material[0]).toMatchObject({ origem: 'Instagram', texto: 'Fornada às 6h' });
    expect(JSON.stringify(brief)).not.toContain('texto do erro');
  });

  it('inclui o motivo só no fluxo melhorar_site', () => {
    expect(buildPageBrief(lead(), [], []).motivo).toBeUndefined();
    expect(buildPageBrief(lead({ flow: 'melhorar_site' }), [], []).motivo).toBe('não funciona bem no celular');
  });

  it('não leva o comentário interno e lista as fotos recebidas', () => {
    const brief = buildPageBrief(lead(), [], ['https://x.supabase.co/a.jpg']);
    expect(JSON.stringify(brief)).not.toContain('comentário interno');
    expect(brief.fotos).toEqual(['https://x.supabase.co/a.jpg']);
    expect(brief.negocio.telefone).toBe('+5512999990000');
  });
});
