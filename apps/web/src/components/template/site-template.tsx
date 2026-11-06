import type { SiteContent } from '@lps/domain';
import { MapPin, MessageCircle, Phone, Star } from 'lucide-react';
import type { CSSProperties } from 'react';

const formatPhone = (e164: string) => {
  const d = e164.replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : e164;
};

export function SiteTemplate({ content, commercialName, showVideo }: { content: SiteContent; commercialName: string; showVideo: boolean }) {
  const { copy, business, photos, reviews, colors } = content;
  const whatsapp = `https://wa.me/${business.phoneE164}`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.mapsQuery)}`;
  const style = { '--brand': colors.primary, '--on-brand': colors.onPrimary } as CSSProperties;
  const cta = (
    <a href={whatsapp} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-5 py-3 font-medium text-[var(--on-brand)]">
      <MessageCircle className="size-5" />{copy.cta}
    </a>
  );

  return (
    <div className="modelo-page min-h-screen" style={style}>
      <p className="bg-neutral-900 px-4 py-2 text-center text-xs text-white">Modelo preparado por {commercialName}. Ainda não publicado</p>

      {showVideo && content.videoUrl && (
        <section className="bg-neutral-100 px-4 py-6">
          <video src={content.videoUrl} controls playsInline preload="metadata" className="mx-auto aspect-video w-full max-w-3xl rounded-xl bg-black" />
        </section>
      )}

      <header className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
        {content.logo && <img src={content.logo} alt="" className="mb-6 h-12 w-auto" />}
        <p className="text-sm font-medium text-neutral-500">{business.name}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">{copy.headline}</h1>
        <p className="mt-4 max-w-2xl text-lg text-neutral-600">{copy.subheadline}</p>
        <div className="mt-8">{cta}</div>
      </header>

      {copy.about && <section className="mx-auto max-w-4xl px-4 pb-12"><p className="max-w-2xl leading-relaxed text-neutral-700">{copy.about}</p></section>}

      {copy.services.length > 0 && (
        <section className="bg-neutral-50 px-4 py-12">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-bold">Serviços</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {copy.services.map((s) => (
                <li key={s.name} className="rounded-xl border border-neutral-200 bg-white p-4">
                  <p className="font-medium">{s.name}</p>
                  {s.description && <p className="mt-1 text-sm text-neutral-600">{s.description}</p>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className="mx-auto max-w-4xl px-4 py-12">
          <h2 className="text-2xl font-bold">Fotos</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <figure key={p.url}>
                <img src={p.url} alt="" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                {p.stock && <figcaption className="mt-1 text-xs text-neutral-500">Imagem ilustrativa</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="bg-neutral-50 px-4 py-12">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-bold">Avaliações</h2>
            {content.rating !== null && <p className="mt-2 text-neutral-600">Nota {String(content.rating).replace('.', ',')} no Google, com {content.reviewsCount} avaliações.</p>}
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {reviews.map((r) => (
                <li key={r.text} className="rounded-xl border border-neutral-200 bg-white p-4">
                  <div className="flex gap-0.5" aria-label={`${r.stars} de 5 estrelas`}>
                    {Array.from({ length: 5 }, (_, i) => <Star key={i} className={`size-4 ${i < r.stars ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}`} />)}
                  </div>
                  <p className="mt-2 text-sm text-neutral-700">{r.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mx-auto grid max-w-4xl gap-8 px-4 py-12 sm:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold">Localização</h2>
          <p className="mt-4 flex items-start gap-2 text-neutral-700"><MapPin className="mt-0.5 size-5 shrink-0" />{business.address}</p>
          <a href={maps} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium underline">Ver no mapa</a>
        </div>
        <div>
          <h2 className="text-2xl font-bold">Contato</h2>
          <p className="mt-4 flex items-center gap-2 text-neutral-700"><Phone className="size-5" />{formatPhone(business.phoneE164)}</p>
          <div className="mt-4">{cta}</div>
        </div>
      </section>
    </div>
  );
}
