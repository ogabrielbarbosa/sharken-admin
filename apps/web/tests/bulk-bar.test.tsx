import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BulkBar } from '@/components/leads/bulk-bar';

afterEach(cleanup);
const noop = async () => {};

describe('BulkBar', () => {
  it('não renderiza sem seleção', () => {
    const { container } = render(<BulkBar batchId="b1" ids={[]} advance={noop} discard={noop} onClear={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('mostra a contagem e o botão de avançar', () => {
    render(<BulkBar batchId="b1" ids={['a', 'b', 'c']} advance={noop} discard={noop} onClear={() => {}} />);
    expect(screen.getByText('3 selecionados')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Avançar 3 e completar' })).toBeTruthy();
  });
});
