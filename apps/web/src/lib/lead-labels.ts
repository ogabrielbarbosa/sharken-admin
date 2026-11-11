import type { Lead } from '@lps/domain';
import type { Tone } from '@/components/ui';

export function siteLabel(lead: Pick<Lead, 'site_status'>): { label: string; tone: Tone } {
  switch (lead.site_status) {
    case 'funcionando': return { label: 'Funcionando', tone: 'success' };
    case 'fora_do_ar': return { label: 'Fora do ar', tone: 'danger' };
    default: return { label: 'Sem site', tone: 'neutral' };
  }
}

export function flowLabel(lead: Pick<Lead, 'flow' | 'site_status'>): { label: string; tone: Tone } {
  if (lead.flow === 'melhorar_site') return { label: 'Melhorar site', tone: 'warning' };
  if (lead.site_status === 'fora_do_ar') return { label: 'Fora do ar', tone: 'danger' };
  return { label: 'Sem site', tone: 'neutral' };
}

export const leadMeta = (lead: Pick<Lead, 'business_type' | 'city'>) => [lead.business_type, lead.city].filter(Boolean).join(' · ');

export const formatDate = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

export const formatDateTime = (value: string | Date) =>
  new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** "Ativo · há 3 dias", "Parado · 4 meses". */
export function instagramLabel(lead: Pick<Lead, 'instagram_url' | 'instagram_last_post_at'>, active: boolean | undefined): { label: string; tone: Tone } {
  if (!lead.instagram_url) return { label: 'Sem Instagram', tone: 'neutral' };
  const tone: Tone = active ? 'success' : 'neutral';
  const prefix = active ? 'Ativo' : 'Parado';
  if (!lead.instagram_last_post_at) return { label: prefix, tone };
  const days = Math.max(0, Math.floor((Date.now() - new Date(lead.instagram_last_post_at).getTime()) / 86_400_000));
  if (active) return { label: `${prefix} · ${days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`}`, tone };
  const months = Math.floor(days / 30);
  return { label: `${prefix} · ${months >= 12 ? `${Math.floor(months / 12)} ${months < 24 ? 'ano' : 'anos'}` : months >= 1 ? `${months} ${months === 1 ? 'mês' : 'meses'}` : `${days} dias`}`, tone };
}
