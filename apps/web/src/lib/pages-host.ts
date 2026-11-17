/** Host das páginas publicadas (PAGES_URL; padrão pages.sharkenapps.com). */
export function pagesHost(): string {
  try {
    return new URL(process.env.PAGES_URL?.trim() || 'https://pages.sharkenapps.com').host;
  } catch {
    return 'pages.sharkenapps.com';
  }
}

/** Caminho interno que serve as páginas; só responde no host das páginas. */
export const PAGES_ROUTE = '/paginas-publicadas';
