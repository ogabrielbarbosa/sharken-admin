const MAX_BASE = 48;

export function siteSlug(name: string, random: () => string): string {
  const base = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE)
    .replace(/-+$/, '');
  return `${base || 'pagina'}-${random()}`;
}
