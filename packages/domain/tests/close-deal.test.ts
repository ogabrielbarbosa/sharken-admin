import { describe, expect, it } from 'vitest';
import { closeDealDefaults, validateCloseDeal, type CloseDealInput } from '../src/close-deal';
import type { Contact } from '../src/contacts';
import { completeLead } from './fixtures/leads';

const contact = {
  id: 'ct1', name: 'Carla Mendes', phone_e164: '5519981342207', lead_id: 'l1', status: 'em_conversa',
} as Contact;
const lead = { ...completeLead, id: 'l1', name: 'Pet Shop Focinho Feliz', address: 'R. Dr. Heitor Penteado, 1180, Taquaral', city: 'Campinas' };

const valid = (): CloseDealInput => ({
  ...closeDealDefaults(contact, lead),
  client: { ...closeDealDefaults(contact, lead).client, document: '529.982.247-25' },
  service: { ...closeDealDefaults(contact, lead).service, amount_cents: 120000, start_date: '2026-11-18' },
  payment: { method: 'pix', first_due_date: '2026-11-20', cycle: null },
});

describe('closeDealDefaults', () => {
  it('preenche cliente e serviço a partir do contato e do lead', () => {
    const d = closeDealDefaults(contact, lead);
    expect(d.contact_id).toBe('ct1');
    expect(d.client).toMatchObject({
      legal_name: 'Pet Shop Focinho Feliz', document: '', contact_name: 'Carla Mendes', email: '',
      phone: '5519981342207', address: 'R. Dr. Heitor Penteado, 1180, Taquaral', location: 'Campinas',
    });
    expect(d.service.name).toBe('Site para Pet Shop Focinho Feliz');
    expect(d.service.kind).toBe('unico');
  });
  it('sem lead, usa o nome do contato para tudo', () => {
    const d = closeDealDefaults({ ...contact, lead_id: null }, null);
    expect(d.client.legal_name).toBe('Carla Mendes');
    expect(d.client.contact_name).toBe('Carla Mendes');
    expect(d.client.address).toBe('');
    expect(d.service.name).toBe('Site para Carla Mendes');
  });
  it('contato de batch tem o nome do negócio, então o responsável fica em branco', () => {
    const d = closeDealDefaults({ ...contact, name: lead.name }, lead);
    expect(d.client.contact_name).toBe('');
  });
});

describe('validateCloseDeal', () => {
  it('aceita um fechamento completo', () => {
    expect(validateCloseDeal(valid())).toEqual({});
  });
  it('aponta CPF ou CNPJ inválido e nome vazio', () => {
    const input = valid();
    input.client.document = '529.982.247-24';
    input.client.legal_name = '  ';
    expect(validateCloseDeal(input)).toEqual({ document: expect.stringMatching(/CPF ou CNPJ/), legal_name: expect.any(String) });
  });
  it('valida e-mail só quando informado', () => {
    const input = valid();
    input.client.email = 'carla@';
    expect(validateCloseDeal(input).email).toBeDefined();
    input.client.email = 'carla@x.com.br';
    expect(validateCloseDeal(input).email).toBeUndefined();
  });
  it('exige valor positivo, datas e forma de pagamento', () => {
    const input = valid();
    input.service.amount_cents = -1;
    input.service.start_date = '';
    input.payment.first_due_date = '';
    expect(Object.keys(validateCloseDeal(input)).sort()).toEqual(['amount', 'first_due_date', 'start_date']);
  });
  it('periodicidade só é exigida no recorrente', () => {
    const input = valid();
    input.service.kind = 'recorrente';
    expect(validateCloseDeal(input).cycle).toBeDefined();
    input.payment.cycle = 'mensal';
    expect(validateCloseDeal(input).cycle).toBeUndefined();
  });
});
