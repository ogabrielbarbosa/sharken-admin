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
    website_url: null, instagram_url: null, instagram_last_post_at: null, page_url: null, loom_url: null,
    stage_changed_at: '2026-11-11T10:00:00Z', exit_reason: null,
  } as unknown as Lead;
}

const leads = STAGES.map(lead);
const contacts = { 'l-crm': { id: 'c-1', status: 'contatado' as const } };

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

  it('o cartão analisando mostra "Analisando…" e não tem botões', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    const card = screen.getByTestId('card-l-analisando');
    expect(within(card).getByText('Analisando…')).toBeTruthy();
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    expect(within(card).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('o cartão revisar tem Qualificar e Descartar', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    const card = screen.getByTestId('card-l-revisar');
    expect(within(card).getByRole('button', { name: 'Qualificar Negócio revisar' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Descartar Negócio revisar' })).toBeTruthy();
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

  it('o cartão no CRM mostra o status do contato e aponta para a conversa', () => {
    render(<Board batchId="b1" leads={leads} assets={{}} contacts={contacts} />);
    const card = screen.getByTestId('card-l-crm');
    expect(within(card).getByText('Contatado')).toBeTruthy();
    expect(within(card).getByRole('link').getAttribute('href')).toBe('/painel/crm?contato=c-1');
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
