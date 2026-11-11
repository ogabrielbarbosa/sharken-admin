import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReconnectDrawer } from '@/components/crm/reconnect-drawer';

const router = { refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/painel/crm/actions', () => ({ connectionQrAction: vi.fn() }));

afterEach(cleanup);

describe('ReconnectDrawer', () => {
  it('mostra o QR devolvido', async () => {
    render(<ReconnectDrawer closeHref="/x" fetchQr={async () => ({ ok: true, qr: 'AAAA' })} />);
    const img = await screen.findByAltText('Código QR para conectar o WhatsApp');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(screen.getByText('Conectar o WhatsApp')).toBeTruthy();
  });

  it('avisa quando o servidor não devolve código e o Atualizar busca outro', async () => {
    const fetchQr = vi.fn().mockResolvedValueOnce({ ok: true, qr: null }).mockResolvedValueOnce({ ok: true, qr: 'BBBB' });
    render(<ReconnectDrawer closeHref="/x" fetchQr={fetchQr} />);
    expect(await screen.findByText('O servidor não devolveu um código. Tente Atualizar.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await screen.findByAltText('Código QR para conectar o WhatsApp');
    expect(fetchQr).toHaveBeenCalledTimes(2);
  });

  it('aceita data URL de imagem e rejeita outros esquemas', async () => {
    const { unmount } = render(<ReconnectDrawer closeHref="/x" fetchQr={async () => ({ ok: true, qr: 'data:image/jpeg;base64,CCCC' })} />);
    expect((await screen.findByAltText('Código QR para conectar o WhatsApp')).getAttribute('src')).toBe('data:image/jpeg;base64,CCCC');
    unmount();
    for (const qr of ['data:text/html;base64,PHA+', 'javascript:alert(1)']) {
      render(<ReconnectDrawer closeHref="/x" fetchQr={async () => ({ ok: true, qr })} />);
      expect(await screen.findByText('O servidor não devolveu um código. Tente Atualizar.')).toBeTruthy();
      expect(screen.queryByAltText('Código QR para conectar o WhatsApp')).toBeNull();
      cleanup();
    }
  });

  it('mostra o erro', async () => {
    render(<ReconnectDrawer closeHref="/x" fetchQr={async () => ({ ok: false, error: 'Configure EVOLUTION_URL.' })} />);
    await waitFor(() => expect(screen.getByText('Configure EVOLUTION_URL.')).toBeTruthy());
  });
});
