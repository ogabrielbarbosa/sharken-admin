import { describe, expect, it } from 'vitest';
import { buildPendencies, pendencyHref, summarizeResults, type ResultRow } from '../src/metrics';
import { shouldDeleteLead } from '../src/retention';

const row = (over: Partial<ResultRow> = {}): ResultRow => ({
  flow: 'sem_site', business_type: 'pet shop', found: true, advanced: true, approved: true, contacted: true, opened: true, replied: false, sold: false, ...over,
});

describe('summarizeResults', () => {
  const out = summarizeResults([
    row({ replied: true, sold: true }),
    row({ flow: 'melhorar_site', business_type: 'dentista', opened: false }),
    row({ contacted: false, opened: false, approved: false, advanced: false }),
  ]);
  it('conta cada lead uma vez e deixa descartados fora dos contatos', () => {
    expect(out.totals).toMatchObject({ contacts: 2, opens: 1, replies: 1, sales: 1 });
  });
  it('agrupa por fluxo e por tipo de negócio', () => {
    expect(out.byFlow.find((s) => s.key === 'sem_site')).toMatchObject({ contacts: 1, sales: 1 });
    expect(out.byBusinessType.find((s) => s.key === 'dentista')).toMatchObject({ contacts: 1, opens: 0 });
  });
  it('monta o funil com a taxa sobre a etapa anterior', () => {
    expect(out.funnel[0]).toMatchObject({ label: 'Revisados', count: 3, rate: null });
    expect(out.funnel[1]).toMatchObject({ label: 'Avançados', count: 2, rate: 67 });
    expect(out.funnel.at(-1)).toMatchObject({ label: 'Fechados', count: 1, rate: 100 });
  });
});

describe('pendências', () => {
  const leads = [
    { batch_id: 'a', stage: 'revisar' },
    { batch_id: 'b', stage: 'revisar' },
    { batch_id: 'a', stage: 'crm' },
    { batch_id: 'a', stage: 'descartado' },
  ] as never;
  const list = buildPendencies({ leads, crm: { hoje: 3, novos: 0, em_conversa: 1 }, overdueCharges: 2 });
  it('conta só o que precisa de ação', () => {
    expect(list.find((p) => p.kind === 'hoje')?.count).toBe(3);
    expect(list.find((p) => p.kind === 'em_conversa')?.count).toBe(1);
    expect(list.find((p) => p.kind === 'novos')).toBeUndefined();
    expect(list.find((p) => p.kind === 'revisar')?.count).toBe(2);
    expect(list.find((p) => p.kind === 'cobranca')?.count).toBe(2);
    expect(list.find((p) => p.kind === 'completar')).toBeUndefined();
  });
  it('abre a caixa do CRM, o batch ou a lista filtrada', () => {
    expect(pendencyHref(list.find((p) => p.kind === 'hoje')!)).toBe('/painel/crm?caixa=hoje');
    expect(pendencyHref(list.find((p) => p.kind === 'em_conversa')!)).toBe('/painel/crm?caixa=em_conversa');
    expect(pendencyHref(list.find((p) => p.kind === 'revisar')!)).toBe('/painel/batches?etapa=revisar');
    expect(pendencyHref(list.find((p) => p.kind === 'cobranca')!)).toBe('/painel/clientes?situacao=em_atraso');
  });
  it('abre direto com um só batch', () => {
    const one = buildPendencies({ leads: [{ batch_id: 'a', stage: 'completar' }] as never, crm: { hoje: 0, novos: 0, em_conversa: 0 }, overdueCharges: 0 });
    expect(pendencyHref(one[0])).toBe('/painel/batches/a/completar');
  });
});

describe('retenção', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  const lead = (over = {}) => ({ stage: 'descartado', created_at: ago(400), contacted_at: ago(181), follow_up_at: null, responded_at: null, hasClient: false, ...over }) as never;
  it('remove lead sem resposta depois de 180 dias', () => {
    expect(shouldDeleteLead(lead(), now)).toBe(true);
    expect(shouldDeleteLead(lead({ contacted_at: ago(179) }), now)).toBe(false);
  });
  it('conta o prazo a partir do follow-up, se houver', () => {
    expect(shouldDeleteLead(lead({ follow_up_at: ago(10) }), now)).toBe(false);
  });
  it('usa a criação para quem nunca foi contatado', () => {
    expect(shouldDeleteLead(lead({ stage: 'revisar', contacted_at: null, created_at: ago(181) }), now)).toBe(true);
    expect(shouldDeleteLead(lead({ stage: 'revisar', contacted_at: null, created_at: ago(5) }), now)).toBe(false);
  });
  it('preserva quem respondeu, vendeu ou virou cliente', () => {
    expect(shouldDeleteLead(lead({ responded_at: ago(300) }), now)).toBe(false);
    expect(shouldDeleteLead(lead({ stage: 'vendido' }), now)).toBe(false);
    expect(shouldDeleteLead(lead({ hasClient: true }), now)).toBe(false);
  });
  it('preserva lead ativo no CRM e ainda remove o descartado', () => {
    expect(shouldDeleteLead(lead({ stage: 'crm', created_at: ago(400), contacted_at: null }), now)).toBe(false);
    expect(shouldDeleteLead(lead({ stage: 'descartado', created_at: ago(400), contacted_at: null }), now)).toBe(true);
  });
});
