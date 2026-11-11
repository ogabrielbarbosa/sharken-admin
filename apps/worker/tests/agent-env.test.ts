import { describe, expect, it } from 'vitest';
import { agentEnv } from '../src/page-agent';

describe('agentEnv', () => {
  it('passa só a chave da Anthropic e o básico do sistema', () => {
    const out = agentEnv({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'u', PATH: '/bin', HOME: '/h', TMPDIR: '/t', SUPABASE_SERVICE_ROLE_KEY: 's', ELEVENLABS_API_KEY: 'e' });
    expect(out).toEqual({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'u', PATH: '/bin', HOME: '/h', TMPDIR: '/t' });
  });
});
