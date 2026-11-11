import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { STALE } from '@lps/db';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lead } from '@lps/domain';
import { STALE_NOTICE } from '@/components/pipeline/board';
import { LinkModal } from '@/components/pipeline/link-modal';

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }));
const actions = vi.hoisted(() => ({
  savePageUrlAction: vi.fn(), saveLoomUrlAction: vi.fn(), stepBackAction: vi.fn(), discardAction: vi.fn(),
  qualifyAction: vi.fn(), completeInfoAction: vi.fn(), saveLeadFieldAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({ href, children, replace: _r, scroll: _s, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode; replace?: boolean; scroll?: boolean }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/app/painel/batches/[id]/actions', () => actions);

// O jsdom não implementa showModal.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.open = true; };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const lead = { id: 'l1', name: 'Clínica Sorriso', stage: 'pagina', business_type: 'Dentista', city: 'Taubaté', page_url: null, loom_url: null } as unknown as Lead;
const closeHref = '/painel/batches/b1?ordem=avaliacoes';

describe('aviso de lead que já mudou de etapa', () => {
  it('usa o mesmo texto do pacote do banco', () => {
    expect(STALE_NOTICE).toBe(STALE);
  });

  it('fecha o modal e leva o aviso ao quadro pela URL', async () => {
    actions.savePageUrlAction.mockResolvedValue({ ok: false, error: STALE });
    render(<LinkModal kind="pagina" lead={lead} closeHref={closeHref} />);
    fireEvent.change(screen.getByPlaceholderText('https://…'), { target: { value: 'site.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`${closeHref}&aviso=${encodeURIComponent(STALE)}`, { scroll: false }));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('outros erros ficam no modal', async () => {
    actions.savePageUrlAction.mockResolvedValue({ ok: false, error: 'Esse link não parece válido.' });
    render(<LinkModal kind="pagina" lead={lead} closeHref={closeHref} />);
    fireEvent.change(screen.getByPlaceholderText('https://…'), { target: { value: 'xx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Esse link não parece válido.')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
