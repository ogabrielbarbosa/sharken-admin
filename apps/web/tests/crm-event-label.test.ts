import { expect, it } from 'vitest';
import { chatLogLabel, eventLabel } from '@/lib/crm';

const label = (type: string, data = {}) => eventLabel({ type, data });

it('rotula os eventos de pagamento e contrato', () => {
  expect(label('pagamento_recebido')).toBe('Pagamento recebido');
  expect(label('contrato_assinado')).toBe('Contrato assinado');
  expect(label('contrato_criado')).toBe('Contrato criado');
});
it('rotula envio, parada, página e contato', () => {
  expect(label('mensagem_enviada', { kind: 'primeiro' })).toBe('Primeiro contato enviado');
  expect(label('mensagem_enviada', { kind: 'follow_up' })).toBe('Follow-up enviado');
  expect(label('mensagem_enviada', { kind: 'outro' })).toBeNull();
  expect(label('pedido_parar')).toBe('Pediu para parar');
  expect(label('modelo_removido')).toBe('Página removida');
  expect(label('pagina_gerada')).toBe('Página gerada');
  expect(label('contato_criado')).toBe('Contato criado');
  expect(label('contato_ligado', { vinculado: true })).toBe('Contato ligado ao lead');
  expect(label('contato_ligado', { vinculado: false })).toBeNull();
});
it('contato_<status> vira o nome do status; desconhecido fica de fora', () => {
  expect(label('contato_em_conversa')).toBe('Status: Em conversa');
  expect(label('contato_xyz')).toBeNull();
  expect(label('erro_pagina')).toBeNull();
});

import { HIDDEN_EVENTS } from '@/lib/crm';

// Todo tipo de evento gravado por logEvent (ou pelo SQL), com `kind` quando o texto depende dele.
const EMITTED: [string, Record<string, unknown>?][] = [
  ['encontrado'], ['abertura'], ['modelo_removido'], ['pagina_gerada'], ['erro_pagina'], ['erro_analise'], ['erro_video'],
  ['video_convertido'], ['video_renderizado'],
  ['mensagem_enviada', { kind: 'primeiro' }], ['mensagem_enviada', { kind: 'follow_up' }], ['mensagem_enviada', { kind: 'normal' }],
  ['mensagem_recebida'], ['pedido_parar'], ['pediu_para_parar'], ['numero_invalido'], ['conversa_aberta'], ['contato_enviado'], ['follow_up_enviado'],
  ['contato_criado'], ['contato_ligado', { vinculado: true }],
  ['contato_novo'], ['contato_contatado'], ['contato_follow_up'], ['contato_em_conversa'], ['contato_fechado'], ['contato_perdido'], ['contato_nao_contatar'],
  ['contrato_criado'], ['contrato_assinado'], ['pagamento_recebido'],
  ['etapa_analisando'], ['etapa_revisar'], ['etapa_completar'], ['etapa_gerando_material'], ['etapa_revisar_material'], ['etapa_crm'],
  ['etapa_vendido'], ['etapa_descartado'], ['etapa_sem_interesse'], ['etapa_nao_contatar'],
];

it('todo evento gravado tem rótulo ou está em HIDDEN_EVENTS (e nunca os dois)', () => {
  for (const [type, data = {}] of EMITTED) {
    const labeled = eventLabel({ type, data }) !== null;
    expect(labeled !== HIDDEN_EVENTS.has(type), `${type} ${JSON.stringify(data)}`).toBe(true);
  }
});
it('novos rótulos', () => {
  expect(label('mensagem_enviada', { kind: 'normal' })).toBe('Mensagem enviada');
  expect(label('numero_invalido')).toBe('Número sem WhatsApp');
  expect(label('etapa_vendido')).toBe('Vendido');
  expect(label('pediu_para_parar')).toBe('Pediu para parar');
});

it('logs da conversa dizem quem mudou, de qual valor para qual', () => {
  const name = (id: string) => ({ g: 'Gabriel', j: 'João Guilherme', a: 'Arthur' })[id] ?? id;
  expect(chatLogLabel({ field: 'responsavel', from: 'j', to: 'a' }, 'g', name)).toBe('Gabriel alterou o responsável de João Guilherme para Arthur');
  expect(chatLogLabel({ field: 'responsavel', from: null, to: 'a' }, 'g', name)).toBe('Gabriel definiu Arthur como responsável');
  expect(chatLogLabel({ field: 'estado', from: 'pendente', to: 'aberto' }, 'g', name)).toBe('Gabriel abriu o atendimento (de Pendente para Aberto)');
  expect(chatLogLabel({ field: 'estado', from: 'fechado', to: 'pendente' }, null, name)).toBe('Sistema marcou o atendimento como pendente (de Fechado para Pendente)');
  expect(chatLogLabel({ field: 'status', from: 'novo', to: 'contatado' }, 'g', name)).toBe('Gabriel alterou o status de Novo para Contatado');
});
