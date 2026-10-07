import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { brandColors, iconStroke, icons, logo, type IconName } from '../../packages/shared/src/brand.ts';

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

export default defineConfig({
  plugins: [brandSvgs()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        privacy: resolve(import.meta.dirname, 'privacy.html'),
      },
    },
  },
});
