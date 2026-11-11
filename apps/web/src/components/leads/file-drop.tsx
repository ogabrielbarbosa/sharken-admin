'use client';

import { Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { MAX_ASSET_BYTES } from '@lps/domain';
import { confirmUploadAction, createUploadUrlAction } from '@/app/painel/batches/[id]/completar/actions';

/** Área de arrastar arquivos. O navegador envia direto ao Storage com uma URL assinada. */
export function FileDrop({ leadId }: { leadId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | File[]) {
    setBusy(true);
    setError(null);
    for (const file of Array.from(files)) {
      if (file.size > MAX_ASSET_BYTES) { setError(`${file.name}: grande demais. O limite é 20 MB.`); continue; }
      const mime = file.type || 'application/octet-stream';
      const prepared = await createUploadUrlAction(leadId, file.name, mime, file.size);
      if (prepared.error || !prepared.signedUrl || !prepared.path) { setError(`${file.name}: ${prepared.error ?? 'falha ao preparar o envio.'}`); continue; }
      const body = new FormData();
      body.append('cacheControl', '3600');
      body.append('', file);
      const res = await fetch(prepared.signedUrl, { method: 'PUT', body, headers: { 'x-upsert': 'false' } }).catch(() => null);
      if (!res?.ok) { setError(`${file.name}: o envio falhou.`); continue; }
      const done = await confirmUploadAction(leadId, prepared.path, file.name, mime);
      if (done.error) setError(`${file.name}: ${done.error}`);
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="space-y-1.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}
        className={`flex h-16 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground ${over ? 'border-neutral-400 bg-accent' : 'border-input'}`}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {busy ? 'Enviando…' : 'Arraste arquivos aqui ou clique para escolher'}
      </div>
      <input ref={input} type="file" multiple hidden accept="application/pdf,image/*,.doc,.docx,.txt" onChange={(e) => e.target.files && void upload(e.target.files)} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
