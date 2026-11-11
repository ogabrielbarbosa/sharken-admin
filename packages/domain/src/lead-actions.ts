import { canTransition, type LeadStage } from './stages';

export type LeadAction = 'descartar' | 'nao_contatar' | 'remover_modelo';

export function availableActions(lead: { stage: LeadStage }): LeadAction[] {
  const actions: LeadAction[] = [];
  if (canTransition(lead.stage, 'descartado')) actions.push('descartar');
  if (canTransition(lead.stage, 'nao_contatar')) actions.push('nao_contatar');
  actions.push('remover_modelo');
  return actions;
}

const LABELS: Record<string, string> = {
  encontrado: 'Encontrado no batch',
  etapa_revisar: 'Análise concluída',
  etapa_gerando_material: 'Avançado na revisão',
  etapa_revisar_material: 'Material pronto para revisão',
  etapa_completar: 'Enviado para Completar',
  etapa_crm: 'Material aprovado, no CRM',
  etapa_vendido: 'Venda registrada',
  etapa_sem_interesse: 'Sem interesse',
  etapa_descartado: 'Descartado',
  etapa_nao_contatar: 'Marcado como não contatar',
  pagina_gerada: 'Página de exemplo gerada',
  video_renderizado: 'Vídeo renderizado',
  conversa_aberta: 'Aberto no WhatsApp',
  contato_enviado: 'Envio confirmado por você',
  follow_up_enviado: 'Follow-up confirmado por você',
  abertura: 'O lead abriu a página',
  numero_invalido: 'Número inválido',
  pediu_para_parar: 'Pediu para parar',
  modelo_removido: 'Modelo removido',
  erro_analise: 'Erro na análise',
  erro_pagina: 'Erro ao gerar a página',
  erro_video: 'Erro ao renderizar o vídeo',
};

export function describeEvent(event: { type: string; data?: unknown }): string {
  return LABELS[event.type] ?? event.type.replace(/_/g, ' ');
}
