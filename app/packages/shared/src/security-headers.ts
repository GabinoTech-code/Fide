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
