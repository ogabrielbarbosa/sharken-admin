import { describe, expect, it } from 'vitest';
import { formatDocument, formatPhone, isValidCnpj, isValidCpf } from '../src/document';

describe('isValidCpf', () => {
  it('aceita CPF válido, com ou sem pontuação', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
  });
  it('recusa dígito verificador errado, tamanho errado e dígitos iguais', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('11.222.333/0001-81')).toBe(false);
  });
});

describe('isValidCnpj', () => {
  it('aceita CNPJ válido, com ou sem pontuação', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
  });
  it('recusa dígito verificador errado, tamanho errado e dígitos iguais', () => {
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('529.982.247-25')).toBe(false);
  });
});

describe('formatDocument', () => {
  it('formata CPF e CNPJ', () => {
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('mantém o que já está formatado e devolve o texto quando não é documento', () => {
    expect(formatDocument('529.982.247-25')).toBe('529.982.247-25');
    expect(formatDocument('abc')).toBe('abc');
  });
});

describe('formatPhone', () => {
  it('formata celular e fixo, com ou sem o código do país', () => {
    expect(formatPhone('5519981342207')).toBe('(19) 98134-2207');
    expect(formatPhone('19981342207')).toBe('(19) 98134-2207');
    expect(formatPhone('551934221234')).toBe('(19) 3422-1234');
  });
  it('devolve o texto original quando não reconhece', () => {
    expect(formatPhone('123')).toBe('123');
  });
});
