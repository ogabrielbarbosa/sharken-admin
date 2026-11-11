import { describe, expect, it } from 'vitest';
import { applyReviewFilter, countByOption, cycleOption, parseReviewFilter, serializeReviewFilter } from '../src/review-filter';

const now = new Date('2026-11-11T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const lead = (over = {}) => ({
  id: 'x', name: 'Clínica', score: 80, reviews_count: 50, rating: 4.9, images_count: 5,
  site_status: 'funcionando', flow: 'melhorar_site', reason: 'site lento',
  instagram_url: null, instagram_last_post_at: null, ...over,
}) as never;

const leads = [
  lead({ id: 'a', site_status: 'sem_link', flow: 'sem_site', reason: null, reviews_count: 10, score: 60 }),
  lead({ id: 'b', reviews_count: 300, rating: 4.6, images_count: 0, score: 80 }),
  lead({ id: 'c', site_status: 'somente_social', flow: 'sem_site', reason: null, instagram_url: 'https://instagram.com/c', instagram_last_post_at: daysAgo(3), score: 100 }),
  lead({ id: 'd', reason: null, rating: 5, score: 80 }),
  lead({ id: 'e', site_status: 'fora_do_ar', flow: 'sem_site', reason: null, instagram_url: 'https://instagram.com/e', instagram_last_post_at: daysAgo(60), score: 40 }),
];
const ids = (f: Record<string, string>) => applyReviewFilter(leads, parseReviewFilter(f), now).map((l: { id: string }) => l.id);

describe('parseReviewFilter', () => {
  it('ignora valores vazios ou inválidos', () => {
    expect(parseReviewFilter({ site: 'xyz', minAvaliacoes: '', minNota: 'abc', ordem: 'nada' })).toEqual({ groups: {}, mins: {}, ordem: 'pontuacao' });
  });
  it('lê incluir, excluir e vírgula decimal', () => {
    const f = parseReviewFilter({ site: 'funcionando,-fora_do_ar', instagram: '-sem', minNota: '4,8' });
    expect(f.groups.site).toEqual({ include: ['funcionando'], exclude: ['fora_do_ar'] });
    expect(f.groups.instagram).toEqual({ include: [], exclude: ['sem'] });
    expect(f.mins.minNota).toBe(4.8);
  });
  it('vai e volta pela URL sem perder nada', () => {
    const qs = 'site=sem_link%2C-funcionando&instagram=ativo%2Cparado&minAvaliacoes=20&ordem=nota';
    expect(serializeReviewFilter(parseReviewFilter(Object.fromEntries(new URLSearchParams(qs))))).toBe(qs);
  });
});

describe('applyReviewFilter', () => {
  it('inclui várias opções do mesmo grupo', () => {
    expect(ids({ site: 'funcionando,fora_do_ar' })).toEqual(['b', 'd', 'e']);
  });
  it('exclui as opções marcadas', () => {
    expect(ids({ site: '-funcionando' })).toEqual(['c', 'a', 'e']);
  });
  it('combina grupos e mínimos', () => {
    expect(ids({ site: '-funcionando', instagram: '-sem' })).toEqual(['c', 'e']);
    expect(ids({ minAvaliacoes: '40', minNota: '4,8' })).toEqual(['c', 'd', 'e']);
    expect(ids({ minFotos: '1' })).toEqual(['c', 'd', 'a', 'e']);
  });
  it('separa Instagram ativo, parado e não encontrado', () => {
    expect(ids({ instagram: 'ativo' })).toEqual(['c']);
    expect(ids({ instagram: 'parado' })).toEqual(['e']);
    expect(ids({ instagram: 'sem' })).toEqual(['b', 'd', 'a']);
  });
  it('motivo só vale para site funcionando: incluir tira os outros, excluir mantém', () => {
    expect(ids({ motivo: 'com' })).toEqual(['b']);
    expect(ids({ motivo: '-sem' })).toEqual(['c', 'b', 'a', 'e']);
  });
  it('inclui uma opção e exclui outra no mesmo grupo', () => {
    expect(ids({ site: 'sem_link,fora_do_ar,-funcionando' })).toEqual(['a', 'e']);
    expect(ids({ instagram: '-sem', site: '-fora_do_ar' })).toEqual(['c']);
  });
  it('ordena por avaliações', () => {
    expect(ids({ ordem: 'avaliacoes' })).toEqual(['b', 'c', 'd', 'e', 'a']);
  });
});

describe('cycleOption', () => {
  it('inclui, depois exclui, depois desmarca, sem mexer nas outras opções', () => {
    const one = cycleOption(undefined, 'sem_link');
    expect(one).toEqual({ include: ['sem_link'], exclude: [] });
    const two = cycleOption(one, 'somente_social');
    expect(cycleOption(two, 'somente_social')).toEqual({ include: ['sem_link'], exclude: ['somente_social'] });
    expect(cycleOption(cycleOption(one, 'sem_link'), 'sem_link')).toBeUndefined();
  });
});

describe('countByOption', () => {
  it('conta quantos leads caem em cada opção', () => {
    const c = countByOption(leads, now);
    expect(c.site).toEqual({ sem_link: 1, funcionando: 2, somente_social: 1, fora_do_ar: 1 });
    expect(c.motivo).toEqual({ com: 1, sem: 1 });
  });
});
