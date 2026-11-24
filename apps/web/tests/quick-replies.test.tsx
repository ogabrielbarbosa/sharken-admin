import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';

const ok = { ok: true as const, message: 'ok' };
const actions = vi.hoisted(() => ({
  saveQuickReplyAction: vi.fn(), toggleQuickReplyAction: vi.fn(), deleteQuickReplyAction: vi.fn(),
  reorderQuickRepliesAction: vi.fn(), restoreQuickRepliesAction: vi.fn(),
}));
vi.mock('@/app/painel/configuracoes/actions', () => actions);
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const items = [
  { id: '1', shortcut: 'oi', title: 'Cumprimento', body: 'Oi, $primeiro_nome!', position: 0, active: true },
  { id: '2', shortcut: 'hora', title: 'Horário', body: 'Que horas?', position: 1, active: true },
];
const variables = [{ key: 'primeiro_nome', label: 'Primeiro nome', value: 'Ana' }];
const show = (canEdit = true) => render(<QuickRepliesManager items={items} variables={variables} canEdit={canEdit} />);

describe('Mensagens rápidas', () => {
  it('cria: sugere o atalho, mostra a prévia e salva', async () => {
    actions.saveQuickReplyAction.mockResolvedValue(ok);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Nova mensagem' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Confirmar Reunião' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: '*Oi*, $primeiro_nome' } });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Oi').tagName).toBe('STRONG');
    fireEvent.click(screen.getByRole('button', { name: 'Criar mensagem' }));
    await waitFor(() => expect(actions.saveQuickReplyAction).toHaveBeenCalledWith(null, { title: 'Confirmar Reunião', shortcut: 'confirmar-reuniao', body: '*Oi*, $primeiro_nome' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('não deixa salvar atalho repetido nem perder o texto sem confirmar', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Cumprimento' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Atalho' }), { target: { value: 'hora' } });
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Descartar o que você escreveu?')).toBeTruthy();
  });
  it('busca sem acento e reordena', async () => {
    actions.reorderQuickRepliesAction.mockResolvedValue(ok);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Descer Cumprimento' }));
    await waitFor(() => expect(actions.reorderQuickRepliesAction).toHaveBeenCalledWith(['2', '1']));
    fireEvent.change(screen.getByLabelText('Buscar mensagem'), { target: { value: 'horario' } });
    expect(screen.queryByText('Cumprimento')).toBeNull();
  });
  it('volta atrás quando o servidor recusa', async () => {
    actions.toggleQuickReplyAction.mockResolvedValue({ ok: false, error: 'Falhou' });
    show();
    const sw = screen.getByRole('switch', { name: 'Cumprimento no atendimento' });
    fireEvent.click(sw);
    await screen.findByText('Falhou');
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });
  it('exclui só depois de confirmar', async () => {
    actions.deleteQuickReplyAction.mockResolvedValue(ok);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Cumprimento' }));
    expect(actions.deleteQuickReplyAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(actions.deleteQuickReplyAction).toHaveBeenCalledWith('1'));
  });
  it('membro só vê', () => {
    show(false);
    expect(screen.queryByRole('button', { name: 'Nova mensagem' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
