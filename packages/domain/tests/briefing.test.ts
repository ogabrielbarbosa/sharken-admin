import { describe, expect, it } from 'vitest';
import { buildBriefing } from '../src/briefing';
import type { LeadAsset } from '../src/completar';
import { completeLead, improveLead } from './fixtures/leads';

const asset = (over: Partial<LeadAsset>): LeadAsset => ({
  id: 'a', created_at: '2026-11-01', lead_id: 'l1', kind: 'link', label: null, url: null, storage_path: null, mime_type: null,
  body: null, extracted_text: null, extracted_images: [], status: 'pronto', error: null, ...over,
});

const assets: LeadAsset[] = [
  asset({ id: 'a1', kind: 'link', url: 'https://instagram.com/patinhas', label: 'Instagram do dono', extracted_text: 'Banho e tosa a partir de R$ 50', extracted_images: ['https://img/x.jpg'] }),
  asset({ id: 'a2', kind: 'arquivo', label: 'tabela.pdf', status: 'erro', error: 'falhou', extracted_text: 'TEXTO DO ERRO' }),
  asset({ id: 'a3', kind: 'texto', label: 'Nota', body: 'Dono quer destaque para o plano mensal' }),
];

describe('buildBriefing', () => {
  const md = buildBriefing(completeLead, assets);

  it('começa com o nome e traz as seções', () => {
    expect(md.startsWith('# Pet Shop Patinhas')).toBe(true);
    for (const h of ['## Dados', '## Material', '## Fotos', '## Links']) expect(md).toContain(h);
  });
  it('lista as imagens do Instagram salvas no R2, com o post e a legenda', () => {
    const lead = { ...completeLead, instagram_media: [
      { kind: 'perfil' as const, url: 'https://media/perfil.jpg', post_url: null, caption: null, taken_at: null },
      { kind: 'post' as const, url: 'https://media/post-01.jpg', post_url: 'https://instagram.com/p/a', caption: 'Banho\ne tosa', taken_at: null },
    ] };
    const out = buildBriefing(lead, []);
    expect(out).toContain('## Instagram\n- Foto de perfil: https://media/perfil.jpg\n- https://media/post-01.jpg (post: https://instagram.com/p/a) · Banho e tosa');
    expect(md).not.toContain('\n## Instagram\n');
  });
  it('só tem Motivo no fluxo melhorar_site', () => {
    expect(md).not.toContain('## Motivo');
    const improved = buildBriefing(improveLead, []);
    expect(improved).toContain('## Motivo');
    expect(improved).toContain('não funciona bem no celular');
  });
  it('põe texto extraído e notas no Material, sem o item com erro', () => {
    expect(md).toContain('Banho e tosa a partir de R$ 50');
    expect(md).toContain('Dono quer destaque para o plano mensal');
    expect(md).not.toContain('TEXTO DO ERRO');
  });
  it('lista as fotos do lead e não o caminho interno das imagens do material', () => {
    const withPath = [asset({ extracted_images: ['lead/extraidas/a-0.jpg'] })];
    const out = buildBriefing(completeLead, withPath);
    expect(out).not.toContain('lead/extraidas/a-0.jpg');
    expect(out).not.toContain('Imagens do material');
    expect(out).toContain('## Fotos');
    expect(out).toContain('- https://img/1.jpg');
  });
  it('com resolvedor, põe as imagens do material numa seção própria com o link devolvido', () => {
    const withPath = [asset({ extracted_images: ['lead/extraidas/a-0.jpg'] })];
    const out = buildBriefing(completeLead, withPath, (p) => `https://signed/${p}`);
    expect(out).toContain('## Imagens do material (links temporários, não usar na página)\n- https://signed/lead/extraidas/a-0.jpg');
    expect(out).not.toContain('- lead/extraidas/a-0.jpg');
    expect(out).toContain('- https://img/1.jpg');
  });
  it('lista site, Instagram e links acrescentados', () => {
    const out = buildBriefing({ ...completeLead, website_url: 'https://patinhas.com', instagram_url: 'https://instagram.com/pat' }, assets);
    expect(out).toContain('Site: https://patinhas.com');
    expect(out).toContain('Instagram: https://instagram.com/pat');
    expect(out).toContain('https://instagram.com/patinhas');
  });
  it('corta textos longos em 4.000 caracteres', () => {
    const out = buildBriefing(completeLead, [asset({ extracted_text: 'a'.repeat(9000) })]);
    expect(out).toContain('a'.repeat(4000));
    expect(out).not.toContain('a'.repeat(4001));
  });
  it('não quebra sem material nem fotos', () => {
    const out = buildBriefing({ ...completeLead, photos: [] }, []);
    expect(out).not.toContain('## Material');
    expect(out).not.toContain('## Fotos');
  });
});
