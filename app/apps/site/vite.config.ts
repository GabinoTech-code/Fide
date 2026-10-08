import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { brandColors, iconStroke, icons, logo, type IconName } from '../../packages/shared/src/brand.ts';
import { devServerHeaders, previewHeaders, siteHeaders, toCloudflareHeaders } from '../../packages/shared/src/security-headers.ts';

// Inlines brand SVGs at build time so the pages stay static HTML:
//   <svg data-icon="fichar" data-size="28"></svg>
//   <svg data-logo data-size="40" data-color="mint|forest|slate|mist" data-hands="false"></svg>
function brandSvgs(): Plugin {
  const attr = (tag: string, name: string) => tag.match(new RegExp(`data-${name}="([^"]*)"`))?.[1];
  return {
    name: 'fide-brand-svgs',
    transformIndexHtml(html) {
      return html
        .replace(/<svg data-icon="([a-z]+)"([^>]*)><\/svg>/g, (_m, name: string, rest: string) => {
          if (!(name in icons)) throw new Error(`unknown icon "${name}" (known: ${Object.keys(icons).join(",")})`);
          const size = Number(attr(rest, 'size') ?? 24);
          return (
            `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
            `stroke-width="${iconStroke(size)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
            `<path d="${icons[name as IconName]}"/></svg>`
          );
        })
        .replace(/<svg data-logo([^>]*)><\/svg>/g, (_m, rest: string) => {
          const size = Number(attr(rest, 'size') ?? 32);
          const colorName = (attr(rest, 'color') ?? 'mint') as keyof typeof brandColors;
          const hands = attr(rest, 'hands') !== 'false';
          return (
            `<svg width="${size}" height="${size}" viewBox="${logo.viewBox}" fill="none" stroke="${brandColors[colorName]}" ` +
            `stroke-width="${logo.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
            `<circle cx="${logo.bow.cx}" cy="${logo.bow.cy}" r="${logo.bow.r}"/><path d="${logo.bit}"/>` +
            (hands ? `<path d="${logo.hands}" stroke-width="${logo.handsStrokeWidth}"/>` : '') +
            `</svg>`
          );
        });
    },
  };
}

// Cloudflare Pages `_headers`, generated so preview and production share one CSP.
function securityHeaders(): Plugin {
  return {
    name: 'fide-security-headers',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: toCloudflareHeaders(siteHeaders) });
    },
  };
}

// /invite/<token> is served by invite.html: a Cloudflare Pages `_redirects`
// rewrite in production and the same rewrite for `vite dev` / `vite preview`.
function inviteRoute(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    if (req.url && /^\/invite\/[^/?#]+\/?(\?.*)?$/.test(req.url)) req.url = '/invite.html';
    next();
  };
  return {
    name: 'fide-invite-route',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_redirects', source: '/invite/*  /invite  200\n' });
    },
  };
}

export default defineConfig({
  plugins: [brandSvgs(), securityHeaders(), inviteRoute()],
  server: { headers: devServerHeaders(siteHeaders) },
  preview: { headers: previewHeaders(siteHeaders) },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        privacy: resolve(import.meta.dirname, 'privacy.html'),
        invite: resolve(import.meta.dirname, 'invite.html'),
      },
    },
  },
});
