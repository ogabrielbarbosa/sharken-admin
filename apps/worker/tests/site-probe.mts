// Roda com tsx, como o worker em produção, porque o helper __name só aparece nesse caminho.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { closeBrowser } from '../src/browser';
import { probeSite } from '../src/site-probe';

const html = '<html><head><title>Pet</title><meta name="viewport" content="width=device-width"><meta name="theme-color" content="#0055aa"></head><body><h1>Banho</h1><a href="https://wa.me/55">zap</a><img class="logo" src="http://127.0.0.1:4598/logo.png"></body></html>';
const server = createServer((req, res) => {
  if (req.url === '/403') { res.writeHead(403); res.end('bloqueado'); return; }
  if (req.url === '/500') { res.writeHead(500); res.end('erro'); return; }
  res.setHeader('content-type', 'text/html');
  res.end(html);
});
await new Promise<void>((r) => server.listen(4598, r));
try {
  const ok = await probeSite('http://127.0.0.1:4598/');
  assert.equal(ok.result, 'ok');
  if (ok.result === 'ok') {
    assert.equal(ok.data.title, 'Pet');
    assert.deepEqual(ok.data.headings, ['Banho']);
    assert.equal(ok.data.themeColor, '#0055aa');
    assert.equal(ok.signals.find((s) => s.key === 'whatsapp')?.ok, true);
    assert.equal(ok.signals.find((s) => s.key === 'https')?.ok, false);
  }
  assert.equal((await probeSite('http://127.0.0.1:4598/403')).result, 'ok');
  assert.equal((await probeSite('http://127.0.0.1:4598/500')).result, 'falha');
  assert.equal((await probeSite('http://nao-existe.invalid/')).result, 'falha');
  console.log('site-probe ok');
} finally {
  server.close();
  await closeBrowser();
}
