import { describe, expect, it } from 'vitest';
import { dedupeLeads, mapPlaceToLead, type ApifyPlace } from '../src/apify-mapper';

const place: ApifyPlace = {
  placeId: 'p1', title: 'Pet Legal', phone: '(19) 98765-4321', address: 'Rua A, 10', city: 'Campinas',
  website: 'https://petlegal.com.br', totalScore: 4.8, reviewsCount: 30, imagesCount: 12,
  imageUrls: ['https://img/1.jpg'], categories: ['Pet shop'], categoryName: 'Pet shop',
  description: 'Banho e tosa', ownerDescription: null, permanentlyClosed: false, temporarilyClosed: false,
  reviews: [{ text: 'Ótimo!', stars: 5, name: 'Fulano', reviewerUrl: 'https://x' }, { text: '', stars: 4, name: 'Beltrano' }],
};

describe('mapPlaceToLead', () => {
  it('copia os dados e normaliza o telefone', () => {
    const lead = mapPlaceToLead(place, 'b1');
    expect(lead).toMatchObject({
      batch_id: 'b1', place_id: 'p1', name: 'Pet Legal', phone_e164: '5519987654321', phone_raw: '(19) 98765-4321',
      city: 'Campinas', rating: 4.8, reviews_count: 30, images_count: 12, is_open: true, business_type: 'Pet shop',
      photos: ['https://img/1.jpg'], categories: ['Pet shop'], description: 'Banho e tosa',
    });
  });

  it('não guarda autor e descarta avaliação sem texto', () => {
    expect(mapPlaceToLead(place, 'b1').reviews).toEqual([{ text: 'Ótimo!', stars: 5 }]);
  });

  it('marca como fechado temporário ou permanente', () => {
    expect(mapPlaceToLead({ ...place, temporarilyClosed: true }, 'b').is_open).toBe(false);
    expect(mapPlaceToLead({ ...place, permanentlyClosed: true }, 'b').is_open).toBe(false);
  });

  it('usa valores vazios para campos ausentes', () => {
    const lead = mapPlaceToLead({ placeId: 'p2', title: 'X' }, 'b');
    expect(lead).toMatchObject({ phone_e164: null, website_url: null, rating: null, reviews_count: 0, photos: [], reviews: [], categories: [] });
  });

  it('usa a descrição do dono quando não há outra', () => {
    expect(mapPlaceToLead({ ...place, description: null, ownerDescription: 'Do dono' }, 'b').description).toBe('Do dono');
  });
});

describe('dedupeLeads', () => {
  const base = mapPlaceToLead(place, 'b');
  it('remove place_id repetido', () => {
    expect(dedupeLeads([base, { ...base }])).toHaveLength(1);
  });
  it('mantém o de mais avaliações quando o telefone repete', () => {
    const other = { ...base, place_id: 'p9', reviews_count: 99 };
    const out = dedupeLeads([base, other]);
    expect(out).toHaveLength(1);
    expect(out[0].place_id).toBe('p9');
  });
  it('não trata leads sem telefone como duplicatas', () => {
    const a = { ...base, place_id: 'a', phone_e164: null };
    const b = { ...base, place_id: 'b', phone_e164: null };
    expect(dedupeLeads([a, b])).toHaveLength(2);
  });
});
