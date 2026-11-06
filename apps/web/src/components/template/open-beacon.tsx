'use client';

import { useEffect } from 'react';

// Roda no navegador: a prévia do link no WhatsApp não executa JavaScript e não conta como abertura.
export function OpenBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    void fetch('/api/open', { method: 'POST', body: JSON.stringify({ slug }), keepalive: true });
  }, [slug]);
  return null;
}
