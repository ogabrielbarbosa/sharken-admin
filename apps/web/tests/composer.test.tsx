import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '@/components/crm/composer';
import { composerDraft } from '@/lib/crm';
import type { Lead } from '@lps/domain';

afterEach(cleanup);

const lead = { name: 'Pet Shop Feliz', city: 'Campinas', flow: 'sem_site', site_status: 'sem_link', reason: 'sem site', business_type: 'pet shop' } as unknown as Lead;
const LINK = 'https://pages.exemplo.com.br/feliz-a81c';
const now = new Date('2026-11-11T15:00:00Z');

const base = { blockReason: null, templates: [], firstContact: false, dailyCount: 0, dailyLimit: 20, onSend: vi.fn(async () => {}), onSuggest: vi.fn(async () => ({})) };

describe('composerDraft', () => {
  it('sem link da página devolve vazio, sem erro', () => {
    expect(composerDraft({ contact: { status: 'novo', follow_up_at: null }, lead: { ...lead, page_url: null } as Lead, link: null, now })).toBe('');
  });

  it('em novo vem a mensagem de primeiro contato com o link', () => {
    const text = composerDraft({ contact: { status: 'novo', follow_up_at: null }, lead, link: LINK, now });
    expect(text).toContain('Pet Shop Feliz');
    expect(text).toContain(LINK);
  });

  it('o texto da URL substitui o pré-preenchimento', () => {
    expect(composerDraft({ contact: { status: 'novo', follow_up_at: null }, lead, link: LINK, texto: 'Segue o contrato: x', now })).toBe('Segue o contrato: x');
  });

  it('follow-up vencido em contatado traz a mensagem de follow-up', () => {
    const text = composerDraft({ contact: { status: 'contatado', follow_up_at: '2026-11-10T00:00:00Z' }, lead, link: LINK, now });
    expect(text).toContain('de novo');
    expect(text).toContain(LINK);
  });

  it('em conversa o campo começa vazio', () => {
    expect(composerDraft({ contact: { status: 'em_conversa', follow_up_at: null }, lead, link: LINK, now })).toBe('');
  });
});

describe('Composer', () => {
  it('mostra o texto pré-preenchido', () => {
    render(<Composer key="a" {...base} initialText={`Oi, veja ${LINK}`} />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(`Oi, veja ${LINK}`);
  });

  it('bloqueado: campo desabilitado e o motivo na tela', () => {
    render(<Composer {...base} initialText="" blockReason="Este contato pediu para não receber mensagens." />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByText('Este contato pediu para não receber mensagens.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Enviar/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('envia com um clientMessageId e limpa o campo', async () => {
    const onSend = vi.fn(async () => {});
    render(<Composer {...base} onSend={onSend} initialText="Olá" />);
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    const [text, id] = onSend.mock.calls[0] as unknown as [string, string];
    expect(text).toBe('Olá');
    expect(id).toMatch(/[0-9a-f-]{36}/);
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(''));
  });

  it('passou do limite do dia: pede confirmação e não envia se recusar', async () => {
    const onSend = vi.fn(async () => {});
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Composer {...base} onSend={onSend} firstContact dailyCount={20} dailyLimit={20} initialText="Olá" />);
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }));
    expect(window.confirm).toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });
});
