import { describe, expect, it } from 'vitest';
import { buildConversationReplyPrompt } from '../src/reply-suggestions';

const msgs = Array.from({ length: 25 }, (_, i) => ({ direction: i % 2 ? ('saida' as const) : ('entrada' as const), kind: 'texto' as const, body: `m${i}` }));

describe('buildConversationReplyPrompt', () => {
  const out = buildConversationReplyPrompt(null, 'Padaria Sol', [...msgs, { direction: 'entrada', kind: 'audio', body: null }]);
  it('usa só as últimas 20 mensagens de texto, em ordem', () => {
    expect(out.user).not.toContain('m4\n');
    expect(out.user).toContain('Pessoa: m24');
    expect(out.user.indexOf('m5')).toBeLessThan(out.user.indexOf('m24'));
  });
  it('sem lead usa o nome do contato e mantém as regras do sistema', () => {
    expect(out.user).toContain('Padaria Sol');
    expect(out.system).toContain('[valor]');
  });
});
