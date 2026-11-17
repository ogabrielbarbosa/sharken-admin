import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lead, LeadStage } from '@lps/domain';
import { Board } from '@/components/pipeline/board';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, replace: _r, scroll: _s, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode; replace?: boolean; scroll?: boolean }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/app/painel/batches/[id]/actions', () => ({ qualifyAction: vi.fn(), discardAction: vi.fn() }));

afterEach(cleanup);

const STAGES: LeadStage[] = ['analisando', 'revisar', 'completar', 'pagina', 'video', 'crm', 'vendido', 'descartado', 'sem_interesse', 'nao_contatar'];

function lead(stage: LeadStage): Lead {
  return {
    id: `l-${stage}`, name: `Negócio ${stage}`, stage, batch_id: 'b1', place_id: `p-${stage}`,
    business_type: 'Dentista', city: 'Taubaté', phone_raw: null, phone_e164: null, address: null,
    rating: 4.8, reviews_count: 12, score: 70, site_status: 'sem_site', flow: 'sem_site',
    categories: [], photos: [], reviews: [], site_checks: [], site_signals: null, score_reasons: null,
    website_url: null, instagram_url: null, instagram_last_post_at: null, instagram_media: [], page_url: null, loom_url: null,
    stage_changed_at: '2026-11-11T10:00:00Z', exit_reason: null,
  } as unknown as Lead;
}

const leads = STAGES.map(lead);
const contacts = { 'l-crm': [{ id: 'c-1', status: 'contatado' as const }] };

function column(label: string) {
  return screen.getByRole('region', { name: label });
}

describe('Board', () => {
  it('mostra as 6 colunas com os rótulos e as contagens', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    const expected: [string, number][] = [['Novo lead', 2], ['Qualificado', 1], ['Página', 1], ['Vídeo', 1], ['Pronto para abordar', 3]];
    for (const [label, count] of expected) {
      const heading = within(column(label)).getByRole('heading');
      expect(heading.textContent).toBe(`${label}${count}`);
    }
    expect(column('Descartados')).toBeTruthy();
  });

  it('Descartados começa recolhida e expande ao clicar', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    const descartados = column('Descartados');
    const toggle = within(descartados).getByRole('button', { name: 'Descartados (2)' });
    expect(within(descartados).queryByText('Negócio descartado')).toBeNull();
    fireEvent.click(toggle);
    expect(within(column('Descartados')).getByText('Negócio descartado')).toBeTruthy();
  });

  it('Descartados aberta recolhe pelo botão do cabeçalho', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    fireEvent.click(within(column('Descartados')).getByRole('button', { name: 'Descartados (2)' }));
    fireEvent.click(within(column('Descartados')).getByRole('button', { name: 'Recolher descartados' }));
    expect(within(column('Descartados')).queryByText('Negócio descartado')).toBeNull();
  });

  it('Novo lead não tem caixas de seleção', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    expect(within(column('Novo lead')).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('o cartão analisando mostra "Analisando…"', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    expect(within(screen.getByTestId('card-l-analisando')).getByText('Analisando…')).toBeTruthy();
  });

  it('todos os cartões têm o mesmo formato: pontuação na bolinha e status do site, sem avaliação nem botões', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    fireEvent.click(within(column('Descartados')).getByRole('button', { name: 'Descartados (2)' }));
    for (const stage of STAGES) {
      const card = screen.getByTestId(`card-l-${stage}`);
      expect(within(card).getByLabelText('Pontuação 70').textContent).toBe('70');
      expect(within(card).getByText('Sem site')).toBeTruthy();
      expect(within(card).queryByText(/4\.8/)).toBeNull();
      expect(within(card).queryAllByRole('button')).toHaveLength(0);
    }
  });

  it('o cartão revisar abre ao clicar em qualquer parte', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    expect(within(screen.getByTestId('card-l-revisar')).getByRole('link').getAttribute('href')).toBe('/painel/batches/b1?lead=l-revisar');
  });

  it('arrastar um cartão até Descartados descarta o lead', async () => {
    const { discardAction } = await import('@/app/painel/batches/[id]/actions');
    vi.mocked(discardAction).mockResolvedValue({ ok: true } as never);
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    const card = screen.getByTestId('card-l-pagina');
    expect(card.getAttribute('draggable')).toBe('true');
    expect(screen.getByTestId('card-l-vendido').getAttribute('draggable')).toBe('false');
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(card, { dataTransfer });
    const trash = column('Descartados');
    fireEvent.dragOver(trash, { dataTransfer });
    fireEvent.drop(trash, { dataTransfer });
    expect(discardAction).toHaveBeenCalledWith(['l-pagina']);
  });

  it('Página mostra "Falta a página" e Vídeo mostra "Falta o Loom"', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    expect(within(screen.getByTestId('card-l-pagina')).getByText('Falta a página')).toBeTruthy();
    expect(within(screen.getByTestId('card-l-video')).getByText('Falta o Loom')).toBeTruthy();
  });

  it('Página mostra o domínio quando há link', () => {
    const withPage = { ...lead('video'), page_url: 'https://www.clinica.com.br/inicio' };
    render(<Board batchId="b1" leads={[withPage]} assets={{}} contacts={{}} />);
    expect(within(screen.getByTestId('card-l-video')).getByText('clinica.com.br')).toBeTruthy();
  });

  it('com um contato só, o cartão mostra o status e abre a conversa direto', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    const card = screen.getByTestId('card-l-crm');
    expect(within(card).getByText('Contatado')).toBeTruthy();
    expect(within(card).getByRole('link').getAttribute('href')).toBe('/painel/crm?aba=aberto&contato=c-1');
  });

  it('com vários números, o cartão conta as conversas e abre a lista', () => {
    const many = { 'l-crm': [{ id: 'c-1', status: 'em_conversa' as const }, { id: 'c-2', status: 'novo' as const }] };
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={many} />);
    const card = screen.getByTestId('card-l-crm');
    expect(within(card).getByText('2 conversas')).toBeTruthy();
    expect(within(card).getByRole('link').getAttribute('href')).toBe('/painel/batches/b1?lead=l-crm');
  });

  it('sem contato, o cartão abre a lista para adicionar número', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={{}} />);
    expect(within(screen.getByTestId('card-l-crm')).getByRole('link').getAttribute('href')).toBe('/painel/batches/b1?lead=l-crm');
  });

  it('Qualificado resume os itens acrescentados', () => {
    const asset = (kind: string, status = 'pronto', mime: string | null = null, images: string[] = []) => ({ kind, status, mime_type: mime, extracted_images: images });
    const assets = { 'l-completar': [asset('link'), asset('link', 'extraindo'), asset('arquivo', 'pronto', 'application/pdf', ['a', 'b'])] } as never;
    render(<Board batchId="b1" leads={leads} assets={assets} contacts={contacts} />);
    const card = screen.getByTestId('card-l-completar');
    expect(within(card).getByText('2 links · 1 PDF · 2 fotos')).toBeTruthy();
    expect(within(card).getByText('1 em extração')).toBeTruthy();
  });
});
