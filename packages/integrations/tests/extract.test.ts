import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractHtmlText, extractPdfText, instagramToExtract, MAX_EXTRACTED_CHARS, truncateText } from '../src/extract';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures/extract', name));

describe('extractHtmlText', () => {
  const result = extractHtmlText(fixture('pagina.html').toString('utf8'), 'https://padaria.exemplo.com/loja/');

  it('devolve o título', () => {
    expect(result.title).toBe('Padaria Exemplo & Cia');
  });
  it('tira script e style', () => {
    expect(result.text).not.toContain('segredo');
    expect(result.text).not.toContain('color: red');
    expect(result.text).not.toContain('console.log');
    expect(result.text).toContain('Pães feitos todo dia');
    expect(result.text).toContain('segunda a sábado');
  });
  it('devolve as imagens absolutas, sem repetir nem data URI', () => {
    expect(result.images).toEqual([
      'https://padaria.exemplo.com/img/balcao.jpg',
      'https://cdn.exemplo.com/fachada.png',
      'https://cdn.exemplo.com/forno.webp',
    ]);
  });
});

describe('extractPdfText', () => {
  it('lê a frase do PDF', async () => {
    const text = await extractPdfText(new Uint8Array(fixture('curriculo.pdf')));
    expect(text).toContain('Experiencia em atendimento ao cliente');
  });
});

describe('truncateText', () => {
  it('corta acima de 20.000 caracteres', () => {
    expect(MAX_EXTRACTED_CHARS).toBe(20_000);
    expect(truncateText('a'.repeat(25_000))).toHaveLength(20_000);
    expect(truncateText('curto')).toBe('curto');
  });
});

describe('instagramToExtract', () => {
  it('junta bio, link e legendas de até 12 posts', () => {
    const posts = Array.from({ length: 15 }, (_, i) => ({ caption: `legenda ${i}`, displayUrl: `https://img/${i}.jpg` }));
    const r = instagramToExtract({ biography: 'Padaria artesanal', externalUrl: 'https://padaria.exemplo.com', profilePicUrl: 'https://img/perfil.jpg', latestPosts: posts });
    expect(r.text).toContain('Bio: Padaria artesanal');
    expect(r.text).toContain('Link na bio: https://padaria.exemplo.com');
    expect(r.text).toContain('legenda 11');
    expect(r.text).not.toContain('legenda 12');
    expect(r.images[0]).toBe('https://img/perfil.jpg');
  });
});
