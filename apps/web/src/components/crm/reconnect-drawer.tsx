'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { connectionQrAction } from '@/app/painel/crm/actions';
import { Button, Drawer, ErrorNote } from '@/components/ui';

type Qr = { ok: true; qr: string | null } | { ok: false; error: string };
const POLL_MS = 5000;

/** Só imagem de verdade vira src: data URL de imagem ou base64 puro. Qualquer outra coisa conta como sem código. */
export function qrSrc(value: string): string | null {
  const v = value.trim();
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v)) return v;
  return /^[A-Za-z0-9+/=\s]+$/.test(v) ? `data:image/png;base64,${v}` : null;
}

/**
 * Drawer com o QR da Evolution. A página só o renderiza enquanto o estado não for "conectado",
 * então ele some sozinho: o refresh a cada 5 s relê o estado que o webhook grava.
 */
export function ReconnectDrawer({ closeHref, fetchQr = connectionQrAction, pollMs = POLL_MS }: { closeHref: string; fetchQr?: () => Promise<Qr>; pollMs?: number }) {
  const router = useRouter();
  const [result, setResult] = useState<Qr | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await fetchQr());
    } catch {
      setResult({ ok: false, error: 'Não foi possível buscar o código. Tente Atualizar.' });
    } finally {
      setLoading(false);
    }
  }, [fetchQr]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => router.refresh(), pollMs);
    return () => clearInterval(id);
  }, [router, pollMs]);

  const src = result?.ok && result.qr ? qrSrc(result.qr) : null;
  const noCode = result?.ok && !src;
  return (
    <Drawer title="Conectar o WhatsApp" closeHref={closeHref}>
      <div className="flex flex-1 flex-col gap-4">
        <p className="text-sm text-muted-foreground">Abra o WhatsApp no celular do número de prospecção › Aparelhos conectados › Conectar aparelho e leia o código.</p>
        <div className="flex min-h-64 items-center justify-center rounded-md border border-border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt="Código QR para conectar o WhatsApp" className="size-64" /> : <span className="text-sm text-neutral-500">{loading ? 'Buscando o código…' : ''}</span>}
        </div>
        {result && !result.ok && <ErrorNote>{result.error}</ErrorNote>}
        {noCode && <ErrorNote>O servidor não devolveu um código. Tente Atualizar.</ErrorNote>}
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>Atualizar</Button>
        <p className="text-xs text-muted-foreground">Já conectou? A tela atualiza sozinha.</p>
      </div>
    </Drawer>
  );
}
