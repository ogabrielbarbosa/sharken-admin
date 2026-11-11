import { describe, expect, it } from 'vitest';
import { checkPageHtml } from '../src/page-checks';

const facts = { name: 'Clínica Dr. João', phoneDigits: '19987654321', sourceText: 'Clínica Dr. João faz limpeza e clareamento.', allowedHosts: ['abc.supabase.co'] };
const clean = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
<style>@font-face{src:url(https://fonts.gstatic.com/x.woff2)} .h{background:url(img/a.jpg)}</style></head><body>
<h1>Clínica Dr. João</h1><img src="https://abc.supabase.co/storage/v1/o/a.jpg"><img src="data:image/png;base64,AAA">
<div data-slot="video"></div><a href="https://wa.me/5519987654321">Whats</a><a href="tel:+5519987654321">Ligar</a>
<p>Telefone (19) 98765-4321</p></body></html>`;

describe('checkPageHtml', () => {
  it('HTML limpo não tem problemas', () => {
    expect(checkPageHtml(clean, facts)).toEqual([]);
  });
  it('exige o espaço do vídeo', () => {
    expect(checkPageHtml(clean.replace('data-slot="video"', ''), facts)).toContain('Falta o espaço do vídeo (data-slot="video").');
  });
  it('recusa script', () => {
    expect(checkPageHtml(clean.replace('</body>', '<script>1</script></body>'), facts)).toContain('A página tem <script>.');
  });
  it('recusa recurso de fora em tag e em CSS', () => {
    expect(checkPageHtml(clean.replace('</body>', '<img src="https://evil.com/a.png"></body>'), facts)).toContain(
      'Carrega recurso de fora: https://evil.com/a.png',
    );
    expect(checkPageHtml(clean.replace('url(img/a.jpg)', 'url("//cdn.x.com/a.jpg")'), facts)).toContain(
      'Carrega recurso de fora: //cdn.x.com/a.jpg',
    );
  });
  it('permite links mailto, tel e wa.me, mas não outros links externos como recurso', () => {
    const html = clean.replace('</body>', '<a href="mailto:a@b.com">e</a><link rel="stylesheet" href="https://evil.com/s.css"></body>');
    expect(checkPageHtml(html, facts)).toEqual(['Carrega recurso de fora: https://evil.com/s.css']);
  });
  it('permite links externos em <a>, mas não <link>, <iframe> nem <base>', () => {
    const ok = clean.replace('</body>', '<a href="https://instagram.com/x">ig</a><a href="https://maps.google.com/?q=1">m</a></body>');
    expect(checkPageHtml(ok, facts)).toEqual([]);
    const bad = clean.replace('</body>', '<link href="https://evil.com/a.css"><iframe src="https://evil.com/f"></iframe><base href="https://evil.com/"></body>');
    expect(checkPageHtml(bad, facts)).toEqual([
      'Carrega recurso de fora: https://evil.com/a.css',
      'Carrega recurso de fora: https://evil.com/f',
      'Carrega recurso de fora: https://evil.com/',
    ]);
  });
  it('recusa handlers inline e javascript:', () => {
    const msg = 'A página tem JavaScript embutido.';
    expect(checkPageHtml(clean.replace('<h1>', '<h1 onclick="x()">'), facts)).toContain(msg);
    expect(checkPageHtml(clean.replace('</body>', '<a href="javascript:alert(1)">x</a></body>'), facts)).toContain(msg);
    expect(checkPageHtml(clean, facts)).not.toContain(msg);
  });
  it('exige nome e telefone', () => {
    const html = clean.replace(/Clínica Dr\. João/g, 'X').replace('(19) 98765-4321', '');
    const out = checkPageHtml(html, facts);
    expect(out).toContain('Falta o nome do negócio.');
    expect(out).toContain('Falta o telefone.');
  });
  it('aceita telefone com código do país', () => {
    expect(checkPageHtml(clean.replace('(19) 98765-4321', '+55 19 98765-4321'), facts)).toEqual([]);
  });
  it('inclui afirmações sem respaldo', () => {
    const out = checkPageHtml(clean.replace('<p>', '<p>Somos a melhor clínica, 20 anos de experiência. '), facts);
    expect(out.join(' ')).toContain('melhor');
    expect(out.join(' ')).toContain('20 anos');
  });
});
