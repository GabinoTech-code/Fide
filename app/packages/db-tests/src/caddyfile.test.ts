// The self-hosted server's Caddyfile (deploy/caddy/Caddyfile) must be exactly
// what the shared security rules generate: same CSP and headers as Cloudflare
// and `vite preview`. Lives here, not in @fide/shared, because it reads files
// (shared stays free of Node types: it ships to the phones and browsers).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { fideCaddyfile, portalHeaders, previewHeaders, siteHeaders } from '@fide/shared';

const committed = readFileSync(fileURLToPath(new URL('../../../../deploy/caddy/Caddyfile', import.meta.url)), 'utf8');
const csp = (rules: typeof siteHeaders) => previewHeaders(rules)['Content-Security-Policy'];

it('is generated from the shared rules (run `npm run gen:caddy` after changing them)', () => {
  expect(committed.replace(/\r\n/g, '\n')).toBe(fideCaddyfile());
});

it('sends the production policy and routes on the server', () => {
  expect(committed).not.toContain('unsafe-inline');
  expect(committed).toContain(`Content-Security-Policy "${csp(siteHeaders)}"`);
  expect(committed).toContain(`Content-Security-Policy "${csp(portalHeaders(['https://*.supabase.co']))}"`);
  expect(committed).toMatch(/@rw0 path_regexp \^\/invite\/\[\^\/\]\+\/\?\$\s+rewrite @rw0 \/invite\.html/);
  expect(committed).toMatch(/path \/\.well-known\/assetlinks\.json\s+header @h\d \{\s+>Content-Type "application\/json"/);
  expect(committed).toContain('try_files {path} /index.html');
  expect(committed).toContain('redir https://fide-work.it{uri} permanent');
  expect(committed).toContain('hide _headers _redirects');
});
