import { expect, it } from 'vitest';
import { availableActions, describeEvent } from '../src/lead-actions';

it('oferece as ações de quem está no CRM', () => {
  expect(availableActions({ stage: 'crm' })).toEqual(expect.arrayContaining(['descartar', 'nao_contatar']));
});
it('não permite descartar um lead vendido', () => {
  const actions = availableActions({ stage: 'vendido' });
  expect(actions).toContain('nao_contatar');
  expect(actions).not.toContain('descartar');
});
it('não oferece nenhuma ação de contato em não contatar', () => {
  expect(availableActions({ stage: 'nao_contatar' })).toEqual([]);
});
it('traduz os eventos para o histórico', () => {
  expect(describeEvent({ type: 'contato_enviado', data: {} })).toBe('Envio confirmado por você');
  expect(describeEvent({ type: 'encontrado', data: {} })).toBe('Encontrado no batch');
  expect(describeEvent({ type: 'etapa_vendido', data: {} })).toBe('Venda registrada');
  expect(describeEvent({ type: 'etapa_pagina', data: {} })).toBe('Informações completas');
  expect(describeEvent({ type: 'etapa_video', data: {} })).toBe('Página anexada');
  expect(describeEvent({ type: 'etapa_crm', data: {} })).toBe('Loom anexado, no CRM');
  expect(describeEvent({ type: 'tipo_novo', data: {} })).toBe('tipo novo');
});
