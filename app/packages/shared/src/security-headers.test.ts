import { describe, expect, it } from 'vitest';
import { devServerHeaders, portalHeaders, previewHeaders, siteHeaders, toCloudflareHeaders } from './security-headers';

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

  it('relaxes only inline script/style for the Vite dev server', () => {
    for (const rules of [siteHeaders, portalHeaders(['https://*.supabase.co'])]) {
      const prod = csp(rules).split('; ');
      const dev = devServerHeaders(rules)['Content-Security-Policy'].split('; ');
      expect(dev).toHaveLength(prod.length);
      dev.forEach((directive, i) => {
        if (/^(script-src|style-src) /.test(directive)) expect(directive).toBe(`${prod[i]} 'unsafe-inline'`);
        else expect(directive).toBe(prod[i]);
      });
      // The production rules themselves are untouched.
      expect(csp(rules)).not.toContain('unsafe-inline');
    }
  });

  it('serves the passkey association files as JSON', () => {
    const out = toCloudflareHeaders(siteHeaders);
    expect(out).toContain('/.well-known/apple-app-site-association\n  Content-Type: application/json');
    expect(out).toContain('/.well-known/assetlinks.json\n  Content-Type: application/json');
  });
});
