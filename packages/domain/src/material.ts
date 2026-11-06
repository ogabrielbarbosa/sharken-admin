export type VideoStatus = 'na_fila' | 'renderizando' | 'pronto' | 'erro';

export function newSiteSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + 30 * 86_400_000);
}

export function isMaterialReady(a: { siteReady: boolean; videoEnabled: boolean; videoStatus: VideoStatus | null }): boolean {
  if (!a.siteReady) return false;
  return !a.videoEnabled || a.videoStatus === 'pronto';
}

export function needsStockPhotos(own: string[]): boolean {
  return own.length < 3;
}
