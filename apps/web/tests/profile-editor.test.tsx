import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const save = vi.hoisted(() => vi.fn(async (_: FormData): Promise<{ error: string | null }> => ({ error: null })));
vi.mock('@/app/painel/configuracoes/actions', () => ({ saveProfileAction: save }));
const { ProfileEditor } = await import('@/components/settings/profile-editor');

beforeEach(() => { save.mockReset(); save.mockResolvedValue({ error: null }); });
afterEach(cleanup);

const show = (canEdit = true) => render(<ProfileEditor userId="u" name="Arthur" email="a@x.com" avatarUrl={null} isMe={false} canEdit={canEdit} />);
function type(value: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Editar o nome de Arthur' }));
  const input = screen.getByLabelText('Nome');
  fireEvent.change(input, { target: { value } });
  return input;
}

it('sair do campo salva só o nome', async () => {
  show();
  fireEvent.blur(type(' Arthur Lima '));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(Object.fromEntries(save.mock.calls[0]![0])).toEqual({ user_id: 'u', name: 'Arthur Lima' });
});

it('sem mudança, vazio ou Esc não salva', () => {
  show();
  fireEvent.blur(type('Arthur'));
  fireEvent.blur(type('  '));
  fireEvent.keyDown(type('Outro'), { key: 'Escape' });
  expect(save).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Nome')).toBeNull();
});

it('erro volta o que foi digitado para o campo', async () => {
  save.mockResolvedValue({ error: 'Falhou' });
  show();
  fireEvent.blur(type('A'));
  expect((await screen.findByRole('alert')).textContent).toBe('Falhou');
  expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('A');
});

it('escolher a foto salva; acima de 2 MB nem envia', async () => {
  show();
  const input = screen.getByLabelText('Foto de Arthur');
  const pick = (size: number) => fireEvent.change(input, { target: { files: [new File([new Uint8Array(size)], 'f.png')] } });
  pick(2 * 1024 * 1024 + 1);
  expect(screen.getByRole('alert').textContent).toContain('até 2 MB');
  expect(save).not.toHaveBeenCalled();
  pick(10);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]![0].get('avatar')).toBeInstanceOf(File);
  expect(save.mock.calls[0]![0].has('name')).toBe(false);
});

it('quem não pode editar só vê', () => {
  show(false);
  expect(screen.queryByRole('button')).toBeNull();
});
