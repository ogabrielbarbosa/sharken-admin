import { describe, expect, it } from 'vitest';
import { expiredPageHtml, injectPage, pageCsp } from '@/lib/page-html';

const html = '<html><body><div data-slot="video"></div><h1>Oi</h1></body></html>';

describe('injectPage', () => {
  it('coloca o vídeo no espaço e o script de abertura antes de </body>', () => {
    const out = injectPage(html, { videoUrl: 'https://s.test/media/v.mp4', beaconSlug: 'clinica-x7k2', nonce: 'abc' });
    expect(out).toContain('<div data-slot="video"><video src="https://s.test/media/v.mp4" controls playsinline preload="metadata"');
    expect(out).toMatch(/<script nonce="abc">[^<]*\/api\/open[^<]*clinica-x7k2[^<]*<\/script><\/body>/);
  });

  it('remove o espaço quando não há vídeo', () => {
    const out = injectPage(html, { videoUrl: null, beaconSlug: 'a' });
    expect(out).not.toContain('data-slot');
    expect(out).not.toContain('<video');
    expect(out).toContain('<h1>Oi</h1>');
  });

  it('não injeta script sem beaconSlug (captura e prévia)', () => {
    const out = injectPage(html, { videoUrl: null, beaconSlug: null });
    expect(out).not.toContain('<script');
  });

  it('escapa a URL do vídeo', () => {
    const out = injectPage(html, { videoUrl: 'https://s.test/a"onerror="x', beaconSlug: null });
    expect(out).not.toContain('"onerror="x');
  });
});

describe('expiredPageHtml', () => {
  it('mostra a mensagem e o botão de WhatsApp', () => {
    const out = expiredPageHtml('Sharken', 'https://wa.me/5511999990000');
    expect(out).toContain('Este modelo não está mais disponível.');
    expect(out).toContain('href="https://wa.me/5511999990000"');
    expect(out).toContain('noindex');
  });

  it('omite o botão sem número', () => {
    expect(expiredPageHtml('Sharken', '')).not.toContain('<a ');
  });

  it('escapa o nome comercial', () => {
    expect(expiredPageHtml('<b>x</b>', '')).not.toContain('<b>x</b>');
  });
});

describe('pageCsp', () => {
  it('libera só Storage, Google Fonts e o script com nonce', () => {
    const csp = pageCsp('https://proj.supabase.co', 'n1');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'nonce-n1'");
    expect(csp).toContain('img-src https://proj.supabase.co data: blob:');
    expect(csp).toContain('media-src https://proj.supabase.co data: blob:');
    expect(csp).toContain('style-src');
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain('font-src https://fonts.gstatic.com');
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });
});
