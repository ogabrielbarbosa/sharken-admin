import { chromium, type Browser, type BrowserContextOptions } from 'playwright';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser?.isConnected()) browser = await chromium.launch();
  return browser;
}

export async function closeBrowser() {
  await browser?.close();
  browser = null;
}

/** O tsx embrulha funções com o helper __name, que não existe na página aberta. */
export async function newContext(options?: BrowserContextOptions) {
  const browser = await getBrowser();
  const context = await browser.newContext(options);
  try {
    await context.addInitScript('globalThis.__name = (target) => target;');
  } catch (err) {
    await context.close().catch(() => {});
    throw err;
  }
  return context;
}
