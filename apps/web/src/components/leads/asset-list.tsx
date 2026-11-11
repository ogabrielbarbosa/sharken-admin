'use client';

import { FileText, Image as ImageIcon, Link as LinkIcon, Loader2, Plus, RotateCw, X, Check, AtSign, TriangleAlert } from 'lucide-react';
import { useState, useTransition } from 'react';
import type { LeadAsset } from '@lps/domain';
import { Button, Input } from '@/components/ui';
import { addLinkAction, removeAssetAction, retryAssetAction } from '@/app/painel/batches/[id]/actions';

const short = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

function StatusPill({ asset }: { asset: LeadAsset }) {
  if (asset.status === 'pronto') return <span className="inline-flex items-center gap-1 rounded-sm bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-foreground"><Check className="size-3" />Pronto</span>;
  if (asset.status === 'erro') return <span className="inline-flex items-center gap-1 rounded-sm bg-destructive-subtle px-2 py-0.5 text-xs font-medium text-destructive"><TriangleAlert className="size-3" />Erro</span>;
  return <span className="inline-flex items-center gap-1 rounded-sm bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning"><Loader2 className="size-3 animate-spin" />Extraindo</span>;
}

function summary(asset: LeadAsset): string {
  if (asset.status === 'erro') return asset.error ?? 'Não foi possível ler.';
  if (asset.status === 'extraindo') return asset.kind === 'link' ? 'Lendo a página…' : 'Lendo o arquivo…';
  const chars = asset.extracted_text?.length ?? 0;
  return chars ? `${chars.toLocaleString('pt-BR')} caracteres lidos` : 'Guardado';
}

/** Lista de links ou de arquivos do lead, com remover e tentar de novo. */
export function AssetList({ assets }: { assets: LeadAsset[] }) {
  const [pending, start] = useTransition();
  if (!assets.length) return null;
  return (
    <ul className="space-y-2">
      {assets.map((asset) => {
        const title = asset.kind === 'link' ? short(asset.url ?? '') : asset.label ?? 'Arquivo';
        const Icon = asset.kind === 'link' ? (/instagram\.com/i.test(asset.url ?? '') ? AtSign : LinkIcon) : asset.mime_type?.startsWith('image/') ? ImageIcon : FileText;
        return (
          <li key={asset.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{title}</p>
              <p className="truncate text-xs text-muted-foreground">{asset.label && asset.kind === 'link' ? `${asset.label} · ` : ''}{summary(asset)}</p>
            </div>
            <StatusPill asset={asset} />
            {asset.status === 'erro' && (
              <button type="button" disabled={pending} aria-label="Tentar de novo" onClick={() => start(async () => { await retryAssetAction(asset.id); })} className="text-muted-foreground hover:text-foreground"><RotateCw className="size-4" /></button>
            )}
            <button type="button" disabled={pending} aria-label="Remover" onClick={() => start(async () => { await removeAssetAction(asset.id); })} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
          </li>
        );
      })}
    </ul>
  );
}

export function LinkAdder({ leadId }: { leadId: string }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    if (!value.trim()) return;
    start(async () => {
      const res = await addLinkAction(leadId, value);
      if (res.error) setError(res.error);
      else { setValue(''); setError(null); }
    });
  };
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input aria-label="Link" placeholder="Colar um link…" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} className="h-10 flex-1" />
        <Button type="button" variant="outline" className="h-10" disabled={pending || !value.trim()} onClick={submit}><Plus />Adicionar</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
