'use client';

import { Loader2, LogOut, QrCode, RefreshCw, RotateCw, Smartphone, Webhook } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { disconnectAction, refreshQrAction, registerWebhookAction, restartAction, startConnectionAction, syncConnectionAction } from '@/app/painel/conexoes/actions';
import { qrSrc } from '@/components/crm/reconnect-drawer';
import { Button, ErrorNote, Input } from '@/components/ui';
import { createBrowserSupabase } from '@/lib/supabase/browser';

type State = 'conectado' | 'desconectado' | 'conectando';
const QR_REFRESH_MS = 25_000;
const STATE_POLL_MS = 4_000;

/** Liga o Realtime da tabela whatsapp_connection: o webhook grava, a tela atualiza. */
export function ConnectionRealtime() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase.channel('conexao-whatsapp').on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_connection' }, () => router.refresh()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router]);
  return null;
}

/** Botões de ação de uma instância conectada ou parada. */
export function InstanceActions({ state, configured }: { state: State; configured: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => {
    setError(null);
    setNotice(null);
    const out = await fn();
    if (!out.ok) setError(out.error ?? 'Algo deu errado.');
    else if (ok) setNotice(ok);
    router.refresh();
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!configured || pending} onClick={() => run(syncConnectionAction, 'Estado atualizado.')}><RefreshCw />Verificar agora</Button>
        <Button variant="outline" disabled={!configured || pending} onClick={() => run(registerWebhookAction, 'Webhook registrado na instância.')}><Webhook />Registrar webhook</Button>
        <Button variant="outline" disabled={!configured || pending} onClick={() => run(restartAction, 'Instância reiniciada.')}><RotateCw />Reiniciar</Button>
        {state === 'conectado' && (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => { if (window.confirm('Desconectar o WhatsApp? O celular sai dos aparelhos conectados e o CRM para de receber mensagens.')) run(disconnectAction, 'Desconectado.'); }}
          >
            <LogOut />Desconectar
          </Button>
        )}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <p className="text-xs text-success-foreground">{notice}</p>}
    </div>
  );
}

/** Conectar o celular: QR que se renova sozinho, ou código de pareamento pelo número. */
export function ConnectPanel({ state, configured }: { state: State; configured: boolean }) {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<'qr' | 'codigo'>('qr');
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);

  const begin = useCallback(async (withPhone?: string) => {
    setLoading(true);
    setError(null);
    const out = await startConnectionAction(withPhone);
    setLoading(false);
    if (!out.ok) return setError(out.error);
    if (out.connected) { setActive(false); router.refresh(); return; }
    setActive(true);
    setQr(out.qr);
    setPairing(out.pairingCode);
  }, [router]);

  // Enquanto o QR está na tela: renova o código e confere se o celular já leu.
  useEffect(() => {
    if (!active) return;
    const qrTimer = setInterval(async () => {
      if (mode !== 'qr') return;
      const out = await refreshQrAction();
      if (out.ok && out.connected) { setActive(false); router.refresh(); }
      else if (out.ok) { setQr(out.qr); }
    }, QR_REFRESH_MS);
    const stateTimer = setInterval(async () => {
      const out = await syncConnectionAction();
      if (out.ok && out.state === 'conectado') { setActive(false); router.refresh(); }
    }, STATE_POLL_MS);
    return () => { clearInterval(qrTimer); clearInterval(stateTimer); };
  }, [active, mode, router]);

  useEffect(() => { if (state === 'conectado') setActive(false); }, [state]);

  if (state === 'conectado') return null;
  const src = qr ? qrSrc(qr) : null;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_288px]">
      <div className="space-y-4">
        <div className="inline-flex rounded-md bg-secondary p-0.5 text-xs">
          <button type="button" onClick={() => setMode('qr')} className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-3 ${mode === 'qr' ? 'bg-background font-medium' : 'text-muted-foreground'}`}><QrCode className="size-3.5" />QR code</button>
          <button type="button" onClick={() => setMode('codigo')} className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-3 ${mode === 'codigo' ? 'bg-background font-medium' : 'text-muted-foreground'}`}><Smartphone className="size-3.5" />Código pelo número</button>
        </div>
        {mode === 'qr' ? (
          <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
            <li>Abra o WhatsApp no celular do número de prospecção.</li>
            <li>Toque em <span className="text-foreground">Configurações › Aparelhos conectados › Conectar aparelho</span>.</li>
            <li>Aponte a câmera para o código ao lado. Ele se renova sozinho.</li>
          </ol>
        ) : (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li>Informe o número com DDI e DDD e gere o código.</li>
              <li>No celular: <span className="text-foreground">Aparelhos conectados › Conectar aparelho › Conectar com número de telefone</span>.</li>
              <li>Digite o código de 8 caracteres.</li>
            </ol>
            <div className="flex gap-2">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="55 19 99999-9999" inputMode="tel" className="max-w-56" />
              <Button variant="secondary" disabled={loading || phone.replace(/\D/g, '').length < 12} onClick={() => void begin(phone)}>Gerar código</Button>
            </div>
          </div>
        )}
        {!active && mode === 'qr' && (
          <Button disabled={!configured || loading} onClick={() => void begin()}>
            {loading ? <Loader2 className="animate-spin" /> : <QrCode />}{loading ? 'Preparando…' : 'Conectar celular'}
          </Button>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        {active && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Aguardando o celular. A tela muda sozinha quando conectar.</p>}
      </div>

      <div className="flex aspect-square w-full max-w-72 items-center justify-center rounded-lg border border-border bg-white p-3">
        {mode === 'codigo' && pairing ? (
          <span className="font-mono text-3xl font-semibold tracking-[0.2em] text-neutral-900">{pairing.replace(/(.{4})(.{4})/, '$1-$2')}</span>
        ) : src && active ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Código QR para conectar o WhatsApp" className="size-full" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-center text-xs text-neutral-500">
            {loading ? <Loader2 className="size-6 animate-spin" /> : <QrCode className="size-10 text-neutral-300" />}
            {loading ? 'Gerando o código…' : mode === 'qr' ? 'Clique em Conectar celular' : 'O código aparece aqui'}
          </span>
        )}
      </div>
    </div>
  );
}
