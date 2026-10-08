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
// Caddy (self-hosted): the same rules Cloudflare's `_headers` and Vite use
// ---------------------------------------------------------------------------

export interface CaddySite {
  host: string;
  root: string;
  rules: HeaderRule[];
  /** Hosts that permanently redirect to `host` (e.g. www). */
  aliases?: string[];
  /** Path regexps rewritten to a file, e.g. /invite/<token> → /invite.html. */
  rewrites?: Array<{ pattern: string; to: string }>;
  /** Single-page app: unknown paths serve /index.html. */
  spa?: boolean;
}

const caddyQuote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function toCaddyfile(sites: CaddySite[]): string {
  const out = [
    '# Generated by app/scripts/gen-caddyfile.mjs from app/packages/shared/src/security-headers.ts:',
    '# the same headers as Cloudflare Pages and `vite preview`. Do not edit by hand (a test checks it).',
    '{',
    '\temail {$ACME_EMAIL}',
    '}',
  ];
  for (const site of sites) {
    for (const alias of site.aliases ?? []) out.push('', `${alias} {`, `\tredir https://${site.host}{uri} permanent`, '}');
    out.push('', `${site.host} {`, `\troot * ${site.root}`, '\tencode zstd gzip');
    site.rules.forEach((rule, i) => {
      if (rule.path === '/*') {
        out.push('\theader {', '\t\t-Server');
        for (const [k, v] of Object.entries(rule.headers)) out.push(`\t\t${k} ${caddyQuote(v)}`);
      } else {
        // Deferred (">"): applied last, so it overrides both the site-wide value and file_server's Content-Type.
        out.push(`\t@h${i} path ${rule.path}`, `\theader @h${i} {`);
        for (const [k, v] of Object.entries(rule.headers)) out.push(`\t\t>${k} ${caddyQuote(v)}`);
      }
      out.push('\t}');
    });
    (site.rewrites ?? []).forEach((r, i) => out.push(`\t@rw${i} path_regexp ${r.pattern}`, `\trewrite @rw${i} ${r.to}`));
    if (site.spa) out.push('\ttry_files {path} /index.html');
    // Cloudflare-only files in dist/ are not served.
    out.push('\tfile_server {', '\t\thide _headers _redirects', '\t}', '}');
  }
  return out.join('\n') + '\n';
}

/** fide-work.it (site and invitation pages) and app.fide-work.it (portal and kiosk). */
export function fideCaddyfile(options: { supabaseOrigins?: string[] } = {}): string {
  return toCaddyfile([
    {
      host: 'fide-work.it',
      aliases: ['www.fide-work.it'],
      root: '/srv/site',
      rules: siteHeaders,
      rewrites: [{ pattern: '^/invite/[^/]+/?$', to: '/invite.html' }],
    },
    {
      host: 'app.fide-work.it',
      root: '/srv/portal',
      rules: portalHeaders(options.supabaseOrigins ?? ['https://*.supabase.co']),
      spa: true,
    },
  ]);
}
