import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SenderAvatar } from '@/components/crm/sender-avatar';
import type { ThreadMessage, ThreadPeople } from '@/components/crm/thread';

afterEach(cleanup);
const people = (meAvatar: string | null, avatarUrl: string | null = null): ThreadPeople => ({ contactName: 'C', contactAvatar: null, contactSeed: 'c', meName: 'Sharken', meAvatar, profiles: { u: { userId: 'u', name: 'Ana', avatarUrl } } });
const m = (sent_by: string | null) => ({ direction: 'saida', sent_from: sent_by ? 'painel' : 'celular', sent_by, sent_by_email: 'a@x.com', connection_name: 'Sharken', connection_phone: null, at: '2026-11-23T12:00:00Z' }) as ThreadMessage;
const src = (c: HTMLElement) => c.querySelector('img')!.getAttribute('src');

it('hover abre o card e Esc fecha', () => {
  render(<SenderAvatar m={m('u')} people={people(null)} />);
  fireEvent.mouseEnter(screen.getByRole('button', { name: 'Ana' }));
  expect(screen.getByRole('tooltip').textContent).toContain('a@x.com');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('foto do WhatsApp segue a URL nova; a do perfil fica estável', () => {
  const a = render(<SenderAvatar m={m(null)} people={people('https://w/f?oe=1')} />);
  a.rerender(<SenderAvatar m={m(null)} people={people('https://w/f?oe=2')} />);
  expect(src(a.container)).toBe('https://w/f?oe=2');
  const b = render(<SenderAvatar m={m('u')} people={people(null, 'https://s/f?t=1')} />);
  b.rerender(<SenderAvatar m={m('u')} people={people(null, 'https://s/f?t=2')} />);
  expect(src(b.container)).toBe('https://s/f?t=1');
});
