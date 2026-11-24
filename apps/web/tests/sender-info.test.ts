import { expect, it } from 'vitest';
import type { ThreadMessage } from '../src/components/crm/thread';
import { senderInfo } from '../src/lib/sender-info';

const msg = (over: Partial<ThreadMessage>) => ({ direction: 'saida', sent_from: 'painel', sent_by: 'u1', sent_by_email: 'ana@x.com', connection_name: 'Sharken', connection_phone: '5511912345678', ...over }) as ThreadMessage;
const profiles = { u1: { userId: 'u1', name: 'Ana Lima', avatarUrl: 'foto' } };
const conn = { name: 'Gabriel', avatar: 'wpp' };
const info = (over: Partial<ThreadMessage> = {}, p: typeof profiles | Record<string, never> = profiles) => senderInfo(msg(over), p, conn);

it('mostra o perfil e a conexão gravada', () => {
  expect(info()).toMatchObject({ title: 'Ana Lima', email: 'ana@x.com', avatar: 'foto', connection: 'Sharken' });
});
it('sem perfil ou sem nome usa o e-mail, e a foto fica nas iniciais', () => {
  expect(info({}, {})).toMatchObject({ title: 'ana@x.com', email: null, avatar: null });
});
it('celular e mensagem antiga usam a foto da conexão', () => {
  expect(info({ sent_from: 'celular', sent_by: null, sent_by_email: null })).toMatchObject({ title: 'Enviada pelo celular', avatar: 'wpp', avatarName: 'Gabriel' });
  expect(info({ sent_by: null, sent_by_email: null })).toMatchObject({ title: 'Remetente não registrado', avatar: 'wpp' });
});
it('sem conexão gravada diz não registrada; o número nunca aparece', () => {
  expect(info({ connection_name: null, connection_phone: null })).toMatchObject({ connection: 'não registrada' });
  expect(info({ connection_name: null })).toMatchObject({ connection: 'WhatsApp' });
});
it('nota não tem conexão', () => {
  expect(info({ direction: 'nota' })).toMatchObject({ title: 'Ana Lima', connection: null });
});
