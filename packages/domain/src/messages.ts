import type { Lead } from './types';

export type MessageTemplates = { sem_site: string; fora_do_ar: string; melhorar_site: string; follow_up: string };
export type MessageVars = { nome: string; cidade: string; tipo: string; motivo: string; link: string; seu_nome?: string };

const FIELDS: Record<string, keyof MessageVars> = {
  '[nome do negócio]': 'nome',
  '[cidade]': 'cidade',
  '[tipo de negócio]': 'tipo',
  '[motivo]': 'motivo',
  '[link]': 'link',
  '[seu nome]': 'seu_nome',
};

export function renderMessage(template: string, vars: MessageVars): string {
  return template.replace(/\[[^\]]+\]/g, (field) => {
    const key = FIELDS[field];
    if (!key) throw new Error(`Campo desconhecido na mensagem: ${field}`);
    const value = vars[key]?.trim();
    if (!value) throw new Error(`Campo sem valor na mensagem: ${key}`);
    return value;
  });
}

export function messageVars(lead: Pick<Lead, 'name' | 'city' | 'business_type' | 'reason'>, link: string, signer?: string): MessageVars {
  return { nome: lead.name, cidade: lead.city ?? 'sua região', tipo: lead.business_type ?? '', motivo: lead.reason ?? '', link, seu_nome: signer };
}

export function selectFirstMessage(lead: Lead, templates: MessageTemplates, extra: { link: string; signer?: string }): string {
  const template =
    lead.flow === 'melhorar_site' ? templates.melhorar_site : lead.site_status === 'fora_do_ar' ? templates.fora_do_ar : templates.sem_site;
  return renderMessage(template, messageVars(lead, extra.link, extra.signer));
}

export function buildFollowUpMessage(lead: Lead, templates: MessageTemplates, extra: { link: string; signer?: string }): string {
  return renderMessage(templates.follow_up, messageVars(lead, extra.link, extra.signer));
}

export function buildWhatsAppLink(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164}?text=${encodeURIComponent(text)}`;
}
