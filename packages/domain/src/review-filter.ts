import type { Lead } from './types';

type FilterLead = Pick<Lead, 'score' | 'reviews_count' | 'rating' | 'images_count' | 'site_status' | 'flow' | 'reason' | 'instagram_url' | 'instagram_last_post_at'>;

export type FilterOption = { value: string; label: string; hint: string };

/**
 * Grupos de escolha múltipla. Cada lead cai em exatamente uma opção de cada grupo
 * (ou em nenhuma, quando o grupo não se aplica a ele), então incluir e excluir são exatos.
 */
export const FILTER_GROUPS = {
  site: {
    label: 'Site',
    options: [
      { value: 'sem_link', label: 'Sem link', hint: 'O Google não tem nenhum link cadastrado.' },
      { value: 'somente_social', label: 'Só rede social', hint: 'O link do Google é Instagram, Facebook, WhatsApp, Linktree ou parecido.' },
      { value: 'fora_do_ar', label: 'Fora do ar', hint: 'O site não abriu em 3 tentativas, com 5 minutos entre elas.' },
      { value: 'funcionando', label: 'Funcionando', hint: 'O site abriu. Vai para o fluxo melhorar site.' },
    ],
  },
  instagram: {
    label: 'Instagram',
    options: [
      { value: 'ativo', label: 'Ativo', hint: 'Postou nos últimos 30 dias.' },
      { value: 'parado', label: 'Parado', hint: 'Tem Instagram, mas não postou nos últimos 30 dias.' },
      { value: 'sem', label: 'Não encontrado', hint: 'Sem Instagram no Google. Pode ter um, mas não foi buscado.' },
    ],
  },
  motivo: {
    label: 'Motivo da IA',
    options: [
      { value: 'com', label: 'Com motivo', hint: 'A IA achou algo concreto para melhorar no site.' },
      { value: 'sem', label: 'Sem motivo', hint: 'A IA não achou o que melhorar. Bom candidato a descarte.' },
    ],
  },
} as const satisfies Record<string, { label: string; options: readonly FilterOption[] }>;

export type FilterGroupKey = keyof typeof FILTER_GROUPS;
export const FILTER_GROUP_KEYS = Object.keys(FILTER_GROUPS) as FilterGroupKey[];
/** Hint mostrado no grupo Motivo: só se aplica a quem tem site funcionando. */
export const MOTIVO_NOTE = 'Só vale para leads com site funcionando.';

export const ORDER_OPTIONS = [
  { value: 'pontuacao', label: 'Maior pontuação', hint: 'Soma dos critérios do batch, de 0 a 100.' },
  { value: 'avaliacoes', label: 'Mais avaliações', hint: 'Número de avaliações no Google.' },
  { value: 'nota', label: 'Maior nota', hint: 'Nota média no Google.' },
  { value: 'fotos', label: 'Mais fotos', hint: 'Número de fotos no perfil do Google.' },
] as const;
export type OrderKey = (typeof ORDER_OPTIONS)[number]['value'];

export const NUMBER_FILTERS = [
  { key: 'minAvaliacoes', label: 'Avaliações', step: '1' },
  { key: 'minNota', label: 'Nota', step: '0.1' },
  { key: 'minFotos', label: 'Fotos', step: '1' },
] as const;
export type NumberKey = (typeof NUMBER_FILTERS)[number]['key'];

/** Cada opção pode ser incluída ou excluída, de forma independente. */
export type GroupFilter = { include: string[]; exclude: string[] };
export type OptionState = 'off' | 'incluir' | 'excluir';

export const optionState = (g: GroupFilter | undefined, value: string): OptionState =>
  g?.include.includes(value) ? 'incluir' : g?.exclude.includes(value) ? 'excluir' : 'off';

/** Um clique inclui, o segundo exclui, o terceiro desmarca. Devolve undefined quando o grupo fica vazio. */
export function cycleOption(g: GroupFilter | undefined, value: string): GroupFilter | undefined {
  const state = optionState(g, value);
  const include = (g?.include ?? []).filter((v) => v !== value);
  const exclude = (g?.exclude ?? []).filter((v) => v !== value);
  if (state === 'off') include.push(value);
  if (state === 'incluir') exclude.push(value);
  return include.length || exclude.length ? { include, exclude } : undefined;
}

export type ReviewFilter = {
  groups: Partial<Record<FilterGroupKey, GroupFilter>>;
  mins: Partial<Record<NumberKey, number>>;
  ordem: OrderKey;
};

export const EMPTY_FILTER: ReviewFilter = { groups: {}, mins: {}, ordem: 'pontuacao' };

const number = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Na URL: `site=sem_link,-somente_social` inclui sem link e exclui só rede social. */
function parseGroup(key: FilterGroupKey, raw: unknown): GroupFilter | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  const valid = FILTER_GROUPS[key].options.map((o) => o.value as string);
  const include: string[] = [];
  const exclude: string[] = [];
  for (const token of raw.split(',')) {
    const value = token.replace(/^-/, '');
    if (!valid.includes(value) || include.includes(value) || exclude.includes(value)) continue;
    (token.startsWith('-') ? exclude : include).push(value);
  }
  return include.length || exclude.length ? { include, exclude } : undefined;
}

const groupActive = (g: GroupFilter | undefined) => !!g && (g.include.length > 0 || g.exclude.length > 0);

export function parseReviewFilter(params: Record<string, string | string[] | undefined>): ReviewFilter {
  const f: ReviewFilter = { groups: {}, mins: {}, ordem: 'pontuacao' };
  for (const key of FILTER_GROUP_KEYS) {
    const g = parseGroup(key, params[key]);
    if (g) f.groups[key] = g;
  }
  for (const { key } of NUMBER_FILTERS) {
    const n = number(params[key]);
    if (n !== undefined) f.mins[key] = n;
  }
  const ordem = ORDER_OPTIONS.find((o) => o.value === params.ordem);
  if (ordem) f.ordem = ordem.value;
  return f;
}

export function serializeReviewFilter(f: ReviewFilter): string {
  const params = new URLSearchParams();
  for (const key of FILTER_GROUP_KEYS) {
    const g = f.groups[key];
    if (groupActive(g)) params.set(key, [...g!.include, ...g!.exclude.map((v) => `-${v}`)].join(','));
  }
  for (const { key } of NUMBER_FILTERS) {
    const n = f.mins[key];
    if (n !== undefined) params.set(key, String(n));
  }
  if (f.ordem !== 'pontuacao') params.set('ordem', f.ordem);
  return params.toString();
}

const DAY = 86_400_000;

/** Em qual opção de cada grupo o lead cai. `null` quando o grupo não se aplica. */
export function leadCategory(lead: FilterLead, key: FilterGroupKey, now: Date): string | null {
  switch (key) {
    case 'site':
      return lead.site_status;
    case 'instagram': {
      if (!lead.instagram_url) return 'sem';
      const last = lead.instagram_last_post_at;
      return last && now.getTime() - new Date(last).getTime() <= 30 * DAY ? 'ativo' : 'parado';
    }
    case 'motivo':
      if (lead.flow !== 'melhorar_site') return null;
      return lead.reason?.trim() ? 'com' : 'sem';
  }
}

function matches(lead: FilterLead, f: ReviewFilter, now: Date) {
  for (const key of FILTER_GROUP_KEYS) {
    const g = f.groups[key];
    if (!groupActive(g)) continue;
    const cat = leadCategory(lead, key, now);
    if (g!.include.length && (cat === null || !g!.include.includes(cat))) return false;
    if (cat !== null && g!.exclude.includes(cat)) return false;
  }
  const { minAvaliacoes, minNota, minFotos } = f.mins;
  if (minAvaliacoes !== undefined && lead.reviews_count < minAvaliacoes) return false;
  if (minNota !== undefined && (lead.rating ?? 0) < minNota) return false;
  if (minFotos !== undefined && lead.images_count < minFotos) return false;
  return true;
}

const sortValue: Record<OrderKey, (l: FilterLead) => number> = {
  pontuacao: (l) => l.score ?? 0,
  avaliacoes: (l) => l.reviews_count,
  nota: (l) => l.rating ?? 0,
  fotos: (l) => l.images_count,
};

/** Filtra e ordena os leads da tela Revisar. Empate: mais avaliações primeiro. */
export function applyReviewFilter<T extends FilterLead>(leads: T[], f: ReviewFilter, now: Date): T[] {
  const value = sortValue[f.ordem];
  return leads
    .filter((l) => matches(l, f, now))
    .sort((a, b) => value(b) - value(a) || b.reviews_count - a.reviews_count);
}

/** Quantos leads caem em cada opção, para mostrar ao lado dela. */
export function countByOption<T extends FilterLead>(leads: T[], now: Date): Record<FilterGroupKey, Record<string, number>> {
  const out = Object.fromEntries(FILTER_GROUP_KEYS.map((k) => [k, {} as Record<string, number>])) as Record<FilterGroupKey, Record<string, number>>;
  for (const lead of leads) {
    for (const key of FILTER_GROUP_KEYS) {
      const cat = leadCategory(lead, key, now);
      if (cat) out[key][cat] = (out[key][cat] ?? 0) + 1;
    }
  }
  return out;
}

export const activeFilterCount = (f: ReviewFilter) =>
  Object.values(f.groups).filter(groupActive).length + Object.keys(f.mins).length + (f.ordem !== 'pontuacao' ? 1 : 0);

export const isFiltering = (f: ReviewFilter) => activeFilterCount(f) > 0;
