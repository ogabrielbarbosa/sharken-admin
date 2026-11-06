import type { Flow } from './types';

export function canAdvance(lead: { flow: Flow | null; reason: string | null }): { allowed: boolean; error?: string } {
  if (lead.flow === 'melhorar_site' && !lead.reason?.trim()) {
    return { allowed: false, error: 'Preencha o motivo para avançar um lead com site funcionando.' };
  }
  return { allowed: true };
}
