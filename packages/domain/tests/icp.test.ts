import { describe, expect, it } from 'vitest';
import { DEFAULT_CRITERIA as c } from '../src/criteria';
import { checkEliminatory, scoreLead } from '../src/icp';
import { canAdvance } from '../src/review';

const now = new Date('2026-11-06T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const lead = (over = {}) => ({
  reviews_count: 20, rating: 4, images_count: 3, instagram_last_post_at: daysAgo(90),
  description: 'Banho e tosa', site_data: null, phone_e164: '5519987654321', email: null, franchise: false, ...over,
}) as never;

describe('scoreLead', () => {
  it('soma 100 quando todos os critérios batem no limite', () => {
    const out = scoreLead(lead(), c, now);
    expect(out.score).toBe(100);
    expect(out.reasons.map((r) => r.points)).toEqual([25, 20, 20, 20, 15]);
    expect(out.reasons.every((r) => r.met)).toBe(true);
  });
  it('não pontua logo abaixo de cada limite', () => {
    const out = scoreLead(lead({ reviews_count: 19, rating: 3.9, images_count: 2, instagram_last_post_at: daysAgo(91), description: null }), c, now);
    expect(out.score).toBe(0);
    expect(out.reasons.every((r) => !r.met)).toBe(true);
  });
  it('usa os critérios editados', () => {
    expect(scoreLead(lead(), { ...c, minReviews: 50 }, now).score).toBe(75);
  });
  it('aceita o texto do site como descrição', () => {
    const out = scoreLead(lead({ description: null, site_data: { text: 'Serviços de banho' } }), c, now);
    expect(out.score).toBe(100);
  });
});

describe('checkEliminatory', () => {
  const ctx = { blocked: false, lastContactAt: null, now };
  it('deixa passar lead sem impedimentos, mesmo sem site', () => {
    expect(checkEliminatory(lead(), ctx, c)).toEqual({ passed: true, reasons: [] });
  });
  it('barra com o motivo escrito', () => {
    expect(checkEliminatory(lead({ phone_e164: null }), ctx, c).reasons[0]).toMatch(/sem celular e sem e-mail/i);
    expect(checkEliminatory(lead({ franchise: true }), ctx, c).reasons[0]).toMatch(/franquia/i);
    expect(checkEliminatory(lead(), { ...ctx, blocked: true }, c).reasons[0]).toMatch(/não contatar/i);
  });
  it('aceita só e-mail como forma de contato', () => {
    expect(checkEliminatory(lead({ phone_e164: null, email: 'a@b.com.br' }), ctx, c).passed).toBe(true);
  });
  it('não descarta negócio marcado como fechado nem sem franquia definida', () => {
    expect(checkEliminatory(lead({ is_open: false, franchise: null }), ctx, c).passed).toBe(true);
  });
  it('respeita o prazo de recontato', () => {
    const recent = checkEliminatory(lead(), { ...ctx, lastContactAt: new Date(daysAgo(179)) }, c);
    expect(recent.passed).toBe(false);
    expect(checkEliminatory(lead(), { ...ctx, lastContactAt: new Date(daysAgo(181)) }, c).passed).toBe(true);
  });
});

describe('canAdvance', () => {
  it('exige motivo em melhorar site', () => {
    expect(canAdvance({ flow: 'melhorar_site', reason: null }).allowed).toBe(false);
    expect(canAdvance({ flow: 'melhorar_site', reason: '   ' }).allowed).toBe(false);
    expect(canAdvance({ flow: 'melhorar_site', reason: 'é lento' }).allowed).toBe(true);
  });
  it('não pede motivo em sem site', () => {
    expect(canAdvance({ flow: 'sem_site', reason: null }).allowed).toBe(true);
  });
});
