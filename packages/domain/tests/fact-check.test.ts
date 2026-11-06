import { describe, expect, it } from 'vitest';
import { findUnsupportedClaims } from '../src/fact-check';
import type { PageCopy } from '../src/page-copy';

const source = 'Pet shop em Campinas. Banho e tosa. Banho a partir de R$ 40.';
const copy = (over: Partial<PageCopy> = {}): PageCopy => ({
  headline: 'Pet shop em Campinas', subheadline: 'Cuidado para o seu pet', about: null,
  services: [{ name: 'Banho e tosa', description: null }], cta: 'Chamar no WhatsApp', ...over,
});

describe('findUnsupportedClaims', () => {
  it('aceita texto apoiado nos dados', () => {
    expect(findUnsupportedClaims(copy(), source)).toEqual([]);
  });
  it('aponta preço que não está na fonte', () => {
    expect(findUnsupportedClaims(copy({ about: 'Banho por R$ 50.' }), source).join()).toMatch(/r\$ 50/i);
  });
  it('não aponta preço que está na fonte', () => {
    expect(findUnsupportedClaims(copy({ about: 'Banho a partir de R$ 40.' }), source)).toEqual([]);
  });
  it('aponta tempo de experiência inventado', () => {
    expect(findUnsupportedClaims(copy({ about: 'Temos 10 anos de experiência.' }), source).join()).toMatch(/10 anos/);
  });
  it('aponta credencial inventada', () => {
    expect(findUnsupportedClaims(copy({ subheadline: 'Equipe certificada' }), source).join()).toMatch(/certificad/);
    expect(findUnsupportedClaims(copy({ subheadline: 'O melhor da cidade' }), source).join()).toMatch(/melhor/);
  });
  it('aponta serviço fora dos dados', () => {
    expect(findUnsupportedClaims(copy({ services: [{ name: 'Veterinário 24h', description: null }] }), source).join()).toMatch(/Veterinário 24h/);
  });
  it('confere também a descrição do serviço', () => {
    expect(findUnsupportedClaims(copy({ services: [{ name: 'Banho e tosa', description: 'Por R$ 99' }] }), source).join()).toMatch(/r\$ 99/i);
  });
  it('ignora acentos e maiúsculas', () => {
    expect(findUnsupportedClaims(copy({ services: [{ name: 'BANHO', description: null }] }), 'banho')).toEqual([]);
  });
});
