import { describe, expect, it } from 'vitest';
import { buildSourceText } from '../src/source-text';
import { completeLead, improveLead } from './fixtures/leads';

describe('buildSourceText', () => {
  it('usa os dados do negócio e do site atual', () => {
    const text = buildSourceText(improveLead);
    expect(text).toContain('Clínica Sorriso');
    expect(text).toContain('Implantes');
  });
  it('nunca inclui o comentário interno', () => {
    expect(buildSourceText({ ...completeLead, comment: 'Dona se chama Carla' })).not.toContain('Carla');
  });
});
