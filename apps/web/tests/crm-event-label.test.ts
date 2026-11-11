import { expect, it } from 'vitest';
import { eventLabel } from '@/lib/crm';

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
