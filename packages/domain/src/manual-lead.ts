import type { NewLead } from './apify-mapper';
import { normalizeLinkUrl } from './completar';
import { instagramHandle } from './lead-keys';
import { toMobileE164 } from './phone';

export const MANUAL_LOCATION = 'Leads manuais';

export type ManualLeadInput = {
  name: string;
  businessType?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  website?: string;
  city?: string;
  address?: string;
  description?: string;
};

/** Dados digitados → lead. Só o nome é obrigatório; o que foi preenchido precisa ser válido. */
export function manualLead(input: ManualLeadInput, batch: { id: string; business_type: string }): { lead: NewLead & { batch_id: string } } | { error: string } {
  const text = (v?: string) => v?.trim() || null;
  const name = text(input.name);
  if (!name) return { error: 'Informe o nome do negócio.' };

  const phone = text(input.phone);
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (phone && (digits.length < 10 || digits.length > 13)) return { error: 'Informe o telefone com DDD.' };

  const email = text(input.email)?.toLowerCase() ?? null;
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: 'O e-mail não parece válido.' };

  const website = text(input.website);
  const website_url = website ? normalizeLinkUrl(website) : null;
  if (website && !website_url) return { error: 'O site não parece válido.' };

  const instagram = text(input.instagram);
  let instagram_url: string | null = null;
  if (instagram) {
    const isUser = /^@?[a-z0-9._]{1,30}$/i.test(instagram) && !/^(www\.)?instagram\.com$/i.test(instagram);
    const handle = instagramHandle(isUser ? `https://www.instagram.com/${instagram.replace(/^@/, '')}/` : instagram);
    if (!handle) return { error: 'Informe o @ ou o link do perfil do Instagram.' };
    instagram_url = `https://www.instagram.com/${handle}/`;
  }

  return {
    lead: {
      batch_id: batch.id, place_id: null, name, business_type: text(input.businessType) ?? batch.business_type,
      phone_raw: phone, phone_e164: toMobileE164(phone), email, address: text(input.address), city: text(input.city),
      is_open: true, rating: null, reviews_count: 0, images_count: 0, description: text(input.description),
      categories: [], photos: [], reviews: [], website_url, instagram_url,
    },
  };
}
