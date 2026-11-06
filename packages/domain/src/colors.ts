export const DEFAULT_PRIMARY = '#1f2937';

function toHex6(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase() ?? '';
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`;
  return null;
}

export function resolveColors(themeColor: string | null | undefined): { primary: string; onPrimary: string } {
  const primary = toHex6(themeColor) ?? DEFAULT_PRIMARY;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(primary.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return { primary, onPrimary: luminance > 0.55 ? '#111111' : '#ffffff' };
}
