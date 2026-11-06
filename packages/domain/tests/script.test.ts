import { describe, expect, it } from 'vitest';
import { findMissingRecordings, parseScript, renderScript, resolveSlotText } from '../src/script';
import { buildTimeline, checkDuration } from '../src/video-timing';

describe('parseScript', () => {
  it('separa trechos fixos e campos', () => {
    const out = parseScript('Oi, pessoal da [nome do negócio]! Aqui é o Gabriel.');
    expect(out.map((s) => s.kind)).toEqual(['fixed', 'slot', 'fixed']);
    expect(out[1]).toEqual({ kind: 'slot', slot: 'nome' });
    expect(out[0]).toMatchObject({ text: 'Oi, pessoal da' });
  });
  it('muda o id só da frase alterada', () => {
    const a = parseScript('Primeira. [cidade] Segunda.');
    const b = parseScript('Primeira. [cidade] Segunda alterada.');
    expect((a[0] as { id: string }).id).toBe((b[0] as { id: string }).id);
    expect((a[2] as { id: string }).id).not.toBe((b[2] as { id: string }).id);
  });
  it('recusa campo desconhecido citando o nome', () => {
    expect(() => parseScript('Custa [preço].')).toThrow(/preço/);
  });
});

describe('findMissingRecordings', () => {
  it('lista os trechos sem áudio', () => {
    const segments = parseScript('Primeira. [cidade] Segunda.');
    const first = (segments[0] as { id: string }).id;
    const missing = findMissingRecordings(segments, [first]);
    expect(missing).toHaveLength(1);
    expect(missing[0].text).toBe('Segunda.');
  });
});

describe('textos do roteiro', () => {
  const vars = { nome: 'Pet', cidade: 'Campinas', tipo: 'pet shop', motivo: 'é lento' };
  it('resolve cada campo', () => {
    expect(resolveSlotText('motivo', vars)).toBe('é lento');
  });
  it('monta o texto inteiro para a voz clonada', () => {
    expect(renderScript('Oi [nome do negócio], em [cidade].', vars)).toBe('Oi Pet, em Campinas.');
  });
});

describe('buildTimeline', () => {
  it('encadeia os trechos em quadros', () => {
    expect(buildTimeline([{ durationSeconds: 2 }, { durationSeconds: 1.5 }], 30)).toEqual([
      { from: 0, durationInFrames: 60 },
      { from: 60, durationInFrames: 45 },
    ]);
  });
});

describe('checkDuration', () => {
  it('classifica pelos limites de 60 e 90 segundos', () => {
    expect(checkDuration(59)).toBe('curto');
    expect(checkDuration(60)).toBe('ok');
    expect(checkDuration(90)).toBe('ok');
    expect(checkDuration(91)).toBe('longo');
  });
});
