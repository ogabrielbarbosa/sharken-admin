import { describe, expect, it } from 'vitest';
import { computeSiteSignals, flowFromSiteStatus, interpretAttempt, nextCheckStep } from '../src/site-check';

describe('interpretAttempt', () => {
  it('trata erro de rede, tempo esgotado e status ruins como falha', () => {
    expect(interpretAttempt({ errorCode: 'ERR_NAME_NOT_RESOLVED' })).toBe('falha');
    expect(interpretAttempt({ errorCode: 'ERR_CERT_DATE_INVALID' })).toBe('falha');
    expect(interpretAttempt({ timedOut: true })).toBe('falha');
    expect(interpretAttempt({ status: 404 })).toBe('falha');
    expect(interpretAttempt({ status: 410 })).toBe('falha');
    expect(interpretAttempt({ status: 503 })).toBe('falha');
  });
  it('não considera bloqueio de robô como fora do ar', () => {
    expect(interpretAttempt({ status: 403 })).toBe('ok');
    expect(interpretAttempt({ status: 200 })).toBe('ok');
  });
});

describe('nextCheckStep', () => {
  it('só declara fora do ar na terceira falha', () => {
    expect(nextCheckStep(1)).toEqual({ action: 'tentar_de_novo', delayMinutes: 5 });
    expect(nextCheckStep(2)).toEqual({ action: 'tentar_de_novo', delayMinutes: 5 });
    expect(nextCheckStep(3)).toEqual({ action: 'fora_do_ar' });
  });
});

describe('flowFromSiteStatus', () => {
  it('leva cada situação ao fluxo certo', () => {
    expect(flowFromSiteStatus('sem_link')).toBe('sem_site');
    expect(flowFromSiteStatus('somente_social')).toBe('sem_site');
    expect(flowFromSiteStatus('fora_do_ar')).toBe('sem_site');
    expect(flowFromSiteStatus('funcionando')).toBe('melhorar_site');
  });
});

describe('computeSiteSignals', () => {
  it('aponta os problemas encontrados', () => {
    const signals = computeSiteSignals({ loadMs: 6000, https: false, hasViewportMeta: false, hasWhatsAppLink: false });
    expect(signals.every((s) => !s.ok)).toBe(true);
    expect(signals.map((s) => s.key)).toEqual(['velocidade', 'https', 'celular', 'whatsapp']);
  });
  it('aprova um site sem problemas', () => {
    expect(computeSiteSignals({ loadMs: 1000, https: true, hasViewportMeta: true, hasWhatsAppLink: true }).every((s) => s.ok)).toBe(true);
  });
});
