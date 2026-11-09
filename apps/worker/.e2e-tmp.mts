import { chromium } from 'playwright';
const [batch, leadSold, lead1, outDir] = process.argv.slice(2);
const base = 'http://localhost:3100';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route(/wa\.me|api\.whatsapp/, (r) => r.abort());
const page = await ctx.newPage();
const problems: string[] = [];
page.on('pageerror', (e) => problems.push(`pageerror ${page.url()}: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/wa\.me|ERR_FAILED|404/.test(m.text())) problems.push(`console ${page.url()}: ${m.text().slice(0, 200)}`); });
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'OK ' : 'FAIL'} ${name}`); if (!ok) problems.push(name); };
const has = async (t: string) => (await page.getByText(t, { exact: false }).count()) > 0;

await page.goto(`${base}/painel`); check('sem sessão vai para login', page.url().includes('/login'));
await page.fill('input[name=email]', 'teste-local@sharken.dev'); await page.fill('input[name=password]', 'errada'); await page.click('button[type=submit]');
await page.waitForURL(/erro=credenciais/); check('senha errada avisa', await has('incorretos'));
await page.fill('input[name=email]', 'teste-local@sharken.dev'); await page.fill('input[name=password]', 'senha-local-123'); await page.click('button[type=submit]');
await page.waitForURL(/\/painel$/); check('login', await has('Overview'));
await page.screenshot({ path: `${outDir}/overview.png`, fullPage: true });

for (const [path, text] of [['/painel/batches', 'Todos os batches'], [`/painel/batches/${batch}/revisar`, 'E2E Pet 1'], [`/painel/batches/${batch}/material`, 'Falha de teste'], [`/painel/batches/${batch}/abordar`, 'Mensagem de primeiro contato'], [`/painel/batches/${batch}/aguardar`, 'Follow-up vencido'], [`/painel/batches/${batch}/conversa`, 'Sugerir resposta'], [`/painel/batches/${batch}/vendido`, 'Cadastrar cliente'], [`/painel/leads/${leadSold}`, 'Histórico'], ['/painel/clientes', 'Clientes']] as const) {
  const res = await page.goto(base + path); check(`${path} abre (${res?.status()}) com "${text}"`, res?.status() === 200 && await has(text));
  await page.screenshot({ path: `${outDir}/${path.split('/').pop()}.png`, fullPage: true });
}
// Novo batch: validação do drawer
await page.goto(`${base}/painel/batches?novo=1`); await page.click('text=Continuar'); check('drawer valida campos', await has('Preencha a localização'));
await page.screenshot({ path: `${outDir}/novo-batch.png` });
// Revisar: motivo obrigatório
await page.goto(`${base}/painel/batches/${batch}/revisar`);
const card = page.locator('section', { hasText: 'E2E Pet 2' }); await card.getByRole('button', { name: 'Avançar' }).click();
await page.waitForURL(/semMotivo/); check('site funcionando exige motivo', await has('precisam de um motivo'));
await page.locator('section', { hasText: 'E2E Pet 2' }).locator('input[name=reason]').fill('não abre bem no celular');
await page.locator('section', { hasText: 'E2E Pet 2' }).getByRole('button', { name: 'Avançar' }).click();
await page.waitForFunction(() => !document.body.innerText.includes('E2E Pet 2')); check('avança com motivo', true);
// Abordar: mensagem, confirmar só depois de abrir
await page.goto(`${base}/painel/batches/${batch}/abordar`);
const text = await page.locator('textarea').inputValue(); check('mensagem com & e link', text.includes('E2E Pet 5 & Cia') && text.includes('/p/e2e-slug-'));
check('confirmar bloqueado antes de abrir', await page.getByRole('button', { name: 'Confirmar envio' }).isDisabled());
await page.getByRole('button', { name: 'Abrir no WhatsApp' }).click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Confirmar envio' }).click();
await page.waitForFunction(() => document.body.innerText.includes('E2E Pet 6')); check('confirmar leva ao próximo', !(await page.locator('textarea').inputValue()).includes('Pet 5'));
check('melhorar site cita o motivo', (await page.locator('textarea').inputValue()).includes('é lento'));
// Pediu para parar
await page.getByRole('button', { name: 'Pediu para parar' }).click();
await page.waitForFunction(() => document.body.innerText.includes('Fila concluída')); check('pediu para parar sai da fila', true);
await page.screenshot({ path: `${outDir}/abordar-fim.png` });
// Vendido -> cliente
await page.goto(`${base}/painel/batches/${batch}/vendido`); await page.click('text=Cadastrar cliente'); await page.waitForURL(/cadastrar=/);
await page.fill('input[name=document]', '111.111.111-11'); await page.click('text=Salvar e adicionar serviço'); await page.waitForURL(/erro=/); check('CPF inválido avisa', await has('CPF ou CNPJ inválido'));
await page.fill('input[name=document]', '529.982.247-25'); await page.fill('input[name=contact_name]', 'Teste'); await page.click('text=Salvar e adicionar serviço');
await page.waitForURL(/clientes\/.*servico=1/); check('cliente criado abre novo serviço', await has('Novo serviço'));
await page.screenshot({ path: `${outDir}/cliente-servico.png` });
await page.fill('input[name=name]', 'Site'); await page.fill('input[name=amount]', '1.200,00'); await page.fill('input[name=start_date]', '2026-11-06'); await page.click('text=Salvar serviço');
await page.waitForFunction(() => document.body.innerText.includes('R$ 1.200,00') || document.body.innerText.includes('R$ 1.200,00'.replace(' ', ' '))); check('serviço salvo com contrato rascunho', await has('Rascunho'));
await page.getByRole('button', { name: 'Enviar para assinatura' }).click(); await page.waitForURL(/erro=/); check('sem chaves do ZapSign mostra erro claro', await has('ZAPSIGN'));
await page.screenshot({ path: `${outDir}/cliente.png`, fullPage: true });
// Página pública
const pub = await ctx.newPage(); const r = await pub.goto(`${base}/p/e2e-slug-0`);
check('modelo aberto com noindex', r?.status() === 200 && (r.headers()['x-robots-tag'] ?? '').includes('noindex') && (await pub.content()).includes('Ainda não publicado'));
await pub.setViewportSize({ width: 390, height: 844 }); await pub.screenshot({ path: `${outDir}/modelo-celular.png`, fullPage: true });
const missing = await ctx.newPage(); const r2 = await missing.goto(`${base}/p/nao-existe`); check('modelo inexistente responde 404 neutro', r2?.status() === 404 && (await missing.content()).includes('não está mais disponível'));
// Celular no painel
await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/painel/batches/${batch}/revisar`);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); check(`sem rolagem horizontal no celular (${overflow}px)`, overflow <= 1);
await browser.close();
console.log(problems.length ? `PROBLEMAS:\n${problems.join('\n')}` : 'SEM PROBLEMAS');
