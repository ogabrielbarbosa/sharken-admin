import { chromium, type Browser } from 'playwright';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser?.isConnected()) browser = await chromium.launch();
  return browser;
}

export async function closeBrowser() {
  await browser?.close();
  browser = null;
}
