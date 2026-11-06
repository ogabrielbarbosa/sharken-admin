import { describe, expect, it } from 'vitest';
import { buildWhatsAppLink, renderMessage, selectFirstMessage, type MessageTemplates } from '../src/messages';
import { canContact, isFollowUpDue } from '../src/contact-rules';
import { blockEntry } from '../src/contact-rules';
import { completeLead, improveLead } from './fixtures/leads';

const templates: MessageTemplates = {
  sem_site: 'Oi [nome do negócio] em [cidade]: [link]',
  fora_do_ar: 'Tentei abrir o site da [nome do negócio]: [link]',
  melhorar_site: 'Site da [nome do negócio]: [motivo]. [link]',
  follow_up: 'De novo: [link]',
};
const vars = { link: 'https://x.co/p/a' };
const now = new Date('2026-11-06T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe('buildWhatsAppLink', () => {
  it('mantém &, acentos e quebras de linha', () => {
    const text = 'Oi, Pão & Café!\nVeja: https://x.co/p/a';
    const link = buildWhatsAppLink('5511987654321', text);
    expect(link.startsWith('https://wa.me/5511987654321?text=')).toBe(true);
    expect(new URL(link).searchParams.get('text')).toBe(text);
  });
});

describe('renderMessage', () => {
  it('preenche os campos', () => {
    expect(renderMessage('Oi [nome do negócio]', { nome: 'Pet', cidade: '', tipo: '', motivo: '', link: '' })).toBe('Oi Pet');
  });
  it('lança erro se um campo ficar sem valor', () => {
    expect(() => renderMessage('Oi [cidade]', { nome: '', cidade: '', tipo: '', motivo: '', link: '' })).toThrow(/cidade/);
    expect(() => renderMessage('Oi [desconhecido]', { nome: 'x', cidade: 'x', tipo: 'x', motivo: 'x', link: 'x' })).toThrow(/desconhecido/);
  });
});

describe('selectFirstMessage', () => {
  it('usa o modelo do fluxo', () => {
    expect(selectFirstMessage(completeLead, templates, vars)).toBe('Oi Pet Shop Patinhas em Campinas: https://x.co/p/a');
  });
  it('usa o modelo próprio para site fora do ar', () => {
    expect(selectFirstMessage({ ...completeLead, site_status: 'fora_do_ar' }, templates, vars)).toContain('Tentei abrir');
  });
  it('coloca o motivo em melhorar site', () => {
    expect(selectFirstMessage(improveLead, templates, vars)).toContain('não funciona bem no celular');
  });
  it('nunca usa o comentário interno', () => {
    expect(selectFirstMessage({ ...improveLead, comment: 'Dona Carla' }, templates, vars)).not.toContain('Carla');
  });
});

describe('canContact', () => {
  const lead = { ...completeLead, stage: 'abordar' as const };
  const ctx = { blocked: false, now, lastContactAt: null };
  it('libera lead em Abordar', () => expect(canContact(lead, ctx).allowed).toBe(true));
  it('nega lead bloqueado', () => expect(canContact(lead, { ...ctx, blocked: true }).allowed).toBe(false));
  it('nega fora de Abordar', () => expect(canContact({ ...lead, stage: 'revisar' }, ctx).allowed).toBe(false));
  it('nega sem celular', () => expect(canContact({ ...lead, phone_e164: null }, ctx).allowed).toBe(false));
  it('nega quando o mesmo telefone foi contatado há menos de 180 dias', () => {
    expect(canContact(lead, { ...ctx, lastContactAt: new Date(hoursAgo(24 * 179)) }).allowed).toBe(false);
    expect(canContact(lead, { ...ctx, lastContactAt: new Date(hoursAgo(24 * 181)) }).allowed).toBe(true);
  });
  it('libera follow-up de lead aguardando', () => {
    expect(canContact({ ...lead, stage: 'aguardando' }, ctx, 'follow_up').allowed).toBe(true);
    expect(canContact({ ...lead, stage: 'follow_up_feito' }, ctx, 'follow_up').allowed).toBe(false);
  });
});

describe('isFollowUpDue', () => {
  const aguardando = { stage: 'aguardando' as const };
  it('vence ao completar 3 dias', () => {
    expect(isFollowUpDue({ ...aguardando, contacted_at: hoursAgo(71) }, now)).toBe(false);
    expect(isFollowUpDue({ ...aguardando, contacted_at: hoursAgo(72) }, now)).toBe(true);
  });
  it('não vence em outras etapas', () => {
    for (const stage of ['follow_up_feito', 'conversa', 'nao_contatar'] as const) {
      expect(isFollowUpDue({ stage, contacted_at: hoursAgo(200) }, now)).toBe(false);
    }
  });
});

describe('blockEntry', () => {
  it('bloqueia telefone e negócio', () => {
    expect(blockEntry(completeLead, 'Pediu para parar')).toEqual({ phone_e164: '5519987654321', place_id: 'p1', reason: 'Pediu para parar' });
  });
});
