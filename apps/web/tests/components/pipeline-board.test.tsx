import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lead, LeadStage } from '@lps/domain';
import { Board } from '@/components/pipeline/board';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, replace: _r, scroll: _s, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode; replace?: boolean; scroll?: boolean }) => <a href={href} {...rest}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}));
vi.mock('@/app/painel/batches/[id]/actions', () => ({ qualifyAction: vi.fn(), discardAction: vi.fn(), completeInfoAction: vi.fn(), stepBackAction: vi.fn(), setLeadResponsibleAction: vi.fn() }));

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
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    const expected: [string, number][] = [['Novo lead', 2], ['Qualificado', 1], ['Página', 1], ['Vídeo', 1], ['Pronto para abordar', 3]];
    for (const [label, count] of expected) {
      const heading = within(column(label)).getByRole('heading');
      expect(heading.textContent).toBe(`${label}${count}`);
    }
    expect(column('Descartados')).toBeTruthy();
  });

  it('Descartados começa recolhida e expande ao clicar', () => {
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    const descartados = column('Descartados');
    const toggle = within(descartados).getByRole('button', { name: 'Descartados (2)' });
    expect(within(descartados).queryByText('Negócio descartado')).toBeNull();
    fireEvent.click(toggle);
    expect(within(column('Descartados')).getByText('Negócio descartado')).toBeTruthy();
  });

  it('Descartados aberta recolhe pelo botão do cabeçalho', () => {
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    fireEvent.click(within(column('Descartados')).getByRole('button', { name: 'Descartados (2)' }));
    fireEvent.click(within(column('Descartados')).getByRole('button', { name: 'Recolher descartados' }));
    expect(within(column('Descartados')).queryByText('Negócio descartado')).toBeNull();
  });

  it('Novo lead não tem caixas de seleção', () => {
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    expect(within(column('Novo lead')).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('o cartão analisando mostra "Analisando…"', () => {
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    expect(within(screen.getByTestId('card-l-analisando')).getByText('Analisando…')).toBeTruthy();
  });

  it('todos os cartões têm o mesmo formato: pontuação na barra, responsável e status do site, sem avaliação', () => {
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    fireEvent.click(within(column('Descartados')).getByRole('button', { name: 'Descartados (2)' }));
    for (const stage of STAGES) {
      const card = screen.getByTestId(`card-l-${stage}`);
      expect(within(card).getByRole('meter', { name: 'Pontuação 70' }).getAttribute('aria-valuenow')).toBe('70');
      expect(within(card).getByText('Sem site')).toBeTruthy();
      expect(within(card).queryByText(/4\.8/)).toBeNull();
      expect(within(card).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([`Responsável por Negócio ${stage}: ninguém`]);
    }
  });

  it('escolher um membro na bolinha define o responsável', async () => {
    const { setLeadResponsibleAction } = await import('@/app/painel/batches/[id]/actions');
    vi.mocked(setLeadResponsibleAction).mockResolvedValue({ ok: true });
    render(<Board batchId="b1" leads={leads} contacts={contacts} members={[{ id: 'u1', name: 'Ana', avatarUrl: null }]} />);
    fireEvent.click(within(screen.getByTestId('card-l-revisar')).getByRole('button'));
    fireEvent.click(screen.getByRole('option', { name: /Ana/ }));
    expect(setLeadResponsibleAction).toHaveBeenCalledWith('l-revisar', 'u1');
  });

  it('o cartão revisar abre ao clicar em qualquer parte', () => {
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    expect(within(screen.getByTestId('card-l-revisar')).getByRole('link', { name: 'Negócio revisar' }).getAttribute('href')).toBe('/painel/batches/b1?lead=l-revisar');
  });

  it('o cartão tem atalhos para Instagram, Maps e site, os que faltam ficam apagados', () => {
    const withLinks = { ...lead('revisar'), website_url: 'clinica.com.br', site_status: 'funcionando', instagram_url: 'https://instagram.com/clinica' } as Lead;
    render(<Board batchId="b1" leads={[withLinks, lead('pagina')]} contacts={contacts} />);
    const card = within(screen.getByTestId('card-l-revisar'));
    expect(card.getByRole('link', { name: 'Instagram de Negócio revisar' }).getAttribute('href')).toBe('https://instagram.com/clinica');
    expect(card.getByRole('link', { name: 'Site de Negócio revisar' }).getAttribute('href')).toBe('https://clinica.com.br');
    expect(card.getByRole('link', { name: 'Google Maps de Negócio revisar' }).getAttribute('href')).toContain('query_place_id=p-revisar');
    const bare = within(screen.getByTestId('card-l-pagina'));
    expect(bare.getByRole('link', { name: 'Google Maps de Negócio pagina' })).toBeTruthy();
    expect(bare.queryByRole('link', { name: /Instagram|Site/ })).toBeNull();
    expect(bare.getByLabelText('Sem Instagram')).toBeTruthy();
    expect(bare.getByLabelText('Sem Site')).toBeTruthy();
  });

  it('arrastar um cartão até Descartados descarta o lead', async () => {
    const { discardAction } = await import('@/app/painel/batches/[id]/actions');
    vi.mocked(discardAction).mockResolvedValue({ ok: true } as never);
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
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

  it('arrastar de Novo lead até Qualificado qualifica o lead', async () => {
    const { qualifyAction } = await import('@/app/painel/batches/[id]/actions');
    vi.mocked(qualifyAction).mockResolvedValue({ ok: true } as never);
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(screen.getByTestId('card-l-revisar'), { dataTransfer });
    fireEvent.dragOver(column('Qualificado'), { dataTransfer });
    fireEvent.drop(column('Qualificado'), { dataTransfer });
    expect(qualifyAction).toHaveBeenCalledWith(['l-revisar']);
  });

  it('arrastar de Vídeo de volta para Página volta uma etapa', async () => {
    const { stepBackAction } = await import('@/app/painel/batches/[id]/actions');
    vi.mocked(stepBackAction).mockResolvedValue({ ok: true } as never);
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(screen.getByTestId('card-l-video'), { dataTransfer });
    fireEvent.drop(column('Página'), { dataTransfer });
    expect(stepBackAction).toHaveBeenCalledWith('l-video', 'video');
  });

  it('arrastar de Página até Vídeo abre o modal para colar o link', () => {
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(screen.getByTestId('card-l-pagina'), { dataTransfer });
    fireEvent.drop(column('Vídeo'), { dataTransfer });
    expect(push).toHaveBeenCalledWith('/painel/batches/b1?lead=l-pagina', { scroll: false });
  });

  it('soltar numa coluna que pula etapa não faz nada', async () => {
    const { qualifyAction, completeInfoAction } = await import('@/app/painel/batches/[id]/actions');
    vi.mocked(qualifyAction).mockClear();
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(screen.getByTestId('card-l-revisar'), { dataTransfer });
    fireEvent.drop(column('Página'), { dataTransfer });
    expect(qualifyAction).not.toHaveBeenCalled();
    expect(completeInfoAction).not.toHaveBeenCalled();
  });

  it('Página e Vídeo não mostram aviso de "falta"', () => {
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    expect(within(screen.getByTestId('card-l-pagina')).queryByText(/falta/i)).toBeNull();
    expect(within(screen.getByTestId('card-l-video')).queryByText(/falta/i)).toBeNull();
  });

  it('página e vídeo prontos viram botões azuis', () => {
    const withPage = { ...lead('video'), page_url: 'https://www.clinica.com.br/inicio', loom_url: 'https://loom.com/share/x' };
    render(<Board batchId="b1" leads={[withPage]} contacts={{}} />);
    const card = within(screen.getByTestId('card-l-video'));
    expect(card.getByRole('link', { name: 'Página de Negócio video' }).getAttribute('href')).toBe('https://www.clinica.com.br/inicio');
    expect(card.getByRole('link', { name: 'Vídeo de Negócio video' }).getAttribute('href')).toBe('https://loom.com/share/x');
  });

  it('com um contato só, o cartão mostra o status e abre a conversa direto', () => {
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    const card = screen.getByTestId('card-l-crm');
    expect(within(card).getByText('Contatado')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Negócio crm' }).getAttribute('href')).toBe('/painel/crm?aba=aberto&contato=c-1');
  });

  it('com vários números, o cartão conta as conversas e abre a lista', () => {
    const many = { 'l-crm': [{ id: 'c-1', status: 'em_conversa' as const }, { id: 'c-2', status: 'novo' as const }] };
    render(<Board batchId="b1" leads={leads} contacts={many} />);
    const card = screen.getByTestId('card-l-crm');
    expect(within(card).getByText('2 conversas')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Negócio crm' }).getAttribute('href')).toBe('/painel/batches/b1?lead=l-crm');
  });

  it('sem contato, o cartão abre a lista para adicionar número', () => {
    render(<Board batchId="b1" leads={leads} contacts={{}} />);
    expect(within(screen.getByTestId('card-l-crm')).getByRole('link', { name: 'Negócio crm' }).getAttribute('href')).toBe('/painel/batches/b1?lead=l-crm');
  });

  it('Qualificado não mostra nada além do básico', () => {
    render(<Board batchId="b1" leads={leads} contacts={contacts} />);
    expect(within(screen.getByTestId('card-l-completar')).queryByText(/Nada acrescentado/)).toBeNull();
  });
});
