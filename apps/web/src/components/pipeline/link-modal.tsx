'use client';

import type { Lead } from '@lps/domain';
import { ArrowLeft, ExternalLink, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Input, LinkButton } from '@/components/ui';
import { discardAction, saveLoomUrlAction, savePageUrlAction, stepBackAction } from '@/app/painel/batches/[id]/actions';
import { leadMeta } from '@/lib/lead-labels';
import { Notice, useStageAction, withNotice } from './board';
import { Modal } from './modal';

const COPY = {
  pagina: { field: 'Link da página', placeholder: 'https://…', hint: 'Qualquer endereço https://. Salvar leva o lead para Vídeo.', back: 'Voltar para Qualificado' },
  video: { field: 'Link do Loom', placeholder: 'https://www.loom.com/share/…', hint: 'Salvar leva o lead para Pronto para abordar e cria o contato no CRM.', back: 'Voltar para Página' },
} as const;

/** Modal de Página e de Vídeo: um campo, Salvar, Voltar e Descartar. */
export function LinkModal({ kind, lead, closeHref }: { kind: 'pagina' | 'video'; lead: Lead; closeHref: string }) {
  const router = useRouter();
  const copy = COPY[kind];
  const current = kind === 'pagina' ? lead.page_url : lead.loom_url;
  const [value, setValue] = useState(current ?? '');
  const { pending, notice, run } = useStageAction(closeHref);
  const close = (warning?: string) => router.replace(warning ? withNotice(closeHref, warning) : closeHref, { scroll: false });
  const save = () => {
    if (!value.trim()) return;
    run(() => (kind === 'pagina' ? savePageUrlAction : saveLoomUrlAction)(lead.id, value), (r) => { if (r.ok) close(r.warning); });
  };

  return (
    <Modal
      title={lead.name}
      subtitle={leadMeta(lead)}
      closeHref={closeHref}
      footer={
        <>
          <div className="flex items-center gap-1">
            <Button variant="ghost" disabled={pending} onClick={() => run(() => stepBackAction(lead.id, kind), (r) => { if (r.ok) close(); })}><ArrowLeft />{copy.back}</Button>
            <Button variant="ghost" disabled={pending} onClick={() => run(() => discardAction([lead.id]), (r) => { if (r.ok) close(); })}><Trash2 />Descartar</Button>
          </div>
          <Button disabled={pending || !value.trim()} onClick={save}><Save />Salvar</Button>
        </>
      }
    >
      <form className="space-y-3 p-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {kind === 'video' && lead.page_url && (
          <p className="text-sm text-muted-foreground">
            Página: <a href={lead.page_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground hover:underline">{lead.page_url.replace(/^https?:\/\//, '')}<ExternalLink className="size-3" /></a>
          </p>
        )}
        <label className="block space-y-1.5">
          <span className="block text-sm font-medium">{copy.field}</span>
          <div className="flex gap-2">
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={copy.placeholder} inputMode="url" className="h-10 flex-1" />
            {current && <LinkButton href={current} external variant="outline" className="h-10"><ExternalLink />Abrir</LinkButton>}
          </div>
          <span className="block text-xs text-muted-foreground">{copy.hint}</span>
        </label>
        <Notice notice={notice} />
      </form>
    </Modal>
  );
}
