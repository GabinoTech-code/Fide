// Security headers for the static sites (Cloudflare Pages `_headers` format).
// Vite uses the same values for `vite preview`, so CSP problems show up locally
// before they reach production.

export interface HeaderRule {
  path: string;
  headers: Record<string, string>;
}

const COMMON: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function csp(directives: Record<string, string>): string {
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ');
}

/** Public website: no scripts beyond our own bundle, no third parties at all. */
export const siteHeaders: HeaderRule[] = [
  {
    path: '/*',
    headers: {
      ...COMMON,
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Content-Security-Policy': csp({
        'default-src': "'self'",
        'script-src': "'self'",
        'style-src': "'self'",
        'img-src': "'self' data:",
        'font-src': "'self'",
        'connect-src': "'self'",
        'object-src': "'none'",
        'base-uri': "'self'",
        'form-action': "'self'",
        'frame-ancestors': "'none'",
      }),
    },
  },
  // Invitation links carry a one-time token in the path: never indexed, cached
  // or sent on as a referrer (Cloudflare joins repeated headers; the last
  // Referrer-Policy value wins).
  {
    path: '/invite/*',
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' },
  },
  // Passkeys / universal links: JSON, no redirects (the apex is the RP ID).
  { path: '/.well-known/apple-app-site-association', headers: { 'Content-Type': 'application/json' } },
  { path: '/.well-known/assetlinks.json', headers: { 'Content-Type': 'application/json' } },
];

/** HR portal and kiosk page. */
export function portalHeaders(supabaseOrigins: string[]): HeaderRule[] {
  const connect = ["'self'", ...supabaseOrigins.flatMap((o) => [o, o.replace(/^http/, 'ws')])].join(' ');
  return [
    {
      path: '/*',
      headers: {
        ...COMMON,
        // The kiosk page needs no camera: phones scan its QR.
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        'Content-Security-Policy': csp({
          'default-src': "'self'",
          // libsodium (payslip encryption in the browser) runs WebAssembly.
          'script-src': "'self' 'wasm-unsafe-eval'",
          'style-src': "'self'",
          // QR codes are rendered as data: URLs / canvas.
          'img-src': "'self' data: blob:",
          'font-src': "'self'",
          'connect-src': connect,
          // pdf.js parses bulk payroll PDFs in a worker.
          'worker-src': "'self' blob:",
          'object-src': "'none'",
          'base-uri': "'self'",
          'form-action': "'self'",
          'frame-ancestors': "'none'",
        }),
      },
    },
  ];
}

export function toCloudflareHeaders(rules: HeaderRule[]): string {
  return (
    rules
      .map((r) => [r.path, ...Object.entries(r.headers).map(([k, v]) => `  ${k}: ${v}`)].join('\n'))
      .join('\n\n') + '\n'
  );
}

/** Headers for `vite preview` (the '/*' rule; path-specific rules are hosting concerns). */
export function previewHeaders(rules: HeaderRule[]): Record<string, string> {
  return rules.find((r) => r.path === '/*')?.headers ?? {};
}

/**
 * `vite dev` injects the React Refresh preamble and CSS as inline <script> and
 * <style>, which the production policy rightly forbids. The dev server keeps
 * every other directive (connect-src, worker-src, framing…) so those violations
 * still surface while coding; `vite preview` serves the exact production policy.
 */
export function devServerHeaders(rules: HeaderRule[]): Record<string, string> {
  const headers = { ...previewHeaders(rules) };
  const policy = headers['Content-Security-Policy'];
  if (policy) {
    headers['Content-Security-Policy'] = policy
      .split('; ')
      .map((d) => (/^(script-src|style-src) /.test(d) ? `${d} 'unsafe-inline'` : d))
      .join('; ');
  }
  return headers;
}

// ---------------------------------------------------------------------------
// nginx (self-hosted): the same rules Cloudflare's `_headers` and Vite use
// ---------------------------------------------------------------------------

export interface NginxSite {
  host: string;
  root: string;
  rules: HeaderRule[];
  /** Hosts that permanently redirect to `host` (e.g. www). */
  aliases?: string[];
  /** A rule path ("/invite/*") whose requests are served by one file ("/invite.html"). */
  rewrites?: Array<{ path: string; file: string }>;
  /** Single-page app: unknown paths serve /index.html. */
  spa?: boolean;
}

export interface NginxOptions {
  /** certbot certificate name (one certificate covers every host). */
  certName: string;
  /** Webroot for certbot's HTTP-01 challenges. */
  acmeRoot: string;
}

/** Vite's content-hashed bundles: safe to cache for a year. */
const IMMUTABLE_ASSETS = { path: '/assets/*', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } };

const nginxQuote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const locationFor = (path: string) => (path.endsWith('/*') ? `^~ ${path.slice(0, -1)}` : `= ${path}`);

const GENERATED = [
  '# Generated by app/scripts/gen-nginx.mjs from app/packages/shared/src/security-headers.ts:',
  '# the same headers as Cloudflare Pages and `vite preview`. Do not edit by hand (a test checks it).',
  '# IPv4 only and no http2, like the other sites on this server: see deploy/README.md.',
];

function acmeServer(hosts: string[], options: NginxOptions): string[] {
  return [
    'server {',
    '    listen 80;',
    `    server_name ${hosts.join(' ')};`,
    '    location ^~ /.well-known/acme-challenge/ {',
    `        root ${options.acmeRoot};`,
    '    }',
    '    location / {',
    '        return 301 https://$host$request_uri;',
    '    }',
    '}',
  ];
}

/** Port 80 only: lets certbot obtain the first certificate before the HTTPS servers exist. */
export function toNginxBootstrap(sites: NginxSite[], options: NginxOptions): string {
  const hosts = sites.flatMap((s) => [s.host, ...(s.aliases ?? [])]);
  return [...GENERATED, '', ...acmeServer(hosts, options)].join('\n') + '\n';
}

export function toNginxConf(sites: NginxSite[], options: NginxOptions): string {
  const hosts = sites.flatMap((s) => [s.host, ...(s.aliases ?? [])]);
  const tls = [
    `    ssl_certificate /etc/letsencrypt/live/${options.certName}/fullchain.pem;`,
    `    ssl_certificate_key /etc/letsencrypt/live/${options.certName}/privkey.pem;`,
  ];
  const out = [...GENERATED, '', ...acmeServer(hosts, options)];

  for (const site of sites) {
    for (const alias of site.aliases ?? []) {
      out.push('', 'server {', '    listen 443 ssl;', `    server_name ${alias};`, ...tls, `    return 301 https://${site.host}$request_uri;`, '}');
    }
    const base = site.rules.find((r) => r.path === '/*')?.headers ?? {};
    const specific = [IMMUTABLE_ASSETS, ...site.rules.filter((r) => r.path !== '/*')];
    for (const r of site.rewrites ?? []) if (!specific.some((s) => s.path === r.path)) specific.push({ path: r.path, headers: {} });

    // add_header in a location drops every add_header inherited from the server
    // block, so each location repeats the site-wide headers plus its own.
    const location = (match: string, headers: Record<string, string>, body: string[]) => {
      const { 'Content-Type': contentType, ...rest } = { ...base, ...headers };
      out.push(`    location ${match} {`);
      if (contentType) out.push('        types { }', `        default_type ${contentType};`);
      for (const [k, v] of Object.entries(rest)) out.push(`        add_header ${k} ${nginxQuote(v)} always;`);
      out.push(...body.map((l) => `        ${l}`), '    }');
    };

    out.push('', 'server {', '    listen 443 ssl;', `    server_name ${site.host};`, ...tls, `    root ${site.root};`, '    server_tokens off;');
    out.push('    gzip on;', '    gzip_types text/css application/javascript application/json image/svg+xml;');
    for (const rule of specific) {
      const rewrite = site.rewrites?.find((r) => r.path === rule.path);
      const body = rewrite ? [`try_files ${rewrite.file} =404;`] : [];
      // nginx's mime.types predates .mjs: the pdf.js worker would go out as
      // application/octet-stream and, with nosniff, the browser refuses to run it.
      // The nested location keeps the parent's add_header (it defines none).
      if (rule === IMMUTABLE_ASSETS) body.push('location ~ \\.mjs$ {', '    types { }', '    default_type text/javascript;', '}');
      location(locationFor(rule.path), rule.headers, body);
    }
    // Cloudflare-only files in dist/ are not served.
    out.push('    location ~ ^/_(headers|redirects)$ {', '        return 404;', '    }');
    location('/', {}, [site.spa ? 'try_files $uri /index.html;' : 'try_files $uri $uri/ =404;']);
    out.push('}');
  }
  return out.join('\n') + '\n';
}

const FIDE_NGINX: NginxOptions = { certName: 'fide-work.it', acmeRoot: '/var/www/letsencrypt' };

/**
 * fide-work.it (site and invitation pages) and app.fide-work.it (portal and
 * kiosk). fide-work.online points at the same server and redirects here, so it
 * never falls through to another site's default server and certificate.
 */
export function fideNginxSites(options: { supabaseOrigins?: string[]; webRoot?: string } = {}): NginxSite[] {
  const webRoot = options.webRoot ?? '/opt/fide-web/www';
  return [
    {
      host: 'fide-work.it',
      aliases: ['www.fide-work.it', 'fide-work.online', 'www.fide-work.online'],
      root: `${webRoot}/site`,
      rules: siteHeaders,
      rewrites: [{ path: '/invite/*', file: '/invite.html' }],
    },
    {
      host: 'app.fide-work.it',
      aliases: ['app.fide-work.online'],
      root: `${webRoot}/portal`,
      rules: portalHeaders(options.supabaseOrigins ?? ['https://*.supabase.co']),
      spa: true,
    },
  ];
}

export const fideNginxConf = () => toNginxConf(fideNginxSites(), FIDE_NGINX);
export const fideNginxBootstrap = () => toNginxBootstrap(fideNginxSites(), FIDE_NGINX);
