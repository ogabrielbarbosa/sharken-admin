import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { newContext } from './browser';

const SIZE = { width: 1280, height: 720 };

/** Grava a rolagem da página do início ao fim, durante o tempo pedido. */
export async function recordPage(url: string, seconds: number, dir: string, name: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const context = await newContext({ viewport: SIZE, recordVideo: { dir, size: SIZE } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  await page.evaluate(async (ms) => {
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        const progress = Math.min((now - start) / ms, 1);
        window.scrollTo(0, distance * progress);
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }, seconds * 1000);
  const video = page.video();
  await context.close();
  if (!video) throw new Error('A gravação da página falhou.');
  const target = join(dir, name);
  await rename(await video.path(), target);
  return target;
}
