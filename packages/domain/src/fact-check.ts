import type { PageCopy } from './page-copy';

const CREDENTIAL_STEMS = ['certificad', 'credenciad', 'premiad', 'especialista', 'lider', 'melhor', 'garantia'];

const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ');

function claimsIn(text: string): string[] {
  const patterns = [
    /r\$\s*\d[\d.,]*/g,
    /\d+(?:[.,]\d+)?\s*%/g,
    /\d+\s+anos?(?:\s+de\s+[a-z]+)?/g,
    new RegExp(`\\b[a-z]*(?:${CREDENTIAL_STEMS.join('|')})[a-z]*\\b`, 'g'),
  ];
  return patterns.flatMap((p) => text.match(p) ?? []);
}

const coreOf = (claim: string) => claim.match(/^\d+\s+anos?/)?.[0] ?? claim;

export function findUnsupportedClaims(copy: PageCopy, sourceText: string): string[] {
  const source = normalize(sourceText);
  const texts = [copy.headline, copy.subheadline, copy.about, copy.cta, ...copy.services.map((s) => s.description)];
  const problems = texts
    .filter((t): t is string => !!t)
    .flatMap((t) => claimsIn(normalize(t)))
    .filter((claim) => !source.includes(coreOf(claim).trim()));

  for (const service of copy.services) {
    const words = normalize(service.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    const supported = words.length > 0 ? words.every((w) => source.includes(w)) : source.includes(normalize(service.name));
    if (!supported) problems.push(service.name);
  }
  return [...new Set(problems)];
}
