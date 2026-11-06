import { expect, it } from 'vitest';
import { mergeLeadOnReimport, toLocationKey } from '../src/lead-import';
import { summarizeBatch } from '../src/batch-summary';

const existing = { stage: 'aguardando', flow: 'sem_site', contacted_at: '2026-11-01', batch_id: 'old', rating: 4, reviews_count: 10, images_count: 2, photos: ['a'], reviews: [], description: 'antiga' } as const;
const incoming = { batch_id: 'new', place_id: 'p', name: 'X', rating: 4.5, reviews_count: 20, images_count: 5, photos: ['b'], reviews: [{ text: 'bom', stars: 5 }], description: null } as never;

it('reimportação atualiza os números sem mexer no andamento do lead', () => {
  const patch = mergeLeadOnReimport(existing as never, incoming);
  expect(patch).toMatchObject({ rating: 4.5, reviews_count: 20, images_count: 5, photos: ['b'] });
  for (const key of ['stage', 'flow', 'contacted_at', 'batch_id']) expect(patch).not.toHaveProperty(key);
});

it('reimportação não apaga a descrição que já existe', () => {
  expect(mergeLeadOnReimport(existing as never, incoming)).not.toHaveProperty('description');
});

it('normaliza a localização para agrupar a mesma região', () => {
  expect(toLocationKey('Campinas, SP')).toBe(toLocationKey(' campinas,  sp '));
  expect(toLocationKey('São Paulo')).toBe('sao paulo');
});

it('resume o batch por etapa e aponta a primeira ação pendente', () => {
  const stages = ['revisar', 'revisar', 'gerando_material', 'revisar_material', 'abordar', 'follow_up_feito', 'conversa', 'vendido', 'descartado', 'analisando'];
  const out = summarizeBatch(stages.map((stage) => ({ stage })) as never);
  expect(out.counts).toEqual({ revisar: 2, material: 2, abordar: 1, aguardar: 1, conversa: 1, vendido: 1 });
  expect(out.nextAction).toBe('2 para revisar');
});

it('usa o singular e pula etapas sem ação sua', () => {
  expect(summarizeBatch([{ stage: 'conversa' }] as never).nextAction).toBe('1 resposta em Conversa');
  expect(summarizeBatch([{ stage: 'gerando_material' }] as never).nextAction).toBeNull();
  expect(summarizeBatch([{ stage: 'vendido' }] as never).nextAction).toBeNull();
});
