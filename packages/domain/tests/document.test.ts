import { describe, expect, it } from 'vitest';
import { formatDocument, formatPhone, isValidCnpj, isValidCpf, normalizeDocument } from '../src/document';

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

const withCheckDigits = (base: string) => {
  const dv = (chars: string, weights: number[]) => {
    const rest = [...chars].reduce((sum, ch, i) => sum + (ch.charCodeAt(0) - 48) * weights[i], 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = dv(base, w1);
  const d2 = dv(base + d1, [6, ...w1]);
  return `${base}${d1}${d2}`;
};

describe('CNPJ alfanumérico', () => {
  const valid = withCheckDigits('12ABC34501DE');
  it('aceita 12 caracteres alfanuméricos com 2 dígitos verificadores', () => {
    expect(isValidCnpj(valid)).toBe(true);
    expect(isValidCnpj(valid.toLowerCase())).toBe(true);
    expect(isValidCnpj(`${valid.slice(0, 2)}.${valid.slice(2, 5)}.${valid.slice(5, 8)}/${valid.slice(8, 12)}-${valid.slice(12)}`)).toBe(true);
  });
  it('recusa dígito verificador errado e letra nos dígitos verificadores', () => {
    const wrong = valid.slice(0, 13) + String((Number(valid[13]) + 1) % 10);
    expect(isValidCnpj(wrong)).toBe(false);
    expect(isValidCnpj(valid.slice(0, 12) + 'AB')).toBe(false);
  });
  it('formata e normaliza', () => {
    expect(normalizeDocument('12.ABC.345/01DE-' + valid.slice(12))).toBe(valid);
    expect(formatDocument(valid)).toBe(`12.ABC.345/01DE-${valid.slice(12)}`);
    expect(normalizeDocument('529.982.247-25')).toBe('52998224725');
  });
});
