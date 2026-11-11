import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@lps/config/messages';
import {
  canSetStatus, statusAfterSend, statusAfterInbound, sendBlockReason, followUpDueAt, sendKind, firstContactText, followUpText,
} from '../src/contacts';
import type { Lead } from '../src/types';

const ok = { status: 'novo' as const, follow_ups_without_reply: 0, responded_at: null };

describe('canSetStatus', () => {
  it('manual para perdido, nao_contatar e fechado', () => {
    for (const to of ['perdido', 'nao_contatar', 'fechado'] as const) expect(canSetStatus('contatado', to)).toBe(true);
  });
  it('nao_contatar é permanente', () => {
    expect(canSetStatus('nao_contatar', 'perdido')).toBe(false);
    expect(canSetStatus('nao_contatar', 'novo')).toBe(false);
  });
  it('perdido volta a em_conversa só por mensagem recebida', () => {
    expect(canSetStatus('perdido', 'em_conversa')).toBe(false);
  });
});

describe('statusAfterSend / statusAfterInbound', () => {
  it('primeiro e follow-up', () => {
    expect(statusAfterSend({ status: 'novo' }, 'primeiro')).toBe('contatado');
    expect(statusAfterSend({ status: 'contatado' }, 'follow_up')).toBe('follow_up');
  });
  it('mensagem normal não muda o status', () => {
    expect(statusAfterSend({ status: 'em_conversa' }, 'normal')).toBe('em_conversa');
    expect(statusAfterSend({ status: 'perdido' }, 'normal')).toBe('perdido');
  });
  it('resposta leva a em_conversa, exceto nao_contatar e fechado', () => {
    for (const s of ['novo', 'contatado', 'follow_up', 'perdido'] as const) expect(statusAfterInbound({ status: s })).toBe('em_conversa');
    expect(statusAfterInbound({ status: 'nao_contatar' })).toBe('nao_contatar');
    expect(statusAfterInbound({ status: 'fechado' })).toBe('fechado');
  });
});

describe('sendBlockReason', () => {
  const base = { doNotContact: false, connected: true, kind: 'normal' as const };
  it('libera o caso comum', () => expect(sendBlockReason(ok, base)).toBeNull());
  it('nao_contatar', () =>
    expect(sendBlockReason({ ...ok, status: 'nao_contatar' }, base)).toBe('Este contato pediu para não receber mensagens.'));
  it('doNotContact', () =>
    expect(sendBlockReason(ok, { ...base, doNotContact: true })).toBe('Este contato pediu para não receber mensagens.'));
  it('desconectado', () => expect(sendBlockReason(ok, { ...base, connected: false })).toBe('WhatsApp desconectado. Reconecte para enviar.'));
  it('ordem: bloqueio vem antes de desconectado', () =>
    expect(sendBlockReason(ok, { doNotContact: true, connected: false, kind: 'normal' })).toBe('Este contato pediu para não receber mensagens.'));
  it('follow-up já enviado sem resposta bloqueia', () =>
    expect(sendBlockReason({ status: 'follow_up', follow_ups_without_reply: 1, responded_at: null }, { ...base, kind: 'follow_up' })).toBe(
      'Já foi enviado um follow-up sem resposta.',
    ));
  it('com resposta libera', () =>
    expect(
      sendBlockReason({ status: 'follow_up', follow_ups_without_reply: 1, responded_at: '2026-11-01T00:00:00Z' }, { ...base, kind: 'follow_up' }),
    ).toBeNull());
  it('mensagem normal em follow_up sem resposta também bloqueia', () =>
    expect(sendBlockReason({ status: 'follow_up', follow_ups_without_reply: 1, responded_at: null }, base)).toBe(
      'Já foi enviado um follow-up sem resposta.',
    ));
});

describe('followUpDueAt e sendKind', () => {
  it('+72 h', () => {
    const d = new Date('2026-11-01T12:00:00Z');
    expect(followUpDueAt(d).getTime() - d.getTime()).toBe(72 * 3600_000);
  });
  const now = new Date('2026-11-10T00:00:00Z');
  it('novo é primeiro', () => expect(sendKind({ status: 'novo', follow_up_at: null }, now)).toBe('primeiro'));
  it('contatado com follow-up vencido', () =>
    expect(sendKind({ status: 'contatado', follow_up_at: '2026-11-09T00:00:00Z' }, now)).toBe('follow_up'));
  it('contatado sem vencer é normal', () => {
    expect(sendKind({ status: 'contatado', follow_up_at: '2026-11-11T00:00:00Z' }, now)).toBe('normal');
    expect(sendKind({ status: 'contatado', follow_up_at: null }, now)).toBe('normal');
  });
  it('outros são normal', () => expect(sendKind({ status: 'em_conversa', follow_up_at: '2026-11-01T00:00:00Z' }, now)).toBe('normal'));
});

describe('textos', () => {
  const lead = { name: 'Padaria Bom Pão', city: 'Campinas', business_type: 'padaria', reason: 'o site não abre no celular', flow: 'sem_site', site_status: null } as unknown as Lead;
  it('sem site', () => {
    const t = firstContactText(lead, 'https://x.com/p');
    expect(t).toContain('Padaria Bom Pão');
    expect(t).toContain('https://x.com/p');
    expect(t).toContain('não encontrei um site');
  });
  it('fora do ar e melhorar site', () => {
    expect(firstContactText({ ...lead, site_status: 'fora_do_ar' }, 'l')).toContain('não consegui');
    expect(firstContactText({ ...lead, flow: 'melhorar_site' }, 'l')).toContain('o site não abre no celular');
  });
  it('follow-up', () => expect(followUpText('https://x.com/p')).toBe(MESSAGES.follow_up.replace('[link]', 'https://x.com/p')));
});

import { outreachKind } from '../src/contacts';
describe('outreachKind', () => {
  it('0 enviadas é o primeiro contato, 1 é o follow-up, 2 ou mais bloqueia', () => {
    expect(outreachKind(false, 0)).toBe('primeiro');
    expect(outreachKind(false, 1)).toBe('follow_up');
    expect(outreachKind(false, 2)).toBe('bloqueado');
    expect(outreachKind(false, 7)).toBe('bloqueado');
  });
  it('depois da resposta não há limite', () => {
    expect(outreachKind(true, 0)).toBe('normal');
    expect(outreachKind(true, 9)).toBe('normal');
  });
});
