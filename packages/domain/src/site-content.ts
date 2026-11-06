import { resolveColors } from './colors';
import type { PageCopy } from './page-copy';
import type { Lead } from './types';

export type SitePhoto = { url: string; stock: boolean };

export type SiteContent = {
  copy: PageCopy;
  business: { name: string; phoneE164: string; address: string; city: string | null; mapsQuery: string };
  photos: SitePhoto[];
  reviews: { text: string; stars: number }[];
  rating: number | null;
  reviewsCount: number;
  colors: { primary: string; onPrimary: string };
  logo: string | null;
  videoUrl?: string;
};

export function buildSiteContent(lead: Lead, copy: PageCopy, photos: SitePhoto[]): SiteContent {
  return {
    copy,
    business: {
      name: lead.name,
      phoneE164: lead.phone_e164 ?? '',
      address: lead.address ?? '',
      city: lead.city,
      mapsQuery: `${lead.name}, ${lead.address ?? ''}`,
    },
    photos,
    reviews: lead.reviews.slice(0, 5),
    rating: lead.rating,
    reviewsCount: lead.reviews_count,
    colors: resolveColors(lead.flow === 'melhorar_site' ? lead.site_data?.themeColor : null),
    logo: lead.flow === 'melhorar_site' ? lead.site_data?.logo ?? null : null,
  };
}
