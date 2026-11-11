import { describe, expect, it } from 'vitest';
import { buildSiteContent } from '../src/site-content';
import { getSiteAccess, shouldRecordOpen } from '../src/site-access';
import { completeLead, improveLead, specialCharsLead } from './fixtures/leads';

const now = new Date('2026-11-06T12:00:00Z');

describe('getSiteAccess', () => {
  it('libera modelo dentro da validade', () => {
    expect(getSiteAccess({ status: 'modelo', published_at: null, sent_at: null, expires_at: '2026-11-07T00:00:00Z' }, now)).toBe('ok');
  });
  it('bloqueia modelo vencido ou removido', () => {
    expect(getSiteAccess({ status: 'modelo', published_at: null, sent_at: null, expires_at: '2026-11-05T00:00:00Z' }, now)).toBe('indisponivel');
    expect(getSiteAccess({ status: 'removido', published_at: null, sent_at: null, expires_at: '2026-12-01T00:00:00Z' }, now)).toBe('indisponivel');
  });
});

describe('shouldRecordOpen', () => {
  const base = { isAdmin: false, isCapture: false };
  it('só conta depois do envio', () => {
    expect(shouldRecordOpen({ ...base, stage: 'revisar_material' })).toBe(false);
    expect(shouldRecordOpen({ ...base, stage: 'completar' })).toBe(false);
    expect(shouldRecordOpen({ ...base, stage: 'crm' })).toBe(true);
    expect(shouldRecordOpen({ ...base, stage: 'vendido' })).toBe(true);
  });
  it('ignora o próprio Gabriel e a captura do vídeo', () => {
    expect(shouldRecordOpen({ stage: 'crm', isAdmin: true, isCapture: false })).toBe(false);
    expect(shouldRecordOpen({ stage: 'crm', isAdmin: false, isCapture: true })).toBe(false);
  });
});

describe('buildSiteContent', () => {
  const copy = { headline: 'h', subheadline: 's', about: null, services: [], cta: 'c' };
  it('monta os dados do negócio sem o comentário', () => {
    const content = buildSiteContent({ ...completeLead, comment: 'Dona Carla' }, copy, [{ url: 'u', stock: false }]);
    expect(content.business.phoneE164).toBe('5519987654321');
    expect(JSON.stringify(content)).not.toContain('Carla');
  });
  it('usa a cor do site atual no fluxo melhorar site', () => {
    expect(buildSiteContent(improveLead, copy, []).colors.primary).toBe('#0055aa');
  });
  it('monta a busca do mapa com nome e endereço', () => {
    expect(buildSiteContent(specialCharsLead, copy, []).business.mapsQuery).toContain('Rua Barão');
  });
  it('leva só as avaliações com texto', () => {
    expect(buildSiteContent(completeLead, copy, []).reviews).toEqual([{ text: 'Atendimento ótimo', stars: 5 }]);
  });
});
