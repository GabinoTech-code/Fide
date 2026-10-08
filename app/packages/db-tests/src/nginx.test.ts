// The self-hosted server's nginx config (deploy/nginx) must be exactly what the
// shared security rules generate: same CSP and headers as Cloudflare and
// `vite preview`. Lives here, not in @fide/shared, because it reads files
// (shared stays free of Node types: it ships to the phones and browsers).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fideNginxBootstrap, fideNginxConf, portalHeaders, previewHeaders, siteHeaders } from '@fide/shared';

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../../../deploy/nginx/${name}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const conf = read('fide.conf');
const csp = (rules: typeof siteHeaders) => previewHeaders(rules)['Content-Security-Policy'];

/** The body of `location <match> { … }` inside the server block for `host`. */
function locationBody(host: string, match: string): string {
  const server = conf.split('\nserver {').find((s) => s.includes(`server_name ${host};`) && s.includes('root '));
  const start = server?.indexOf(`    location ${match} {`) ?? -1;
  if (!server || start < 0) throw new Error(`no location ${match} for ${host}`);
  return server.slice(start, server.indexOf('\n    }', start));
}

describe('deploy/nginx', () => {
  it('is generated from the shared rules (run `npm run gen:nginx` after changing them)', () => {
    expect(conf).toBe(fideNginxConf());
    expect(read('fide-bootstrap.conf')).toBe(fideNginxBootstrap());
  });

  it('repeats the site-wide headers in every location (nginx does not inherit add_header)', () => {
    const siteCsp = `add_header Content-Security-Policy "${csp(siteHeaders)}" always;`;
    for (const match of ['/', '^~ /invite/', '^~ /assets/', '= /.well-known/assetlinks.json', '= /.well-known/apple-app-site-association']) {
      const body = locationBody('fide-work.it', match);
      expect(body, match).toContain(siteCsp);
      expect(body, match).toContain('add_header Strict-Transport-Security');
    }
    expect(locationBody('app.fide-work.it', '/')).toContain(`add_header Content-Security-Policy "${csp(portalHeaders(['https://*.supabase.co']))}" always;`);
  });

  it('serves invitations, association files and the portal as the hosting rules say', () => {
    const invite = locationBody('fide-work.it', '^~ /invite/');
    expect(invite).toContain('try_files /invite.html =404;');
    expect(invite).toContain('add_header Referrer-Policy "no-referrer" always;');
    expect(invite).not.toContain('strict-origin-when-cross-origin');
    expect(invite).toContain('add_header X-Robots-Tag "noindex, nofollow" always;');
    const aasa = locationBody('fide-work.it', '= /.well-known/apple-app-site-association');
    expect(aasa).toContain('default_type application/json;');
    expect(aasa).not.toContain('add_header Content-Type');
    expect(locationBody('app.fide-work.it', '/')).toContain('try_files $uri /index.html;');
    expect(locationBody('fide-work.it', '/')).toContain('try_files $uri $uri/ =404;');
    expect(conf).toContain('return 301 https://fide-work.it$request_uri;');
    // The second domain points at the same server: it must redirect, never fall
    // through to another site's default server and certificate.
    for (const [alias, target] of [
      ['www.fide-work.it', 'fide-work.it'],
      ['fide-work.online', 'fide-work.it'],
      ['www.fide-work.online', 'fide-work.it'],
      ['app.fide-work.online', 'app.fide-work.it'],
    ]) {
      const block = conf.split('\nserver {').find((s) => s.includes(`server_name ${alias};`));
      expect(block, alias).toContain(`return 301 https://${target}$request_uri;`);
    }
    expect(read('fide-bootstrap.conf')).toContain(
      'server_name fide-work.it www.fide-work.it fide-work.online www.fide-work.online app.fide-work.it app.fide-work.online;',
    );
    expect(conf).not.toContain('unsafe-inline');
  });

  it('does not change how the server listens for its other sites', () => {
    // An IPv6 or http2 listen here would alter the sockets the AegisLink sites share.
    const directives = conf.replace(/#.*$/gm, '');
    expect(directives).not.toMatch(/listen \[::\]/);
    expect(directives).not.toMatch(/\bhttp2\b/);
    expect(directives).not.toMatch(/default_server/);
  });
});
