'use client';

import { ArrowRight, ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { Lead } from '@lps/domain';
import { Button, Status } from '@/components/ui';
import { discardLeadAction } from '@/lib/common-lead-actions';
import { siteLabel, leadMeta, instagramLabel } from '@/lib/lead-labels';
import { advanceLeadsAction, discardLeadsAction } from '@/app/painel/batches/[id]/revisar/actions';
import { BulkBar } from './bulk-bar';

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
const fullUrl = (url: string) => (/^https?:/i.test(url) ? url : `https://${url}`);

export const scoreTone = (score: number) => (score >= 70 ? 'bg-success' : score >= 50 ? 'bg-warning' : 'bg-destructive');

function Instagram({ lead }: { lead: Lead }) {
  const active = lead.score_reasons?.find((r) => r.label.startsWith('Instagram'))?.met;
  const { label, tone } = instagramLabel(lead, active);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Status tone={tone}>{label}</Status>
      {lead.instagram_url && <a href={fullUrl(lead.instagram_url)} target="_blank" rel="noreferrer" aria-label="Abrir Instagram" className="text-muted-foreground hover:text-foreground"><ExternalLink className="size-3" /></a>}
    </span>
  );
}

export function LeadTable({ leads, batchId, openId, hrefFor }: { leads: Lead[]; batchId: string; openId?: string; hrefFor: (leadId: string) => string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Só os visíveis, na ordem da lista.
  const ids = leads.filter((l) => selected.has(l.id)).map((l) => l.id);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-10 px-4 py-2.5">
                <input type="checkbox" aria-label="Selecionar todos" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)))} className="size-4 accent-neutral-200" />
              </th>
              {['Negócio', 'Site', 'Instagram', 'Avaliações', 'Pontuação', 'Ações'].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.map((lead) => {
              const site = siteLabel(lead);
              const score = lead.score ?? 0;
              return (
                <tr key={lead.id} className={lead.id === openId ? 'bg-secondary/50' : undefined}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" aria-label={`Selecionar ${lead.name}`} checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} className="size-4 accent-neutral-200" />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={hrefFor(lead.id)} scroll={false} className="font-medium hover:underline">{lead.name}</Link>
                    <p className="text-xs text-muted-foreground">{leadMeta(lead)}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <Status tone={site.tone}>{site.label}</Status>
                    {lead.website_url && (
                      <a href={fullUrl(lead.website_url)} target="_blank" rel="noreferrer" className="mt-0.5 flex max-w-44 items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground">
                        {shortUrl(lead.website_url)}<ExternalLink className="size-3 shrink-0" />
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5"><Instagram lead={lead} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{lead.rating != null ? `${lead.rating} (${lead.reviews_count})` : '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-7 font-medium">{score}</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary"><div className={`h-full ${scoreTone(score)}`} style={{ width: `${score}%` }} /></div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <form action={discardLeadAction}>
                        <input type="hidden" name="leadId" value={lead.id} />
                        <Button type="submit" variant="ghost" className="px-2" aria-label="Descartar"><Trash2 /></Button>
                      </form>
                      <form action={advanceLeadsAction}>
                        <input type="hidden" name="batchId" value={batchId} />
                        <input type="hidden" name="ids" value={lead.id} />
                        <Button type="submit" variant="outline" className="px-2"><ArrowRight />Avançar</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <BulkBar batchId={batchId} ids={ids} advance={advanceLeadsAction} discard={discardLeadsAction} onClear={() => setSelected(new Set())} />
    </>
  );
}
