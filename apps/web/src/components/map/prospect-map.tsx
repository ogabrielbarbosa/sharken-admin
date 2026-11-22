'use client';

import dynamic from 'next/dynamic';

/** O Leaflet só roda no navegador. */
export const ProspectMap = dynamic(() => import('./prospect-map-inner'), {
  ssr: false,
  loading: () => <div className="h-[360px] animate-pulse rounded-lg border border-border bg-white/[0.02]" />,
});
export type { MapSelection } from './prospect-map-inner';
