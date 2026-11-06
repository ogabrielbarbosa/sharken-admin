import { describe, expect, it } from 'vitest';
import { clientDraftFromLead, validateDocument } from '../src/client-form';
import { completeLead } from './fixtures/leads';

describe('validateDocument', () => {
  it('aceita CPF e CNPJ válidos, com ou sem pontuação', () => {
    expect(validateDocument('529.982.247-25')).toBe(true);
    expect(validateDocument('52998224725')).toBe(true);
    expect(validateDocument('11.222.333/0001-81')).toBe(true);
    expect(validateDocument('11222333000181')).toBe(true);
  });
  it('recusa dígitos errados, sequências repetidas e tamanho errado', () => {
    expect(validateDocument('529.982.247-24')).toBe(false);
    expect(validateDocument('11.222.333/0001-80')).toBe(false);
    expect(validateDocument('111.111.111-11')).toBe(false);
    expect(validateDocument('123')).toBe(false);
  });
});

describe('clientDraftFromLead', () => {
  it('preenche com os dados do lead, sem o comentário', () => {
    const draft = clientDraftFromLead({ ...completeLead, comment: 'Dona Carla' });
    expect(draft).toMatchObject({ legal_name: 'Pet Shop Patinhas', phone: '(19) 98765-4321', address: 'Rua Barão de Jaguara, 1020, Campinas', lead_id: 'l1', location: 'Campinas' });
    expect(JSON.stringify(draft)).not.toContain('Carla');
  });
});
