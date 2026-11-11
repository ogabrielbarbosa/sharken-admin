import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BulkBar } from '@/components/leads/bulk-bar';

afterEach(cleanup);
const noop = () => {};

describe('BulkBar', () => {
  it('não renderiza sem seleção', () => {
    const { container } = render(<BulkBar ids={[]} onQualify={noop} onDiscard={noop} onClear={noop} />);
    expect(container.innerHTML).toBe('');
  });

  it('mostra a contagem, Descartar e Qualificar', () => {
    const onQualify = vi.fn();
    render(<BulkBar ids={['a', 'b', 'c']} onQualify={onQualify} onDiscard={noop} onClear={noop} />);
    expect(screen.getByText('3 selecionados')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Qualificar' }));
    expect(onQualify).toHaveBeenCalledOnce();
  });
});
