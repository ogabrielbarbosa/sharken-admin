import { expect, it } from 'vitest';
import { availableActions, describeEvent } from '../src/lead-actions';

it('oferece as ações de quem está no CRM', () => {
  expect(availableActions({ stage: 'crm' })).toEqual(expect.arrayContaining(['descartar', 'nao_contatar', 'remover_modelo']));
});
it('não permite descartar um lead vendido', () => {
  const actions = availableActions({ stage: 'vendido' });
  expect(actions).toContain('remover_modelo');
  expect(actions).not.toContain('descartar');
});
it('não oferece nenhuma ação de contato em não contatar', () => {
  expect(availableActions({ stage: 'nao_contatar' })).toEqual(['remover_modelo']);
});
it('traduz os eventos para o histórico', () => {
  expect(describeEvent({ type: 'contato_enviado', data: {} })).toBe('Envio confirmado por você');
  expect(describeEvent({ type: 'encontrado', data: {} })).toBe('Encontrado no batch');
  expect(describeEvent({ type: 'etapa_vendido', data: {} })).toBe('Venda registrada');
  expect(describeEvent({ type: 'tipo_novo', data: {} })).toBe('tipo novo');
});
