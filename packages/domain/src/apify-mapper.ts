import { instagramHandle } from './lead-keys';
import { toMobileE164 } from './phone';

export type ApifyPlace = {
  placeId: string;
  title: string;
  phone?: string | null;
  phoneUnformatted?: string | null;
  address?: string | null;
  city?: string | null;
  website?: string | null;
  totalScore?: number | null;
  reviewsCount?: number | null;
  imagesCount?: number | null;
  imageUrls?: string[] | null;
  reviews?: { text?: string | null; stars?: number | null; [key: string]: unknown }[] | null;
  categories?: string[] | null;
  categoryName?: string | null;
  description?: string | null;
  ownerDescription?: string | null;
  permanentlyClosed?: boolean | null;
  temporarilyClosed?: boolean | null;
};

export type LeadReview = { text: string; stars: number };

export type NewLead = {
  batch_id: string;
  /** Null quando o lead veio do Instagram (sem lugar no Google Maps). */
  place_id: string | null;
  name: string;
  business_type: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
  address: string | null;
  city: string | null;
  is_open: boolean;
  rating: number | null;
  reviews_count: number;
  images_count: number;
  description: string | null;
  categories: string[];
  photos: string[];
  reviews: LeadReview[];
  website_url: string | null;
  instagram_url?: string | null;
  instagram_last_post_at?: string | null;
  email?: string | null;
};

export function mapPlaceToLead(place: ApifyPlace, batchId: string): NewLead {
  const phone = place.phone ?? place.phoneUnformatted ?? null;
  return {
    batch_id: batchId,
    place_id: place.placeId,
    name: place.title,
    business_type: place.categoryName ?? null,
    phone_raw: phone,
    phone_e164: toMobileE164(phone),
    address: place.address ?? null,
    city: place.city ?? null,
    is_open: !place.permanentlyClosed && !place.temporarilyClosed,
    rating: place.totalScore ?? null,
    reviews_count: place.reviewsCount ?? 0,
    images_count: place.imagesCount ?? 0,
    description: place.description || place.ownerDescription || null,
    categories: place.categories ?? [],
    photos: place.imageUrls ?? [],
    reviews: (place.reviews ?? [])
      .filter((r) => r.text?.trim())
      .map((r) => ({ text: r.text!.trim(), stars: r.stars ?? 0 })),
    website_url: place.website || null,
  };
}

export function dedupeLeads<T extends Pick<NewLead, 'place_id' | 'phone_e164' | 'reviews_count'> & { instagram_url?: string | null; name?: string }>(leads: T[]): T[] {
  const byPlace = new Map<string, T>();
  for (const lead of leads) {
    const key = lead.place_id ?? `ig:${instagramHandle(lead.instagram_url) ?? lead.name}`;
    if (!byPlace.has(key)) byPlace.set(key, lead);
  }
  const byPhone = new Map<string, T>();
  const out: T[] = [];
  for (const lead of byPlace.values()) {
    if (!lead.phone_e164) {
      out.push(lead);
      continue;
    }
    const current = byPhone.get(lead.phone_e164);
    if (!current || lead.reviews_count > current.reviews_count) byPhone.set(lead.phone_e164, lead);
  }
  return [...out, ...byPhone.values()];
}
