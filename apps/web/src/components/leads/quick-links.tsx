import type { Lead } from '@lps/domain';
import { Globe, MapPin, PanelTop, Video } from 'lucide-react';
import { InstagramIcon, instagramUrl, mapsUrl, siteUrl, withProtocol } from './lead-links';

type QuickLinksLead = Pick<Lead, 'name' | 'place_id' | 'website_url' | 'instagram_url' | 'site_status'> & Partial<Pick<Lead, 'city' | 'page_url' | 'loom_url'>>;

/** Botõezinhos para abrir o negócio por fora (Instagram, Maps e site), sempre na mesma posição; o que falta fica apagado. */
export function QuickLinks({ lead }: { lead: QuickLinksLead }) {
  const items = [
    { label: 'Instagram', href: instagramUrl(lead), icon: <InstagramIcon /> },
    { label: 'Google Maps', href: lead.place_id ? mapsUrl(lead) : null, icon: <MapPin /> },
    { label: 'Site', href: siteUrl(lead), icon: <Globe /> },
  ];
  const box = 'flex size-6 items-center justify-center rounded [&_svg]:size-3.5';
  // A página e o vídeo prontos: azuis, à esquerda dos fixos, só quando existem.
  const made = [
    { label: 'Página', href: lead.page_url ? withProtocol(lead.page_url) : null, icon: <PanelTop /> },
    { label: 'Vídeo', href: lead.loom_url ? withProtocol(lead.loom_url) : null, icon: <Video /> },
  ].filter((i): i is typeof i & { href: string } => !!i.href);
  return (
    <span className="pointer-events-auto relative flex shrink-0 gap-0.5">
      {made.map((i) => (
        <a
          key={i.label}
          href={i.href}
          target="_blank"
          rel="noreferrer"
          draggable={false}
          aria-label={`${i.label} de ${lead.name}`}
          data-tip={i.label}
          className={`${box} bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 hover:text-blue-300`}
        >
          {i.icon}
        </a>
      ))}
      {items.map((i) =>
        i.href ? (
          <a
            key={i.label}
            href={i.href}
            target="_blank"
            rel="noreferrer"
            draggable={false}
            aria-label={`${i.label} de ${lead.name}`}
            data-tip={i.label}
            className={`${box} text-muted-foreground hover:bg-white/10 hover:text-foreground`}
          >
            {i.icon}
          </a>
        ) : (
          <span key={i.label} aria-label={`Sem ${i.label}`} data-tip={`Sem ${i.label}`} className={`${box} cursor-not-allowed text-muted-foreground opacity-30`}>
            {i.icon}
          </span>
        ),
      )}
    </span>
  );
}
