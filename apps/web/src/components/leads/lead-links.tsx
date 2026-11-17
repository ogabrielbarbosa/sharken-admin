import { Globe, MapPin, PanelTop, Video } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Lead } from '@lps/domain';

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** Link do negócio no Google Maps pelo place_id (abre a ficha certa, não uma busca solta). */
export function mapsUrl(lead: Pick<Lead, 'name' | 'place_id'>): string {
  const q = new URLSearchParams({ api: '1', query: lead.name, query_place_id: lead.place_id });
  return `https://www.google.com/maps/search/?${q}`;
}

const withProtocol = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

type Item = { label: string; href: string | null; icon: ReactNode };

/** Atalhos para ver o negócio por fora: Maps, site, Instagram e, quando já existem, a página e o vídeo. */
export function LeadLinks({ lead }: { lead: Pick<Lead, 'name' | 'place_id' | 'website_url' | 'instagram_url'> & Partial<Pick<Lead, 'page_url' | 'loom_url' | 'site_status'>> }) {
  // O "site" do Maps às vezes é só o Instagram ou outra rede: aí não há site para abrir.
  const hasSite = !!lead.website_url && lead.site_status !== 'somente_social' && !/instagram\.com|facebook\.com|wa\.me|linktr\.ee/i.test(lead.website_url);
  const items: Item[] = [
    { label: 'Maps', href: mapsUrl(lead), icon: <MapPin /> },
    { label: 'Site', href: hasSite ? withProtocol(lead.website_url!) : null, icon: <Globe /> },
    { label: 'Instagram', href: lead.instagram_url ? withProtocol(lead.instagram_url) : null, icon: <InstagramIcon /> },
  ];
  if (lead.page_url) items.push({ label: 'Página', href: withProtocol(lead.page_url), icon: <PanelTop /> });
  if (lead.loom_url) items.push({ label: 'Vídeo', href: withProtocol(lead.loom_url), icon: <Video /> });

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) =>
        item.href ? (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="press inline-flex h-8 items-center gap-2 rounded-md border border-input bg-input-bg px-3 text-sm font-medium text-foreground hover:border-border-strong hover:bg-white/5 [&_svg]:size-4 [&_svg]:shrink-0"
          >
            {item.icon}
            {item.label}
          </a>
        ) : (
          <span
            key={item.label}
            title={`Sem ${item.label.toLowerCase()} no cadastro`}
            className="inline-flex h-8 cursor-not-allowed items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground/50 [&_svg]:size-4 [&_svg]:shrink-0"
          >
            {item.icon}
            {item.label}
          </span>
        ),
      )}
    </div>
  );
}
