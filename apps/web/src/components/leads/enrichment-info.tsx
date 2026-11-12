import { SOURCE_LABEL, type Lead } from '@lps/domain';
import { Mail, Phone } from 'lucide-react';

const formatCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const formatPhone = (e164: string) => e164.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');

/**
 * Contatos e dados do dono achados fora do Google (site, WHOIS do .br, CNPJ), cada um com a fonte.
 * Fica vazio para leads analisados antes do enriquecimento.
 */
export function EnrichmentInfo({ lead }: { lead: Pick<Lead, 'enrichment' | 'email' | 'phone_e164' | 'phone_raw'> }) {
  const en = lead.enrichment;
  if (!en) return null;
  const tag = (text: string) => <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{text}</span>;
  const mobiles = en.phones.filter((p) => p.mobile);
  const nothing = !en.emails.length && !mobiles.length && !en.company && !en.people.length;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Contatos e dono</h3>
      {nothing && <p className="text-sm text-muted-foreground">Nada encontrado no site, no WHOIS nem no CNPJ.</p>}
      {(en.emails.length > 0 || mobiles.length > 0) && (
        <ul className="space-y-1.5 text-sm">
          {en.emails.map((e) => (
            <li key={e.email} className="flex flex-wrap items-center gap-2">
              <Mail className="size-3.5 text-muted-foreground" />
              <a href={`mailto:${e.email}`} className={e.email === lead.email ? 'font-medium underline' : 'underline'}>{e.email}</a>
              {tag(SOURCE_LABEL[e.source])}
              {e.note && <span className="text-xs text-muted-foreground">{e.note}</span>}
            </li>
          ))}
          {mobiles.map((p) => (
            <li key={p.e164} className="flex flex-wrap items-center gap-2">
              <Phone className="size-3.5 text-muted-foreground" />
              <span className={p.e164 === lead.phone_e164 ? 'font-medium' : ''}>{formatPhone(p.e164)}</span>
              {tag(SOURCE_LABEL[p.source])}
              <span className="text-xs text-muted-foreground">{p.source === 'site' ? 'Botão de WhatsApp do site' : 'Celular do cadastro do CNPJ'}</span>
            </li>
          ))}
        </ul>
      )}
      {en.company && (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="font-medium">{en.company.legal_name ?? 'Empresa'}</p>
          <p className="text-xs text-muted-foreground">
            {[`CNPJ ${formatCnpj(en.company.cnpj)}`, en.company.trade_name && `Fantasia: ${en.company.trade_name}`, en.company.status, en.company.activity].filter(Boolean).join(' · ')}
          </p>
        </div>
      )}
      {en.people.length > 0 && (
        <ul className="space-y-1 text-sm">
          {en.people.map((p) => (
            <li key={`${p.role}-${p.name}`} className="flex flex-wrap items-center gap-2">
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.role}</span>
              {tag(SOURCE_LABEL[p.source])}
            </li>
          ))}
        </ul>
      )}
      {en.notes.length > 0 && <p className="text-xs text-muted-foreground">{en.notes.join(' ')}</p>}
    </section>
  );
}
