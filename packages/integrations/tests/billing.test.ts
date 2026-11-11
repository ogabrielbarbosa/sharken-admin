import { describe, expect, it } from 'vitest';
import { buildCustomerPayload, buildPaymentPayload, buildSubscriptionPayload, toAsaasBillingType } from '../src/asaas';
import { buildContractPayload, requireTemplateId } from '../src/zapsign';
import { buildReplyPrompt } from '../src/reply-suggestions';
import { completeLead } from '../../domain/tests/fixtures/leads';

const client = { id: 'c1', legal_name: 'Amigo Fiel Ltda', document: '11.222.333/0001-81', contact_name: 'Marcos', email: 'm@x.com', phone: '(19) 99123-4567' };
const service = { id: 's1', name: 'Site', amount_cents: 120000, start_date: '2026-11-03', kind: 'unico' as const };

describe('Asaas', () => {
  it('desliga os avisos automáticos e limpa o documento', () => {
    expect(buildCustomerPayload(client)).toMatchObject({ name: 'Amigo Fiel Ltda', cpfCnpj: '11222333000181', notificationDisabled: true, externalReference: 'c1', mobilePhone: '19991234567' });
  });
  it('converte centavos em reais', () => {
    const body = buildPaymentPayload({ id: 'x', description: 'Mensalidade', amount_cents: 8900, due_date: '2026-12-10', method: 'pix' }, 'cus_1');
    expect(body).toEqual({ customer: 'cus_1', billingType: 'PIX', value: 89, dueDate: '2026-12-10', description: 'Mensalidade', externalReference: 'x' });
  });
  it('monta a assinatura com a periodicidade', () => {
    const body = buildSubscriptionPayload({ id: 'srv', description: 'Mensal', amount_cents: 8900, due_date: '2026-12-10', method: 'boleto' }, 'cus_1', 'MONTHLY');
    expect(body).toEqual({ customer: 'cus_1', billingType: 'BOLETO', value: 89, nextDueDate: '2026-12-10', cycle: 'MONTHLY', description: 'Mensal', externalReference: 'srv' });
  });
  it('traduz a forma de pagamento', () => {
    expect(toAsaasBillingType('cartao')).toBe('CREDIT_CARD');
  });
});

describe('Asaas, CNPJ alfanumérico', () => {
  it('manda o documento em maiúsculas, sem pontuação', () => {
    expect(buildCustomerPayload({ ...client, document: '12.abc.345/01de-35' }).cpfCnpj).toBe('12ABC34501DE35');
  });
});

describe('ZapSign', () => {
  it('monta o documento do modelo sem enviar e-mails', () => {
    const body = buildContractPayload(client, service, 'tpl', 'ctr1');
    expect(body).toMatchObject({ template_id: 'tpl', signer_name: 'Marcos', signer_email: 'm@x.com', disable_signer_emails: true, send_automatic_email: false, external_id: 'ctr1' });
    const data = Object.fromEntries((body.data as { de: string; para: string }[]).map((d) => [d.de, d.para]));
    expect(data['{{NOME}}']).toBe('Amigo Fiel Ltda');
    expect(data['{{DOCUMENTO}}']).toBe('11.222.333/0001-81');
    expect(data['{{SERVICO}}']).toBe('Site');
    expect(data['{{VALOR}}'].replace(/\s/g, ' ')).toBe('R$ 1.200,00');
    expect(data['{{DATA_INICIO}}']).toBe('03/11/2026');
  });
  it('usa o nome do cliente quando não há responsável', () => {
    expect(buildContractPayload({ ...client, contact_name: null }, service, 'tpl', 'c').signer_name).toBe('Amigo Fiel Ltda');
  });
  it('avisa quando falta o modelo de contrato', () => {
    expect(() => requireTemplateId({})).toThrow(/modelo/i);
  });
});

describe('buildReplyPrompt', () => {
  const out = buildReplyPrompt({ ...completeLead, comment: 'Dona Carla' }, 'Quanto custa?');
  it('inclui os dados e a mensagem recebida', () => {
    expect(out.user).toContain('Pet Shop Patinhas');
    expect(out.user).toContain('Quanto custa?');
  });
  it('não inclui o comentário interno', () => {
    expect(out.user).not.toContain('Carla');
  });
  it('proíbe promessa de preço e orienta o campo [valor]', () => {
    expect(out.system).toMatch(/Nunca prometa preço/);
    expect(out.system).toContain('[valor]');
  });
});
