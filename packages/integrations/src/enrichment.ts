import {
  addEmails, addPhones, brDomainOf, extractEmails, parseBrasilApi, parseCnpjWs, parseRdap, whatsappFromHref,
  type Enrichment, type FoundEmail, type FoundPhone, type Lead,
} from '@lps/domain';

const TIMEOUT_MS = 15_000;
const HEADERS = { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; lead-enrichment/1.0)' };

/** O CNPJ.ws aceita poucas consultas por minuto. Quem chama decide se tenta de novo depois. */
export class RateLimited extends Error {
  constructor(public service: string) {
    super(`${service} limitou as consultas`);
  }
}

async function getJson(url: string, service: string): Promise<unknown | null> {
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (r.status === 404) return null;
  if (r.status === 429) throw new RateLimited(service);
  if (!r.ok) throw new Error(`${service} respondeu ${r.status}`);
  return r.json();
}

export const fetchRdap = (domain: string) => getJson(`https://rdap.registro.br/domain/${encodeURIComponent(domain)}`, 'registro.br');
export const fetchBrasilApiCnpj = (cnpj: string) => getJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, 'BrasilAPI');
export const fetchCnpjWs = (cnpj: string) => getJson(`https://publica.cnpj.ws/cnpj/${cnpj}`, 'CNPJ.ws');

export type EnrichDeps = {
  rdap: typeof fetchRdap;
  brasilApi: typeof fetchBrasilApiCnpj;
  cnpjWs: typeof fetchCnpjWs;
  now: () => Date;
};

export const defaultEnrichDeps = (): EnrichDeps => defaultDeps;
const defaultDeps: EnrichDeps = { rdap: fetchRdap, brasilApi: fetchBrasilApiCnpj, cnpjWs: fetchCnpjWs, now: () => new Date() };

/**
 * Junta o que dá para saber do dono: contatos da página, WHOIS do domínio .br e cadastro do CNPJ.
 * Falha de uma fonte vira nota e não impede as outras. Só o limite do CNPJ.ws sobe (RateLimited),
 * para o job tentar de novo daqui a pouco.
 */
export async function enrichLead(lead: Pick<Lead, 'website_url' | 'site_data'>, deps: EnrichDeps = defaultDeps, country = 'BR'): Promise<Enrichment> {
  const notes: string[] = [];
  let emails: FoundEmail[] = [];
  let phones: FoundPhone[] = [];
  const en: Enrichment = { at: deps.now().toISOString(), domain: null, company: null, emails, phones, people: [], notes };

  // 1. Página
  const siteEmails = extractEmails([...(lead.site_data?.emails ?? []), lead.site_data?.text ?? ''].join(' '));
  emails = addEmails(emails, siteEmails.map((email) => ({ email, source: 'site', note: null })));
  const siteMobiles = (lead.site_data?.whatsappLinks ?? []).map((l) => whatsappFromHref(l, country)).filter((p): p is string => !!p);
  phones = addPhones(phones, siteMobiles.map((e164) => ({ e164, source: 'site', mobile: true })));

  // 2. WHOIS (registro.br responde só .br)
  en.domain = brDomainOf(lead.website_url);
  let cnpj: string | null = null;
  if (!lead.website_url) {
    notes.push('Sem domínio: WHOIS não consultado.');
  } else if (!en.domain) {
    notes.push('Domínio não é .br: o WHOIS esconde os dados do dono.');
  } else {
    try {
      const rdap = await deps.rdap(en.domain);
      if (!rdap) notes.push(`${en.domain} não está registrado.`);
      else {
        const w = parseRdap(rdap);
        cnpj = w.cnpj;
        en.people.push(...w.people);
        emails = addEmails(emails, w.emails);
        if (!cnpj) notes.push('Domínio no nome de pessoa física: sem CNPJ.');
      }
    } catch (err) {
      notes.push(`WHOIS falhou: ${(err as Error).message}`);
    }
  }

  // 3. CNPJ
  if (cnpj) {
    try {
      const b = parseBrasilApi(await deps.brasilApi(cnpj));
      if (b) {
        en.company = b.company;
        phones = addPhones(phones, b.phones);
        emails = addEmails(emails, b.emails);
        for (const p of b.people) if (!en.people.some((x) => x.name === p.name)) en.people.push(p);
      }
    } catch (err) {
      notes.push(`Consulta do CNPJ (BrasilAPI) falhou: ${(err as Error).message}`);
    }
    if (!emails.some((e) => e.source === 'cnpj')) {
      try {
        const w = parseCnpjWs(await deps.cnpjWs(cnpj));
        phones = addPhones(phones, w.phones);
        emails = addEmails(emails, w.emails);
      } catch (err) {
        if (err instanceof RateLimited) throw err;
        notes.push(`Consulta do CNPJ (CNPJ.ws) falhou: ${(err as Error).message}`);
      }
    }
    if (!en.company) en.company = { cnpj, legal_name: null, trade_name: null, status: null, activity: null };
  }

  en.emails = emails;
  en.phones = phones;
  return en;
}
