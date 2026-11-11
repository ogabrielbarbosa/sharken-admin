import { describe, expect, it } from 'vitest';
import { buildWhatsAppLink, renderMessage, selectFirstMessage, type MessageTemplates } from '../src/messages';
import { completeLead, improveLead } from './fixtures/leads';

const templates: MessageTemplates = {
  sem_site: 'Oi [nome do negócio] em [cidade]: [link]',
  fora_do_ar: 'Tentei abrir o site da [nome do negócio]: [link]',
  melhorar_site: 'Site da [nome do negócio]: [motivo]. [link]',
  follow_up: 'De novo: [link]',
};
const vars = { link: 'https://x.co/p/a' };

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
