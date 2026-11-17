// @vitest-environment node
import { describe, expect, it } from 'vitest';
import config from '../next.config';

describe('headers do next.config', () => {
  it('bloqueia embutir login e consentimento em iframe', async () => {
    const rules = await config.headers!();
    for (const source of ['/oauth/:path*', '/login']) {
      const h = rules.find((r) => r.source === source)?.headers ?? [];
      expect(h).toContainEqual({ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" });
      expect(h).toContainEqual({ key: 'X-Frame-Options', value: 'DENY' });
    }
  });
});
