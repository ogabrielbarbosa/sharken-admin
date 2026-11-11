import type { Flow, Lead, LeadAsset } from '@lps/domain';

export type PageBriefMaterial = { arquivo: string; origem: string; texto: string };

/** O que o agente recebe em `brief.json` (spec de Material §2). Sem comentário interno e sem autor de avaliação. */
export type PageBrief = {
  negocio: {
    nome: string;
    tipo: string | null;
    categorias: string[];
    telefone: string | null;
    endereco: string | null;
    cidade: string | null;
    descricao: string | null;
    nota: number | null;
    total_avaliacoes: number;
  };
  fluxo: Flow;
  motivo?: string;
  avaliacoes: { texto: string; estrelas: number }[];
  site_atual: { titulo: string | null; descricao: string | null; cor: string | null } | null;
  logo: string | null;
  fotos: string[];
  material: PageBriefMaterial[];
};

const MAX_REVIEWS = 8;

function assetOrigin(asset: LeadAsset): string {
  if (asset.label?.trim()) return asset.label.trim();
  if (asset.kind === 'link' && asset.url) return asset.url;
  if (asset.kind === 'arquivo') return 'arquivo enviado';
  return 'texto do Gabriel';
}

export function buildPageBrief(lead: Lead, assets: LeadAsset[], photos: string[], logo: string | null = null): PageBrief {
  const flow = lead.flow ?? 'sem_site';
  const material = assets
    .filter((a) => a.status === 'pronto' && a.extracted_text?.trim())
    .map((a, i) => ({ arquivo: `material/item-${i + 1}.txt`, origem: assetOrigin(a), texto: a.extracted_text!.trim() }));
  const site = lead.site_data;
  return {
    negocio: {
      nome: lead.name,
      tipo: lead.business_type,
      categorias: lead.categories,
      telefone: lead.phone_e164,
      endereco: lead.address,
      cidade: lead.city,
      descricao: lead.description,
      nota: lead.rating,
      total_avaliacoes: lead.reviews_count,
    },
    fluxo: flow,
    ...(flow === 'melhorar_site' && lead.reason?.trim() ? { motivo: lead.reason.trim() } : {}),
    avaliacoes: lead.reviews.filter((r) => r.text?.trim()).slice(0, MAX_REVIEWS).map((r) => ({ texto: r.text, estrelas: r.stars })),
    site_atual: site ? { titulo: site.title, descricao: site.description, cor: site.themeColor } : null,
    logo,
    fotos: photos,
    material,
  };
}
