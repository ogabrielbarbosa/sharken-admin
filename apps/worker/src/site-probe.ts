import { computeSiteSignals, interpretAttempt, type SiteData, type SiteSignal } from '@lps/domain';
import type { Page } from 'playwright';
import { newContext } from './browser';

const TIMEOUT_MS = 20_000;

export type ProbeResult =
  | { result: 'falha'; detail: string }
  | { result: 'ok'; signals: SiteSignal[]; data: SiteData };

export async function extractSiteData(page: Page): Promise<SiteData> {
  return page.evaluate(() => {
    const clean = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();
    const meta = (name: string) => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
    const images = [...document.images]
      .filter((i) => i.naturalWidth >= 300 && i.src.startsWith('http'))
      .map((i) => i.src);
    const logo = [...document.images].find((i) => /logo/i.test(`${i.alt} ${i.src} ${i.className}`) && i.src.startsWith('http'));
    return {
      title: clean(document.title) || null,
      description: meta('description'),
      headings: [...document.querySelectorAll('h1, h2, h3')].map((h) => clean(h.textContent)).filter(Boolean).slice(0, 30),
      text: clean(document.body?.innerText).slice(0, 5000),
      images: [...new Set(images)].slice(0, 12),
      themeColor: meta('theme-color'),
      logo: logo?.src ?? null,
      // O texto guardado é cortado; o e-mail costuma estar no rodapé, então procura na página inteira.
      emails: [...new Set([
        ...[...document.querySelectorAll('a[href^="mailto:"]')].map((a) => (a.getAttribute('href') ?? '').slice(7).split('?')[0]),
        ...(document.body?.innerText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []),
      ].map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, 10),
      whatsappLinks: [...new Set([...document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp.com"]')].map((a) => (a as HTMLAnchorElement).href))].slice(0, 10),
    };
  });
}

export async function probeSite(url: string): Promise<ProbeResult> {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const context = await newContext();
  const page = await context.newPage();
  const started = Date.now();
  try {
    const response = await page.goto(target, { timeout: TIMEOUT_MS, waitUntil: 'load' });
    const status = response?.status();
    if (interpretAttempt({ status }) === 'falha') return { result: 'falha', detail: `Status ${status ?? 'sem resposta'}` };
    const loadMs = Date.now() - started;
    const hasViewportMeta = (await page.locator('meta[name="viewport"]').count()) > 0;
    const hasWhatsAppLink = (await page.locator('a[href*="wa.me"], a[href*="whatsapp.com"]').count()) > 0;
    const finalUrl = page.url();
    return {
      result: 'ok',
      signals: computeSiteSignals({ loadMs, https: finalUrl.startsWith('https://'), hasViewportMeta, hasWhatsAppLink }),
      data: await extractSiteData(page),
    };
  } catch (err) {
    const message = (err as Error).message;
    const timedOut = (err as Error).name === 'TimeoutError';
    const errorCode = message.match(/ERR_[A-Z_]+/)?.[0] ?? (timedOut ? undefined : 'ERR_UNKNOWN');
    if (interpretAttempt({ errorCode, timedOut }) === 'falha') return { result: 'falha', detail: errorCode ?? 'Tempo esgotado' };
    throw err;
  } finally {
    await context.close();
  }
}
