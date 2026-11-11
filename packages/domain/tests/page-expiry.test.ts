import { describe, expect, it } from 'vitest';
import { expiryAfterSend, pageAccess, renewExpiry } from '../src/page-expiry';

const now = new Date('2026-11-11T12:00:00Z');
const base = { status: 'modelo' as const, published_at: null, sent_at: null, expires_at: null };

describe('pageAccess', () => {
  it('aprovada e não enviada abre sem prazo por 7 dias', () => {
    expect(pageAccess({ ...base, published_at: '2026-11-05T12:00:01Z' }, now)).toBe('ok');
  });
  it('aprovada e não enviada há mais de 7 dias expira', () => {
    expect(pageAccess({ ...base, published_at: '2026-11-04T11:00:00Z' }, now)).toBe('indisponivel');
  });
  it('enviada vale até expires_at', () => {
    const sent = { ...base, published_at: '2026-10-01T00:00:00Z', sent_at: '2026-11-11T10:00:00Z' };
    expect(pageAccess({ ...sent, expires_at: '2026-11-12T10:00:00Z' }, now)).toBe('ok');
    expect(pageAccess({ ...sent, expires_at: '2026-11-11T11:00:00Z' }, now)).toBe('indisponivel');
  });
  it('sem published_at e sem expires_at fica indisponível', () => {
    expect(pageAccess(base, now)).toBe('indisponivel');
  });
  it('removida fica indisponível', () => {
    expect(pageAccess({ ...base, status: 'removido', published_at: '2026-11-11T00:00:00Z' }, now)).toBe('indisponivel');
  });
  it('página do template (sem published_at) vale só pelo expires_at', () => {
    expect(pageAccess({ ...base, expires_at: '2026-11-12T00:00:00Z' }, now)).toBe('ok');
    expect(pageAccess({ ...base, expires_at: '2026-11-10T00:00:00Z' }, now)).toBe('indisponivel');
  });
});

describe('expiryAfterSend e renewExpiry', () => {
  it('soma o prazo em horas ao envio', () => {
    expect(expiryAfterSend(new Date('2026-11-11T10:00:00Z'), 24).toISOString()).toBe('2026-11-12T10:00:00.000Z');
  });
  it('renova a partir de agora', () => {
    expect(renewExpiry(now, 24).toISOString()).toBe('2026-11-12T12:00:00.000Z');
  });
});
