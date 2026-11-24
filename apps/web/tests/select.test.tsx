import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Select } from '../src/components/ui/select';

afterEach(cleanup);
const many = Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: i === 7 ? 'São José' : `Cidade ${i}` }));

const formValue = (c: HTMLElement) => new FormData(c.querySelector('form')!).get('x');

it('lista curta: escolhe e envia o formulário com o valor novo', async () => {
  const sent = vi.fn();
  const { container } = render(
    <form onSubmit={(e) => { e.preventDefault(); sent(new FormData(e.currentTarget).get('x')); }}>
      <Select autoSubmit name="x" aria-label="Etapa" defaultValue="" options={[{ value: '', label: 'Todas' }, { value: 'a', label: 'Opção A' }]} />
    </form>,
  );
  expect(formValue(container)).toBe('');
  fireEvent.click(screen.getByRole('combobox', { name: 'Etapa' }));
  const option = await screen.findByRole('option', { name: 'Opção A' });
  fireEvent.pointerDown(option);
  fireEvent.mouseUp(option);
  fireEvent.click(option);
  await waitFor(() => expect(sent).toHaveBeenCalledWith('a'));
  await waitFor(() => expect(formValue(container)).toBe('a'));
});

it('lista longa: tem busca sem ligar para acento', async () => {
  const { container } = render(<form><Select name="x" aria-label="Cidade" defaultValue="0" options={many} /></form>);
  fireEvent.click(screen.getByRole('combobox', { name: 'Cidade' }));
  fireEvent.change(await screen.findByPlaceholderText('Buscar…'), { target: { value: 'sao jose' } });
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
  fireEvent.click(screen.getByRole('option', { name: 'São José' }));
  await waitFor(() => expect(formValue(container)).toBe('7'));
});

it('volta ao valor inicial quando o formulário é limpo', async () => {
  const { container } = render(<form><Select name="x" aria-label="Papel" defaultValue="b" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} /></form>);
  fireEvent.click(screen.getByRole('combobox', { name: 'Papel' }));
  const option = await screen.findByRole('option', { name: 'A' });
  fireEvent.pointerDown(option);
  fireEvent.mouseUp(option);
  fireEvent.click(option);
  await waitFor(() => expect(formValue(container)).toBe('a'));
  container.querySelector('form')!.reset();
  await waitFor(() => expect(formValue(container)).toBe('b'));
});
