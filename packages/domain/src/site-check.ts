import type { Flow, SiteSignal, SiteStatus } from './types';

export function interpretAttempt(a: { errorCode?: string; timedOut?: boolean; status?: number }): 'ok' | 'falha' {
  if (a.errorCode || a.timedOut) return 'falha';
  const status = a.status ?? 0;
  if (status === 0 || status === 404 || status === 410 || status >= 500) return 'falha';
  return 'ok';
}

export function nextCheckStep(failuresSoFar: number): { action: 'tentar_de_novo'; delayMinutes: 5 } | { action: 'fora_do_ar' } {
  return failuresSoFar >= 3 ? { action: 'fora_do_ar' } : { action: 'tentar_de_novo', delayMinutes: 5 };
}

export function flowFromSiteStatus(status: SiteStatus): Flow {
  return status === 'funcionando' ? 'melhorar_site' : 'sem_site';
}

export function computeSiteSignals(m: { loadMs: number; https: boolean; hasViewportMeta: boolean; hasWhatsAppLink: boolean }): SiteSignal[] {
  return [
    { key: 'velocidade', label: `Carregou em ${(m.loadMs / 1000).toFixed(1).replace('.', ',')} s`, ok: m.loadMs <= 3000 },
    { key: 'https', label: m.https ? 'Com HTTPS' : 'Sem HTTPS', ok: m.https },
    { key: 'celular', label: m.hasViewportMeta ? 'Adaptado ao celular' : 'Não adaptado ao celular', ok: m.hasViewportMeta },
    { key: 'whatsapp', label: m.hasWhatsAppLink ? 'Com botão de WhatsApp' : 'Sem botão de WhatsApp', ok: m.hasWhatsAppLink },
  ];
}
