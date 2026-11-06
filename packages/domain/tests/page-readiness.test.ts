import { describe, expect, it } from 'vitest';
import { buildSourceText, checkReadiness } from '../src/page-readiness';
import { completeLead, improveLead, noDescriptionLead } from './fixtures/leads';

describe('checkReadiness', () => {
  it('aprova lead com os dados mínimos', () => {
    expect(checkReadiness(completeLead)).toEqual({ ready: true, missing: [] });
  });
  it('lista cada campo faltante', () => {
    const out = checkReadiness({ ...completeLead, name: '', phone_e164: null, address: null, categories: [], business_type: null });
    expect(out.ready).toBe(false);
    expect(out.missing).toEqual(['nome', 'telefone', 'endereço', 'serviço']);
  });
  it('aceita a categoria como serviço', () => {
    expect(checkReadiness({ ...noDescriptionLead, description: null }).ready).toBe(true);
  });
});

describe('buildSourceText', () => {
  it('usa os dados do negócio e do site atual', () => {
    const text = buildSourceText(improveLead);
    expect(text).toContain('Clínica Sorriso');
    expect(text).toContain('Implantes');
  });
  it('nunca inclui o comentário interno', () => {
    expect(buildSourceText({ ...completeLead, comment: 'Dona se chama Carla' })).not.toContain('Carla');
  });
});
