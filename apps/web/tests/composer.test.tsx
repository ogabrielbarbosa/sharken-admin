import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '@/components/crm/composer';
import { composerDraft } from '@/lib/crm';
import type { Lead } from '@lps/domain';

afterEach(cleanup);

const lead = { name: 'Pet Shop Feliz', city: 'Campinas', flow: 'sem_site', site_status: 'sem_link', reason: 'sem site', business_type: 'pet shop' } as unknown as Lead;
const LINK = 'https://pages.exemplo.com.br/feliz-a81c';
const now = new Date('2026-11-11T15:00:00Z');

const base = {
  blockReason: null, templates: [], firstContact: false, dailyCount: 0, dailyLimit: 20,
  quickReplies: [{ shortcut: 'oi', title: 'Cumprimento', text: 'Oi, $primeiro_nome!' }],
  variables: [{ key: 'primeiro_nome', label: 'Primeiro nome', value: 'Ana' }, { key: 'link', label: 'Link', value: null }],
  signatureName: 'Gabriel',
  onSend: vi.fn(async () => {}), onSendMedia: vi.fn(async () => {}), onNote: vi.fn(async () => true), onAfterSendClose: vi.fn(async () => {}),
  replyTo: null, onCancelReply: vi.fn(), gate: null, responsibleName: null, canTakeOver: true, canIntervene: false, intervening: false,
  onOpen: vi.fn(async () => {}), onTakeOver: vi.fn(async () => {}), onIntervene: vi.fn(), droppedFile: null,
};

describe('composerDraft', () => {
  it('sem link da página devolve vazio, sem erro', () => {
    expect(composerDraft({ contact: { status: 'novo', follow_up_at: null }, lead: { ...lead, page_url: null } as Lead, link: null, now, signer: 'Gabriel' })).toBe('');
  });

  it('em novo vem a mensagem de primeiro contato com o link', () => {
    const text = composerDraft({ contact: { status: 'novo', follow_up_at: null }, lead, link: LINK, now, signer: 'Gabriel' });
    expect(text).toContain('Pet Shop Feliz');
    expect(text).toContain(LINK);
  });

  it('o texto da URL substitui o pré-preenchimento', () => {
    expect(composerDraft({ contact: { status: 'novo', follow_up_at: null }, lead, link: LINK, texto: 'Segue o contrato: x', now, signer: 'Gabriel' })).toBe('Segue o contrato: x');
  });

  it('follow-up vencido em contatado traz a mensagem de follow-up', () => {
    const text = composerDraft({ contact: { status: 'contatado', follow_up_at: '2026-11-10T00:00:00Z' }, lead, link: LINK, now, signer: 'Gabriel' });
    expect(text).toContain('de novo');
    expect(text).toContain(LINK);
  });

  it('em conversa o campo começa vazio', () => {
    expect(composerDraft({ contact: { status: 'em_conversa', follow_up_at: null }, lead, link: LINK, now, signer: 'Gabriel' })).toBe('');
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

  it('"/" abre as respostas rápidas e insere o texto com as variáveis', async () => {
    render(<Composer {...base} initialText="" />);
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '/o', selectionStart: 2 } });
    expect(screen.getByText('Cumprimento')).toBeTruthy();
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(box.value).toBe('Oi, Ana!'));
  });

  it('"$" lista as variáveis; sem valor, mantém o nome', async () => {
    render(<Composer {...base} initialText="" />);
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Veja $li', selectionStart: 8 } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(box.value).toBe('Veja $link'));
  });

  it('pendente e fechado: abrir ou intervir; a nota segue livre', async () => {
    const [onOpen, onIntervene, onNote] = [vi.fn(async () => {}), vi.fn(), vi.fn(async () => true)];
    render(<Composer {...base} gate="pendente" responsibleName="Arthur" canIntervene onOpen={onOpen} onIntervene={onIntervene} onNote={onNote} initialText="Olá" />);
    expect(screen.getByText(/Arthur/)).toBeTruthy();
    expect((screen.getByLabelText('Mensagem') as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Intervenção pontual'));
    expect(onIntervene).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Abrir atendimento'));
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Nota' }));
    expect(screen.queryByText('Abrir atendimento')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Salvar nota/ }));
    await waitFor(() => expect(onNote).toHaveBeenCalledWith('Olá'));
  });

  it('aberto de outra pessoa: só alterar o responsável', async () => {
    const onTakeOver = vi.fn(async () => {});
    render(<Composer {...base} gate="outro_responsavel" responsibleName="Arthur" onTakeOver={onTakeOver} initialText="" />);
    expect(screen.queryByText('Intervenção pontual')).toBeNull();
    fireEvent.click(screen.getByText('Alterar responsável'));
    await waitFor(() => expect(onTakeOver).toHaveBeenCalled());
  });

  it('nota salva sem enviar pelo WhatsApp, mesmo com o envio bloqueado', async () => {
    const onNote = vi.fn(async () => true);
    const onSend = vi.fn(async () => {});
    render(<Composer {...base} onNote={onNote} onSend={onSend} blockReason="WhatsApp desconectado." initialText="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Nota' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ligar amanhã' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar nota/ }));
    await waitFor(() => expect(onNote).toHaveBeenCalledWith('Ligar amanhã'));
    expect(onSend).not.toHaveBeenCalled();
  });
});
