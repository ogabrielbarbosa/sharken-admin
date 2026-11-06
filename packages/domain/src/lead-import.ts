import type { NewLead } from './apify-mapper';
import type { Lead } from './types';

export function mergeLeadOnReimport(existing: Lead, incoming: NewLead): Partial<Lead> {
  const patch: Partial<Lead> = {
    rating: incoming.rating,
    reviews_count: incoming.reviews_count,
    images_count: incoming.images_count,
    is_open: incoming.is_open,
    photos: incoming.photos.length ? incoming.photos : existing.photos,
    reviews: incoming.reviews.length ? incoming.reviews : existing.reviews,
  };
  if (incoming.description) patch.description = incoming.description;
  return patch;
}

export function toLocationKey(location: string): string {
  return location
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}
