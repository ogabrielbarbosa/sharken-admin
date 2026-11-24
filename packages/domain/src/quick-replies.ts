/** Variáveis aceitas nas mensagens rápidas: no CRM, viram o valor do contato ao inserir. */
export const QUICK_REPLY_VARIABLES = [
  { key: 'nome', label: 'Nome do contato', sample: 'Ana Souza' },
  { key: 'primeiro_nome', label: 'Primeiro nome', sample: 'Ana' },
  { key: 'telefone', label: 'Telefone', sample: '+5519999990000' },
  { key: 'link', label: 'Link da página', sample: 'https://pages.sharkenapps.com/exemplo' },
  { key: 'cidade', label: 'Cidade', sample: 'Campinas' },
  { key: 'empresa', label: 'Nome comercial', sample: 'Sharken' },
  { key: 'meu_nome', label: 'Seu nome', sample: 'João' },
] as const;

export const QUICK_REPLY_LIMITS = { shortcut: 30, title: 60, body: 4000 };

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Pedir Horário!" → "pedir-horario". Enquanto se digita, o hífen do fim é mantido. */
export function normalizeShortcut(raw: string, typing = false): string {
  const s = plain(raw).replace(/[^a-z0-9_]+/g, '-').replace(/^[-_]+/, '').slice(0, QUICK_REPLY_LIMITS.shortcut);
  return typing ? s : s.replace(/[-_]+$/, '');
}

/** Troca as $variáveis conhecidas pelo valor; as sem valor ficam como estão. */
export function fillVariables(text: string, vars: readonly { key: string; value: string | null }[]): string {
  return text.replace(/\$([a-z_]+)/g, (all, key: string) => vars.find((v) => v.key === key)?.value ?? all);
}

/** $palavras que o sistema não troca (erro de digitação, quase sempre). "R$ 100" não conta. */
export function unknownVariables(text: string): string[] {
  const known = new Set<string>(QUICK_REPLY_VARIABLES.map((v) => v.key));
  return [...new Set([...text.matchAll(/\$([a-z_]+)/g)].map((m) => m[1]!))].filter((k) => !known.has(k));
}

/** Busca sem acento nem maiúscula, no atalho, no título e, se pedido, no texto. */
export function matchesQuickReply(r: { shortcut: string; title: string; text?: string }, query: string): boolean {
  const q = plain(query.trim());
  return !q || [r.shortcut, r.title, r.text ?? ''].some((s) => plain(s).includes(q));
}

export type QuickReplyFields = { shortcut: string; title: string; body: string };

export function parseQuickReply(raw: QuickReplyFields): { ok: true; value: QuickReplyFields } | { ok: false; error: string } {
  const value = { shortcut: normalizeShortcut(raw.shortcut.trim()), title: raw.title.trim(), body: raw.body.trim() };
  if (!value.title) return { ok: false, error: 'Dê um título à mensagem.' };
  if (value.title.length > QUICK_REPLY_LIMITS.title) return { ok: false, error: `O título pode ter até ${QUICK_REPLY_LIMITS.title} caracteres.` };
  if (!value.shortcut) return { ok: false, error: 'Defina um atalho com letras ou números.' };
  if (!value.body) return { ok: false, error: 'Escreva o texto da mensagem.' };
  if (value.body.length > QUICK_REPLY_LIMITS.body) return { ok: false, error: `O texto pode ter até ${QUICK_REPLY_LIMITS.body} caracteres.` };
  return { ok: true, value };
}
