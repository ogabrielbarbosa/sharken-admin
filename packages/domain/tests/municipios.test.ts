import { describe, expect, it } from 'vitest';
import { findMunicipio, formatMunicipio, searchMunicipios } from '../src/municipios';

describe('searchMunicipios', () => {
  it('lista todas as cidades com o nome, de estados diferentes', () => {
    const r = searchMunicipios('campinas').map(formatMunicipio);
    expect(r[0]).toBe('Campinas, SP');
    expect(r).toContain('Campinas do Sul, RS');
  });
  it('ignora acentos e maiúsculas', () => {
    expect(searchMunicipios('sao jose dos campos').map(formatMunicipio)).toContain('São José dos Campos, SP');
  });
  it('filtra pela UF digitada no fim', () => {
    const r = searchMunicipios('bom jesus pi');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => m.uf === 'PI')).toBe(true);
  });
  it('não sugere nada para texto vazio', () => {
    expect(searchMunicipios('  ')).toEqual([]);
  });
});

describe('findMunicipio', () => {
  it('reconhece um município válido', () => {
    expect(findMunicipio('Campinas, SP')).toEqual({ nome: 'Campinas', uf: 'SP', estado: 'São Paulo' });
  });
  it('recusa nome incompleto ou UF errada', () => {
    expect(findMunicipio('Campina, SP')).toBeNull();
    expect(findMunicipio('Campinas, MG')).toBeNull();
    expect(findMunicipio('Campinas')).toBeNull();
  });
});
