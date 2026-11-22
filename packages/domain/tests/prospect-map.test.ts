import { describe, expect, it } from 'vitest';
import { prospectedCities, prospectedNiches } from '../src/prospect-map';

const b = (id: string, business_type: string, locations: string[], location = locations[0] ?? 'x') => ({ id, business_type, locations, location, created_at: '2026-11-22' });

describe('mapa do que já foi prospectado', () => {
  const batches = [
    b('1', 'Lente dental', ['São José dos Campos, SP', 'Jacareí, SP']),
    b('2', 'lente dental ', ['São José dos Campos, SP']),
    b('3', 'Estacionamento', ['Caçapava, SP']),
    b('4', 'pet shop', [], 'Zona Sul, Rio'),
  ];
  const leads = { 1: 30, 2: 10, 3: 5, 4: 7 };

  it('junta por cidade e soma os leads', () => {
    const cities = prospectedCities(batches, leads);
    expect(cities.map((c) => [c.location, c.leads, c.batches.length])).toEqual([
      ['São José dos Campos, SP', 40, 2], ['Jacareí, SP', 30, 1], ['Caçapava, SP', 5, 1],
    ]);
    expect(cities[0].lat).toBeCloseTo(-23.19, 1);
  });

  it('filtra pelo nicho, sem ligar para caixa e espaço', () => {
    expect(prospectedCities(batches, leads, 'LENTE DENTAL').map((c) => c.location)).toEqual(['São José dos Campos, SP', 'Jacareí, SP']);
    expect(prospectedCities(batches, leads, 'lentes dentais').map((c) => c.location)).toEqual(['São José dos Campos, SP', 'Jacareí, SP']);
  });

  it('lista os nichos sem repetir', () => {
    expect(prospectedNiches(batches)).toEqual(['Estacionamento', 'lente dental', 'pet shop']);
  });
});
