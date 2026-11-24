import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { mapPlaceToLead } from '../src/apify-mapper';
import { whatsappFromHref } from '../src/enrichment';
import { phoneFromProfile } from '../src/instagram-profile';
import { findMunicipio } from '../src/municipios';
import { batchCountry, cityName, findWorldCity, parseWorldCities, searchWorldCities, worldCitiesNear } from '../src/places';
import { prospectedCities } from '../src/prospect-map';

const index = parseWorldCities(gunzipSync(readFileSync(new URL('../../../apps/web/data/world-cities.tsv.gz', import.meta.url))).toString('utf8'));
const first = (q: string) => searchWorldCities(index, q)[0]?.location;

describe('cidades do mundo', () => {
  it('acha pelo nome, pelo nome em português e com estado ou país', () => {
    expect(first('austin')).toBe('Austin, Texas, Estados Unidos');
    expect(first('austin mn')).toBe('Austin, Minnesota, Estados Unidos');
    expect(first('nova york')).toBe('New York City, New York, Estados Unidos');
    expect(first('Lisboa, Portugal')).toBe('Lisbon, Lisbon, Portugal');
    expect(first('londres')).toBe('London, England, Reino Unido');
    expect(first('são francisco california')).toBe('San Francisco, California, Estados Unidos');
    expect(first('tokyo')).toContain('Japão');
    expect(first('cidade que nao existe')).toBeUndefined();
  });
  it('nenhum rótulo se confunde com município brasileiro', () => {
    expect(index.rows.filter((r) => findMunicipio(r.location))).toEqual([]);
    expect(index.byLocation.size).toBe(index.rows.length);
  });
  it('vizinhas do mesmo país', () => {
    const near = worldCitiesNear(index, 'Austin, Texas, Estados Unidos', 30);
    expect(near.map((c) => c.name)).toContain('Round Rock');
    expect(near.every((c) => c.km <= 30 && c.country === 'US')).toBe(true);
  });
  it('país do batch, nome da cidade e mapa', () => {
    const place = findWorldCity(index, 'Austin, Texas, Estados Unidos')!;
    expect(batchCountry({ places: [place] })).toBe('US');
    expect(batchCountry({})).toBe('BR');
    expect(cityName(place.location)).toBe('Austin');
    const [c] = prospectedCities([{ id: '1', location: place.location, locations: [place.location], places: [place], business_type: 'x', created_at: '' }], { 1: 2 });
    expect(c.lat).toBeCloseTo(30.27, 1);
  });
});

describe('celular de fora', () => {
  it('Maps, Instagram e link do WhatsApp', () => {
    const place = { placeId: 'p', title: 'A', phone: '(512) 472-5050' };
    expect(mapPlaceToLead(place, 'b', 'US').phone_e164).toBe('15124725050');
    expect(mapPlaceToLead(place, 'b').phone_e164).toBeNull();
    expect(phoneFromProfile({ biography: 'Call us 512-472-5050' }, 'US').e164).toBe('15124725050');
    expect(phoneFromProfile({ externalUrl: 'https://wa.me/351912345678' }, 'PT').e164).toBe('351912345678');
    expect(whatsappFromHref('https://wa.me/15124725050', 'US')).toBe('15124725050');
    expect(phoneFromProfile({ businessPhoneNumber: '+49 30 901820' }, 'DE').e164).toBeNull();
  });
});
