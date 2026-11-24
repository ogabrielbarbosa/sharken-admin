import { describeChange, type LeadChange } from './lead-edit';
import { canTransition, type LeadStage } from './stages';

export type LeadAction = 'descartar' | 'nao_contatar';

export function availableActions(lead: { stage: LeadStage }): LeadAction[] {
  const actions: LeadAction[] = [];
  if (canTransition(lead.stage, 'descartado')) actions.push('descartar');
  if (canTransition(lead.stage, 'nao_contatar')) actions.push('nao_contatar');
  return actions;
}

const LABELS: Record<string, string> = {
  reanalise: 'Voltou para a análise (regras novas de descarte)',
  enriquecido: 'Contatos procurados no site, WHOIS e CNPJ',
  instagram_do_site: 'Instagram achado no site',
  reencontrado: 'Encontrado de novo em outro batch',
  instagram_atualizado: 'Instagram analisado',
  encontrado: 'Encontrado no batch',
  cadastrado: 'Cadastrado à mão',
  google_lido: 'Dados puxados do Google',
  site_lido: 'Site lido de novo',
  erro_google: 'Não foi possível ler o Google',
  juntado: 'Juntado com um lead duplicado',
  etapa_revisar: 'Análise concluída',
  etapa_gerando_material: 'Avançado na revisão',
  etapa_revisar_material: 'Material pronto para revisão',
  etapa_aguardando: 'Enviado para Aguardar',
  etapa_follow_up_feito: 'Follow-up concluído',
  etapa_conversa: 'Respondeu no WhatsApp',
  etapa_abordar: 'Material aprovado',
  etapa_completar: 'Enviado para Completar',
  etapa_crm: 'Loom anexado, no CRM',
  etapa_pagina: 'Informações completas',
  etapa_video: 'Página anexada',
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
  if (event.type === 'dados_editados') return describeChange(event.data as LeadChange);
  return LABELS[event.type] ?? event.type.replace(/_/g, ' ');
}
