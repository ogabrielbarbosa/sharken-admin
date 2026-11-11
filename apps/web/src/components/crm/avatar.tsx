'use client';

import { useState } from 'react';

const PALETTE = ['bg-sky-700', 'bg-emerald-700', 'bg-violet-700', 'bg-amber-700', 'bg-rose-700', 'bg-teal-700', 'bg-indigo-700', 'bg-fuchsia-700'];

function initials(name: string): string {
  const clean = name.replace(/^\+?\d[\d\s()-]*$/, '').trim();
  if (!clean) return '#';
  const words = clean.split(/\s+/).filter((w) => /\p{L}|\d/u.test(w[0] ?? ''));
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '')).toUpperCase() || '#';
}

function colorFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** Foto do WhatsApp; sem foto (ou link expirado), as iniciais numa cor fixa por contato. */
export function Avatar({ name, src, seed, size = 40 }: { name: string; src: string | null | undefined; seed?: string; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (src && failed !== src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={style} referrerPolicy="no-referrer" onError={() => setFailed(src)} className="shrink-0 rounded-full bg-secondary object-cover" />;
  }
  return (
    <span aria-hidden style={style} className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white/90 ${colorFor(seed ?? name)}`}>
      {initials(name)}
    </span>
  );
}
