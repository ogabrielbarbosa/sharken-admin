'use client';

import { CalendarDays, Check, Copy, Download, ExternalLink, EyeOff, FileText, Forward, MapPin, Mic, Pause, Play, Radio, Smile, UserRound, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message, MessageMeta } from '@lps/domain';
import { formatPhone } from '@/lib/crm';
import { Avatar } from './avatar';

// Conteúdo de cada tipo de mensagem do WhatsApp dentro do balão do CRM.

type M = Message & { mediaUrl?: string | null };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
}

function Unavailable({ m, label }: { m: M; label: string }) {
  if (m.status === 'pendente') return <p className="text-xs italic text-muted-foreground">Enviando {label.toLowerCase()}…</p>;
  if (m.meta?.viewOnce) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <EyeOff className="size-4 shrink-0" />{label} de visualização única · abra no celular
      </p>
    );
  }
  return <p className="text-xs italic text-muted-foreground">{label} ainda baixando ou indisponível</p>;
}

// ── Áudio ────────────────────────────────────────────────────────────────────────────────────────

const BARS = 40;
const SPEEDS = [1, 1.5, 2] as const;
const SPEED_KEY = 'crm-audio-speed';

/** Barras de 0 a 1. Sem a forma de onda do WhatsApp, uma fixa por mensagem até o áudio ser decodificado. */
function seededBars(seed: string): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const wave = 0.35 + 0.3 * Math.sin(i / 3.1) ** 2;
    return Math.max(0.12, Math.min(1, wave + ((h % 1000) / 1000 - 0.5) * 0.55));
  });
}

function resample(values: number[], max: number): number[] {
  if (!values.length) return [];
  const out = Array.from({ length: BARS }, (_, i) => {
    const from = Math.floor((i * values.length) / BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * values.length) / BARS));
    let peak = 0;
    for (let j = from; j < to; j++) peak = Math.max(peak, values[j] ?? 0);
    return peak / max;
  });
  const top = Math.max(...out, 0.01);
  return out.map((v) => Math.max(0.1, v / top));
}

async function decodeBars(url: string): Promise<number[] | null> {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const audio = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    void ctx.close();
    const data = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / (BARS * 8)));
    const peaks: number[] = [];
    for (let i = 0; i < data.length; i += step) peaks.push(Math.abs(data[i] ?? 0));
    return resample(peaks, 1);
  } catch {
    return null;
  }
}

/** Só um áudio toca por vez, como no WhatsApp. */
const PLAYING_EVENT = 'crm-audio-playing';

function AudioPlayer({ m, mine, avatar }: { m: M; mine: boolean; avatar: { name: string; src: string | null; seed: string } }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number>(m.meta?.seconds ?? 0);
  const [speed, setSpeed] = useState<number>(1);
  const [failed, setFailed] = useState(false);
  const fromWhatsApp = useMemo(() => (m.meta?.waveform?.length ? resample(m.meta.waveform, 100) : null), [m.meta?.waveform]);
  const [decoded, setDecoded] = useState<number[] | null>(null);
  const bars = fromWhatsApp ?? decoded ?? seededBars(m.id);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SPEED_KEY));
      if (SPEEDS.includes(saved as 1)) setSpeed(saved);
    } catch {
      // sem armazenamento: fica 1×
    }
  }, []);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const stop = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== m.id) ref.current?.pause();
    };
    window.addEventListener(PLAYING_EVENT, stop);
    return () => window.removeEventListener(PLAYING_EVENT, stop);
  }, [m.id]);

  const toggle = useCallback(async () => {
    const a = ref.current;
    if (!a) return;
    if (!a.paused) return a.pause();
    window.dispatchEvent(new CustomEvent(PLAYING_EVENT, { detail: m.id }));
    a.playbackRate = speed;
    try {
      await a.play();
    } catch {
      setFailed(true);
    }
    if (!fromWhatsApp && !decoded && m.mediaUrl) void decodeBars(m.mediaUrl).then((b) => b && setDecoded(b));
  }, [m.id, m.mediaUrl, speed, fromWhatsApp, decoded]);

  function seek(e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>, ratio?: number) {
    const a = ref.current;
    if (!a || !duration) return;
    let r = ratio;
    if (r === undefined && 'clientX' in e) {
      const box = e.currentTarget.getBoundingClientRect();
      r = (e.clientX - box.left) / box.width;
    }
    a.currentTime = Math.max(0, Math.min(1, r ?? 0)) * duration;
    setTime(a.currentTime);
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed as 1) + 1) % SPEEDS.length]!;
    setSpeed(next);
    try {
      localStorage.setItem(SPEED_KEY, String(next));
    } catch {
      // sem armazenamento: vale só nesta aba
    }
  }

  const progress = duration ? time / duration : 0;
  const played = mine ? 'bg-brand-light' : 'bg-brand-soft';
  const rest = mine ? 'bg-slate-400/40' : 'bg-muted-foreground/35';
  const ptt = m.meta?.ptt !== false;

  return (
    <div className="flex w-72 max-w-full items-center gap-2.5 py-0.5">
      {ptt && !mine && (
        <span className="relative shrink-0">
          <Avatar name={avatar.name} src={avatar.src} seed={avatar.seed} size={42} />
          <Mic className="absolute -bottom-0.5 -right-1 size-4 rounded-full bg-secondary p-0.5 text-brand-soft" />
        </span>
      )}
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!m.mediaUrl}
        aria-label={playing ? 'Pausar áudio' : 'Tocar áudio'}
        className="press inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/10 disabled:cursor-default disabled:opacity-50"
      >
        {playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          onClick={seek}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') seek(e, progress + 0.05);
            if (e.key === 'ArrowLeft') seek(e, progress - 0.05);
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); void toggle(); }
          }}
          className="relative flex h-7 cursor-pointer items-center gap-[2px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {bars.map((v, i) => (
            <span key={i} className={`w-[3px] shrink-0 grow rounded-full transition-colors duration-150 ${i / BARS < progress ? played : rest}`} style={{ height: `${Math.round(v * 100)}%` }} />
          ))}
          <span className={`pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${played} shadow transition-[left] duration-100`} style={{ left: `${progress * 100}%` }} />
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{failed ? 'Não deu para tocar aqui' : mmss(playing || time > 0 ? time : duration)}</span>
          {(playing || speed !== 1) && (
            <button type="button" onClick={cycleSpeed} className="cursor-pointer rounded-full bg-white/10 px-1.5 font-medium text-foreground hover:bg-white/20" aria-label="Velocidade do áudio">
              {String(speed).replace('.', ',')}×
            </button>
          )}
        </div>
      </div>
      {ptt && mine && (
        <span className="relative shrink-0">
          <Avatar name={avatar.name} src={avatar.src} seed={avatar.seed} size={42} />
          <Mic className="absolute -bottom-0.5 -left-1 size-4 rounded-full bg-[#0f2b3c] p-0.5 text-brand-light" />
        </span>
      )}
      {!ptt && <Radio className="size-4 shrink-0 text-muted-foreground" aria-label="Arquivo de áudio" />}
      {m.mediaUrl && (
        <audio
          ref={ref}
          src={m.mediaUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setTime(0); }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDuration(d); }}
          onDurationChange={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDuration(d); }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

// ── Vídeo ────────────────────────────────────────────────────────────────────────────────────────

function RoundVideo({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  return (
    <button
      type="button"
      onClick={() => { const v = ref.current; if (!v) return; if (v.paused) { v.muted = false; void v.play(); } else v.pause(); }}
      aria-label={playing ? 'Pausar vídeo' : 'Tocar vídeo'}
      className="relative block size-56 cursor-pointer overflow-hidden rounded-full"
    >
      <video ref={ref} src={url} playsInline preload="metadata" className="size-full object-cover"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)} />
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full -rotate-90">
        <circle cx="50" cy="50" r="48.5" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-light" strokeDasharray={`${progress * 304.7} 304.7`} />
      </svg>
      {!playing && <Play className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 fill-white/90 text-white/90 drop-shadow" />}
    </button>
  );
}

function VideoContent({ m }: { m: M }) {
  if (!m.mediaUrl) return <Unavailable m={m} label={m.meta?.round ? 'Recado de vídeo' : 'Vídeo'} />;
  if (m.meta?.round) return <RoundVideo url={m.mediaUrl} />;
  if (m.meta?.gif) return <video src={m.mediaUrl} autoPlay loop muted playsInline className="max-h-72 max-w-full rounded-lg" />;
  const ratio = m.meta?.width && m.meta?.height ? `${m.meta.width} / ${m.meta.height}` : undefined;
  return (
    <div className="relative">
      <video controls preload="metadata" src={m.mediaUrl} style={{ aspectRatio: ratio }} className="max-h-80 max-w-full rounded-lg bg-black" />
      {m.meta?.seconds ? <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 text-[11px] text-white">{mmss(m.meta.seconds)}</span> : null}
    </div>
  );
}

// ── Documento ────────────────────────────────────────────────────────────────────────────────────

const EXT_COLOR: Record<string, string> = { pdf: 'bg-red-600', doc: 'bg-blue-600', docx: 'bg-blue-600', xls: 'bg-emerald-600', xlsx: 'bg-emerald-600', csv: 'bg-emerald-600', ppt: 'bg-orange-600', pptx: 'bg-orange-600', zip: 'bg-amber-600', rar: 'bg-amber-600' };

function DocumentContent({ m }: { m: M }) {
  const name = m.meta?.fileName ?? m.media_path?.split('/').pop() ?? 'Documento';
  const ext = (name.includes('.') ? name.split('.').pop()! : (m.media_mime?.split('/').pop() ?? '')).toLowerCase().slice(0, 4);
  const details = [ext.toUpperCase(), m.meta?.pages ? `${m.meta.pages} ${m.meta.pages === 1 ? 'página' : 'páginas'}` : null, m.meta?.size ? fileSize(m.meta.size) : null].filter(Boolean).join(' · ');
  const card = (
    <span className="flex w-72 max-w-full items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase text-white ${EXT_COLOR[ext] ?? 'bg-slate-600'}`}>{ext || <FileText className="size-5" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground">{m.mediaUrl ? details : m.status === 'pendente' ? 'Enviando…' : `${details} · baixando`}</span>
      </span>
      {m.mediaUrl && <Download className="size-4 shrink-0 text-muted-foreground" />}
    </span>
  );
  return m.mediaUrl ? <a href={m.mediaUrl} target="_blank" rel="noreferrer" download={name} className="block transition-opacity hover:opacity-85">{card}</a> : card;
}

// ── Localização ──────────────────────────────────────────────────────────────────────────────────

const ZOOM = 15;
const TILE = 256;

/** Mapa do OpenStreetMap montado com 3×3 tiles, com o ponto no centro (sem chave de API). */
function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const n = 2 ** ZOOM;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const W = 288;
  const H = 150;
  // Inteiros: servidor e navegador precisam gerar exatamente o mesmo estilo (hidratação).
  const left = Math.round(W / 2 - (x - tx + 1) * TILE);
  const top = Math.round(H / 2 - (y - ty + 1) * TILE);
  return (
    <span className="relative block overflow-hidden rounded-lg bg-slate-800" style={{ width: W, height: H }}>
      <span className="absolute grid grid-cols-3" style={{ left, top, width: TILE * 3 }}>
        {[-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${dx}${dy}`} alt="" loading="lazy" src={`https://tile.openstreetmap.org/${ZOOM}/${(tx + dx + n) % n}/${ty + dy}.png`} width={TILE} height={TILE} className="block" />
        )))}
      </span>
      <MapPin className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-full fill-red-500 text-red-800 drop-shadow" />
      <span className="absolute bottom-0 right-0 bg-black/50 px-1 text-[9px] text-white/80">© OpenStreetMap</span>
    </span>
  );
}

function LocationContent({ m }: { m: M }) {
  const loc = m.meta?.location;
  if (!loc) return null;
  const href = loc.url ?? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="block w-72 max-w-full transition-opacity hover:opacity-90">
      <MiniMap lat={loc.lat} lng={loc.lng} />
      <span className="mt-1.5 block">
        {loc.live && <span className="mb-0.5 flex items-center gap-1 text-xs font-medium text-emerald-400"><Radio className="size-3" />Localização em tempo real · pode ter mudado</span>}
        {loc.name && <span className="block truncate text-sm font-medium">{loc.name}</span>}
        {loc.address && <span className="block truncate text-xs text-muted-foreground">{loc.address}</span>}
        <span className="mt-0.5 flex items-center gap-1 text-xs text-brand-soft">Abrir no mapa<ExternalLink className="size-3" /></span>
      </span>
    </a>
  );
}

// ── Contato ──────────────────────────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copiar ${value}`}
      onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }); }}
      className="press inline-flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
    >
      {done ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function ContactContent({ m }: { m: M }) {
  const contacts = m.meta?.contacts ?? [];
  return (
    <div className="w-64 max-w-full space-y-2">
      {contacts.map((c, i) => (
        <div key={i} className="rounded-lg bg-black/20 px-3 py-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-600"><UserRound className="size-5" /></span>
            <span className="min-w-0 truncate text-sm font-medium">{c.name}</span>
          </div>
          {c.phones.map((p) => (
            <div key={p} className="mt-1 flex items-center justify-between gap-2 pl-[46px] font-mono text-xs text-muted-foreground">
              <span className="truncate">{p.startsWith('+') ? formatPhone(p.slice(1)) : p}</span>
              <CopyButton value={p} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Enquete ──────────────────────────────────────────────────────────────────────────────────────

function PollContent({ m, contactName }: { m: M; contactName: string }) {
  const poll = m.meta?.poll;
  if (!poll) return null;
  const votes = poll.votes ?? {};
  const total = (votes.eu?.length ? 1 : 0) + (votes.contato?.length ? 1 : 0);
  return (
    <div className="w-72 max-w-full">
      <p className="text-sm font-semibold">{poll.name}</p>
      <p className="mb-2 text-xs text-muted-foreground">{poll.multiple ? 'Selecione uma ou mais opções' : 'Selecione uma opção'}</p>
      <div className="space-y-2">
        {poll.options.map((o) => {
          const who = [votes.eu?.includes(o) ? 'Você' : null, votes.contato?.includes(o) ? contactName : null].filter(Boolean) as string[];
          return (
            <div key={o}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${who.length ? 'border-emerald-400 bg-emerald-500' : 'border-muted-foreground/60'}`}>{who.length > 0 && <Check className="size-3 text-white" />}</span>
                  <span className="truncate">{o}</span>
                </span>
                <span className="text-xs tabular-nums text-muted-foreground" title={who.join(', ')}>{who.length}</span>
              </div>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${total ? (who.length / total) * 100 : 0}%` }} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Botões, convite, evento, tipo desconhecido ───────────────────────────────────────────────────

export function MessageButtons({ meta }: { meta: MessageMeta }) {
  if (!meta.buttons?.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
      {meta.buttons.map((b, i) => (b.url
        ? <a key={i} href={b.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-md py-1 text-sm text-brand-soft hover:bg-white/5"><ExternalLink className="size-3.5" />{b.label}</a>
        : <span key={i} className="block rounded-md py-1 text-center text-sm text-brand-soft/90">{b.label}</span>))}
    </div>
  );
}

function OtherContent({ m }: { m: M }) {
  const meta = m.meta ?? {};
  if (meta.invite) {
    return (
      <div className="flex w-64 max-w-full items-center gap-3 rounded-lg bg-black/20 px-3 py-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-700"><Users className="size-5" /></span>
        <span className="min-w-0"><span className="block text-xs text-muted-foreground">Convite para o grupo</span><span className="block truncate text-sm font-medium">{meta.invite.group}</span></span>
      </div>
    );
  }
  if (meta.event) {
    const when = meta.event.startsAt ? new Date(meta.event.startsAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : null;
    return (
      <div className="flex w-64 max-w-full items-start gap-3 rounded-lg bg-black/20 px-3 py-2">
        <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-soft" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{meta.event.name}</span>
          {when && <span className="block text-xs text-muted-foreground">{when}</span>}
          {meta.event.description && <span className="mt-1 block text-xs text-muted-foreground">{meta.event.description}</span>}
        </span>
      </div>
    );
  }
  if (meta.unsupported || !m.body) {
    return <p className="text-xs italic text-muted-foreground">Este tipo de mensagem não aparece no painel{meta.unsupported ? ` (${meta.unsupported})` : ''}. Veja no celular.</p>;
  }
  return null;
}

// ── Entrada ──────────────────────────────────────────────────────────────────────────────────────

export type ContentPeople = { me: { name: string; src: string | null; seed: string }; contact: { name: string; src: string | null; seed: string } };

/** Mídia e cartões do balão. O texto (legenda, corpo) fica com o balão. */
export function MessageContent({ m, mine, people }: { m: M; mine: boolean; people: ContentPeople }) {
  switch (m.kind) {
    case 'texto':
      return null;
    case 'imagem': {
      if (!m.mediaUrl) return <Unavailable m={m} label="Foto" />;
      const ratio = m.meta?.width && m.meta?.height ? `${m.meta.width} / ${m.meta.height}` : undefined;
      return (
        <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.mediaUrl} alt="Foto" style={{ aspectRatio: ratio }} className="max-h-80 max-w-full rounded-lg bg-black/20 object-cover" />
        </a>
      );
    }
    case 'sticker':
      if (m.meta?.lottie) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Smile className="size-5" />Figurinha animada · veja no celular</p>;
      // eslint-disable-next-line @next/next/no-img-element
      return m.mediaUrl ? <img src={m.mediaUrl} alt="Figurinha" className="size-36 object-contain drop-shadow" /> : <span className="flex size-36 items-center justify-center rounded-2xl bg-white/5 text-muted-foreground"><Smile className="size-8" /></span>;
    case 'audio': {
      const avatar = mine ? people.me : people.contact;
      return <AudioPlayer m={m} mine={mine} avatar={avatar} />;
    }
    case 'video':
      return <VideoContent m={m} />;
    case 'documento':
      return <DocumentContent m={m} />;
    case 'localizacao':
      return <LocationContent m={m} />;
    case 'contato':
      return <ContactContent m={m} />;
    case 'enquete':
      return <PollContent m={m} contactName={people.contact.name} />;
    default:
      return <OtherContent m={m} />;
  }
}

/** A enquete mostra o nome no cartão; o corpo não se repete embaixo. */
export const hidesBody = (m: Pick<Message, 'kind'>) => m.kind === 'enquete';

export function ForwardedTag() {
  return <p className="mb-1 flex items-center gap-1 text-[11px] italic text-muted-foreground"><Forward className="size-3" />Encaminhada</p>;
}
