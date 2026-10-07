#!/usr/bin/env node
// Renders every app/portal icon from the logo in @fide/shared/brand.
//   node scripts/gen-brand-assets.mjs
// Variants follow the identity reference: main icon (mint key on slate),
// Android adaptive (mist key on forest), monochrome (Android 13+ themed icons),
// splash and favicons without clock hands.
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandColors as c, logo, logoSvg } from '../packages/shared/src/brand.ts';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = (f) => path.join(app, 'apps/mobile/assets', f);
const portal = (f) => path.join(app, 'apps/web-portal/public', f);
const site = (f) => path.join(app, 'apps/site/public', f);

function png(file, svg) {
  writeFileSync(file, new Resvg(svg).render().asPng());
  console.log('wrote', path.relative(app, file));
}

// Android adaptive icons: 108 dp canvas, the launcher shows the central 72 dp.
// The reference draws the key at 80/140 of the visible circle.
const adaptive = (80 / 140) * (72 / 108);

png(mobile('icon.png'), logoSvg({ size: 1024, color: c.mint, background: c.slate, scale: 92 / 140 }));
png(mobile('android-icon-foreground.png'), logoSvg({ size: 1024, color: c.mist, scale: adaptive }));
png(
  mobile('android-icon-background.png'),
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${c.forest}"/></svg>`,
);
png(mobile('android-icon-monochrome.png'), logoSvg({ size: 1024, color: '#FFFFFF', scale: adaptive }));
png(mobile('splash-icon.png'), logoSvg({ size: 1024, color: c.mint, scale: 0.8 }));
png(mobile('favicon.png'), logoSvg({ size: 48, color: c.mint, background: c.slate, radius: 11, scale: 34 / 48, hands: false, strokeWidth: logo.faviconStroke[48] }));

png(portal('icon.png'), logoSvg({ size: 48, color: c.mint, background: c.slate, radius: 11, scale: 34 / 48, hands: false, strokeWidth: logo.faviconStroke[48] }));
png(portal('icon-192.png'), logoSvg({ size: 192, color: c.mint, background: c.slate, radius: 44, scale: 92 / 140 }));
png(portal('apple-touch-icon.png'), logoSvg({ size: 180, color: c.mint, background: c.slate, scale: 92 / 140 }));

for (const out of [site]) {
  png(out('icon.png'), logoSvg({ size: 48, color: c.mint, background: c.slate, radius: 11, scale: 34 / 48, hands: false, strokeWidth: logo.faviconStroke[48] }));
  png(out('icon-192.png'), logoSvg({ size: 192, color: c.mint, background: c.slate, radius: 44, scale: 92 / 140 }));
  png(out('apple-touch-icon.png'), logoSvg({ size: 180, color: c.mint, background: c.slate, scale: 92 / 140 }));
}
