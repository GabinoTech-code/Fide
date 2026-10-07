import { describe, expect, it } from 'vitest';
import { portalHeaders, previewHeaders, siteHeaders, toCloudflareHeaders } from './security-headers';

const csp = (rules: ReturnType<typeof portalHeaders>) => previewHeaders(rules)['Content-Security-Policy'];

describe('security headers', () => {
  for (const [name, rules] of [
    ['site', siteHeaders],
    ['portal', portalHeaders(['https://*.supabase.co'])],
  ] as const) {
    it(`${name}: strict CSP without inline scripts, eval or framing`, () => {
      const policy = csp(rules);
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("object-src 'none'");
      expect(policy).not.toMatch(/'unsafe-inline'|'unsafe-eval'|\*(?!\.supabase\.co)/);
      const headers = previewHeaders(rules);
      expect(headers['Strict-Transport-Security']).toMatch(/max-age=\d{8,}/);
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });
  }

  it('portal allows only Supabase for network calls (https and wss)', () => {
    const policy = csp(portalHeaders(['https://*.supabase.co', 'http://127.0.0.1:54321']));
    expect(policy).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:54321 ws://127.0.0.1:54321");
  });

  it('serves the passkey association files as JSON', () => {
    const out = toCloudflareHeaders(siteHeaders);
    expect(out).toContain('/.well-known/apple-app-site-association\n  Content-Type: application/json');
    expect(out).toContain('/.well-known/assetlinks.json\n  Content-Type: application/json');
  });
});
