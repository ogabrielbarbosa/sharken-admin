import { toMobileE164 } from './phone';

/**
 * Enriquecimento do lead: contatos e dados do dono achados fora do Google.
 * Fontes: o próprio site (mailto, e-mail no texto, botão de WhatsApp), o WHOIS do registro.br
 * (só domínio .br) e o cadastro público do CNPJ. Cada dado guarda a fonte, porque a qualidade varia:
 * o contato técnico do domínio costuma ser a agência, e o e-mail do CNPJ às vezes é o do contador.
 */
export type EnrichmentSource = 'site' | 'whois' | 'cnpj';

export type FoundEmail = { email: string; source: EnrichmentSource; note: string | null };
export type FoundPhone = { e164: string; source: EnrichmentSource; mobile: boolean };
export type FoundPerson = { name: string; role: string; source: EnrichmentSource };
export type Company = {
  cnpj: string;
  legal_name: string | null;
  trade_name: string | null;
  status: string | null;
  activity: string | null;
};

export type Enrichment = {
  at: string;
  domain: string | null;
  company: Company | null;
  emails: FoundEmail[];
  phones: FoundPhone[];
  people: FoundPerson[];
  notes: string[];
};

export const SOURCE_LABEL: Record<EnrichmentSource, string> = { site: 'Site', whois: 'WHOIS', cnpj: 'CNPJ' };

/** Domínio registrável .br de um link (o que o registro.br responde), ou null. */
export function brDomainOf(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  if (!host.endsWith('.br')) return null;
  const labels = host.split('.');
  if (labels.length < 2) return null;
  // nome.br (registro direto) ou nome.categoria.br (com.br, odo.br, med.br...)
  return labels.length === 2 ? host : labels.slice(-3).join('.');
}

export const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

const JUNK_EMAIL = /(example\.|sentry|wixpress|\.png$|\.jpe?g$|\.gif$|\.webp$|\.svg$|@2x|domain\.com|email\.com$|seuemail|seu-email|nome@|mysite\.com|yoursite|seusite|seudominio|exemplo\.|test@|teste@)/i;

/** E-mails válidos e únicos em um texto (minúsculos), sem os falsos positivos comuns de páginas. */
export function extractEmails(text: string | null | undefined): string[] {
  const found = (text ?? '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  const out = new Set<string>();
  for (const e of found) {
    const email = e.toLowerCase().replace(/^mailto:/, '').replace(/\.+$/, '');
    if (!JUNK_EMAIL.test(email)) out.add(email);
  }
  return [...out];
}

/** Celular de um link de WhatsApp (wa.me/55..., api.whatsapp.com/send?phone=...). */
export function whatsappFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const m = href.match(/wa\.me\/(\+?\d{10,15})/i) ?? href.match(/[?&]phone=(\+?\d{10,15})/i);
  return m ? toMobileE164(m[1]) : null;
}

/** Nome em maiúsculas vira nome próprio ("EDSON HILGERT" → "Edson Hilgert"). */
export const titleCase = (s: string | null | undefined) =>
  s ? s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (w) => w.toLowerCase()) : null;

type Vcard = [string, Record<string, unknown>, string, unknown][];
type RdapEntity = { roles?: string[]; vcardArray?: [string, Vcard]; publicIds?: { type: string; identifier: string }[]; entities?: RdapEntity[] };

const vcardField = (e: RdapEntity, key: string): string | null => {
  const row = e.vcardArray?.[1]?.find((f) => f[0] === key);
  return typeof row?.[3] === 'string' && row[3].trim() ? row[3].trim() : null;
};

const ROLE_LABEL: Record<string, string> = {
  registrant: 'Titular do domínio',
  administrative: 'Contato administrativo do domínio',
  technical: 'Contato técnico do domínio',
  billing: 'Contato de cobrança do domínio',
};

/** Resposta RDAP do registro.br → titular (nome e CNPJ), pessoas e e-mails de contato. */
export function parseRdap(json: unknown): { cnpj: string | null; holder: string | null; people: FoundPerson[]; emails: FoundEmail[] } {
  const people: FoundPerson[] = [];
  const emails: FoundEmail[] = [];
  let cnpj: string | null = null;
  let holder: string | null = null;
  const seen = new Set<string>();
  const walk = (list: RdapEntity[] | undefined) => {
    for (const e of list ?? []) {
      const roles = e.roles ?? [];
      const name = vcardField(e, 'fn');
      const email = vcardField(e, 'email')?.toLowerCase() ?? null;
      if (roles.includes('registrant')) {
        holder = name && name === name.toUpperCase() ? titleCase(name) : name;
        const id = e.publicIds?.find((p) => p.type === 'cnpj');
        if (id) cnpj = onlyDigits(id.identifier);
      }
      for (const role of roles) {
        const label = ROLE_LABEL[role];
        if (!label) continue;
        // O titular pessoa física só entra pelo nome (sem CPF). A mesma pessoa em vários papéis vira uma linha.
        const display = name && name === name.toUpperCase() ? titleCase(name)! : name;
        if (display) {
          const key = display.toLowerCase().replace(/\s+/g, ' ');
          const short = label.replace(' do domínio', '').replace('Contato ', '').toLowerCase();
          const existing = people.find((p) => p.name.toLowerCase().replace(/\s+/g, ' ') === key);
          if (!existing) people.push({ name: display.replace(/\s+/g, ' '), role: label, source: 'whois' });
          else if (!seen.has(`${key}:${role}`)) existing.role = existing.role.replace(' do domínio', '') + `, ${short} do domínio`;
          seen.add(`${key}:${role}`);
        }
        if (email && !emails.some((x) => x.email === email)) {
          emails.push({ email, source: 'whois', note: role === 'technical' ? 'Contato técnico (costuma ser a agência)' : label });
        }
      }
      walk(e.entities);
    }
  };
  walk((json as { entities?: RdapEntity[] } | null)?.entities);
  return { cnpj, holder, people, emails };
}

const phoneOf = (ddd: string | null | undefined, num: string | null | undefined): FoundPhone | null => {
  const digits = onlyDigits(`${ddd ?? ''}${num ?? ''}`);
  if (digits.length < 10) return null;
  const mobile = toMobileE164(digits);
  return { e164: mobile ?? `55${digits}`, source: 'cnpj', mobile: !!mobile };
};

/** BrasilAPI (/api/cnpj/v1/{cnpj}) → empresa, telefones, e-mail e sócios. */
export function parseBrasilApi(json: unknown): { company: Company; phones: FoundPhone[]; emails: FoundEmail[]; people: FoundPerson[] } | null {
  const d = json as Record<string, unknown> | null;
  if (!d?.cnpj) return null;
  const str = (k: string) => (typeof d[k] === 'string' && (d[k] as string).trim() ? (d[k] as string).trim() : null);
  const phones = [str('ddd_telefone_1'), str('ddd_telefone_2')].map((p) => phoneOf(null, p)).filter((p): p is FoundPhone => !!p);
  const email = str('email')?.toLowerCase();
  const qsa = Array.isArray(d.qsa) ? (d.qsa as Record<string, unknown>[]) : [];
  return {
    company: {
      cnpj: onlyDigits(String(d.cnpj)),
      legal_name: titleCase(str('razao_social')),
      trade_name: titleCase(str('nome_fantasia')),
      status: titleCase(str('descricao_situacao_cadastral')),
      activity: str('cnae_fiscal_descricao'),
    },
    phones,
    emails: email ? [{ email, source: 'cnpj', note: 'E-mail do cadastro do CNPJ (às vezes é o do contador)' }] : [],
    people: qsa
      .filter((s) => typeof s.nome_socio === 'string')
      .map((s) => ({ name: titleCase(s.nome_socio as string)!, role: (s.qualificacao_socio as string) || 'Sócio', source: 'cnpj' as const })),
  };
}

/** CNPJ.ws (publica.cnpj.ws/cnpj/{cnpj}): costuma trazer o e-mail que a BrasilAPI não traz. */
export function parseCnpjWs(json: unknown): { phones: FoundPhone[]; emails: FoundEmail[] } {
  const e = (json as { estabelecimento?: Record<string, string | null> } | null)?.estabelecimento;
  if (!e) return { phones: [], emails: [] };
  const phones = [phoneOf(e.ddd1, e.telefone1), phoneOf(e.ddd2, e.telefone2)].filter((p): p is FoundPhone => !!p);
  const email = e.email?.trim().toLowerCase();
  return { phones, emails: email ? [{ email, source: 'cnpj', note: 'E-mail do cadastro do CNPJ (às vezes é o do contador)' }] : [] };
}

export function addEmails(list: FoundEmail[], more: FoundEmail[]): FoundEmail[] {
  const out = [...list];
  for (const e of more) if (!out.some((x) => x.email === e.email)) out.push(e);
  return out;
}

export function addPhones(list: FoundPhone[], more: FoundPhone[]): FoundPhone[] {
  const out = [...list];
  for (const p of more) if (!out.some((x) => x.e164 === p.e164)) out.push(p);
  return out;
}

const isAgencyNote = (e: FoundEmail) => e.note?.startsWith('Contato técnico') ?? false;

/**
 * O melhor e-mail e o melhor celular achados. E-mail: o do site, depois o do WHOIS (sem o técnico,
 * que costuma ser a agência), depois o do CNPJ. Celular: o do botão de WhatsApp do site, depois o do CNPJ.
 */
export function bestContacts(en: Pick<Enrichment, 'emails' | 'phones'>): { email: string | null; mobile: string | null } {
  const order: EnrichmentSource[] = ['site', 'whois', 'cnpj'];
  const emails = en.emails.filter((e) => !isAgencyNote(e));
  const email = order.map((s) => emails.find((e) => e.source === s)).find(Boolean)?.email ?? null;
  const mobile = order.map((s) => en.phones.find((p) => p.mobile && p.source === s)).find(Boolean)?.e164 ?? null;
  return { email, mobile };
}

/** Razão social ou titular que se declara franquia ("... Franquias Ltda", "Franchising"). */
export function looksLikeFranchise(en: Pick<Enrichment, 'company' | 'people'> | null | undefined): boolean {
  if (!en) return false;
  const names = [en.company?.legal_name, en.company?.trade_name, ...en.people.filter((p) => p.role.startsWith('Titular')).map((p) => p.name)];
  return names.some((n) => !!n && /franquia|franchising|franqueadora/i.test(n));
}
