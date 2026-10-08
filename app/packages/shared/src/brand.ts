// Fide visual identity — single source of truth for the portal, the app and the
// generated icons (app/scripts/gen-brand-assets.mjs). Values come from the
// design references "Logo, icono de app, color y tipografía" and "Set de iconos".

export const brandColors = {
  /** Pizarra: dark surfaces, primary text */
  slate: '#0F1A17',
  /** Bosque: primary accent, buttons, links */
  forest: '#0B6E4F',
  forestHover: '#08513A',
  /** Menta: accent on dark surfaces, the logo on the app icon */
  mint: '#7FD8B2',
  /** Niebla: page background */
  mist: '#F4F5F2',
  /** Ámbar: warnings */
  amber: '#B4531A',
  surface: '#FFFFFF',
  border: '#E2E7E4',
  borderStrong: '#D5DBD8',
  textSecondary: '#46524D',
  textTertiary: '#2E3935',
  textMuted: '#9FB0A9',
  mintSoft: '#DCEFE6',
  mintPale: '#CFE8DC',
  danger: '#9B2C1F',
} as const;

export const brandFonts = {
  /** Brand and titles (500, 700) */
  display: "'Space Grotesk', sans-serif",
  /** Interface and text (400, 500, 600) */
  text: "'IBM Plex Sans', sans-serif",
  /** Hours, fingerprints, logs (400, 500) */
  mono: "'IBM Plex Mono', monospace",
} as const;

/**
 * The symbol: a key whose bit draws an F and whose bow is a clock face.
 * viewBox 0 0 64 64, stroke only, round caps and joins.
 */
export const logo = {
  viewBox: '0 0 64 64',
  strokeWidth: 6,
  bow: { cx: 26, cy: 45, r: 11 },
  bit: 'M26 34V9h22v6M26 20h14',
  /** Clock hands, drawn thinner; dropped at favicon sizes. */
  hands: 'M26 45v-5.5M26 45l4 2.2',
  handsStrokeWidth: 3.5,
  /** Stroke widths for small renders without hands: 48, 32 and 16 px. */
  faviconStroke: { 48: 7, 32: 8, 16: 10 },
} as const;

/** 24 × 24 grid, 2 px safe zone, stroke 1.75, round caps/joins, no fill. */
export const icons = {
  inicio: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  fichar: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2.5M9 2h6',
  solicitudes: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4M9 15l2 2 4-4',
  docs: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  asistente: 'M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8zM19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z',
  misdatos: 'M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 16.5c1-1.6 2.4-2.4 4-2.4s3 .8 4 2.4',
  geo: 'M12 15s4.5-3.9 4.5-7.5a4.5 4.5 0 0 0-9 0C7.5 11.1 12 15 12 15zM12 7.5h.01M5 15.5C3.8 16.2 3 17 3 18c0 1.7 4 3 9 3s9-1.3 9-3c0-1-.8-1.8-2-2.5',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18v2h2M18 18h2v2',
  nfc: 'M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM10 9.5a3.5 3.5 0 0 1 0 5M13 8a6 6 0 0 1 0 8',
  offline: 'M2 8.8a15 15 0 0 1 4.2-2.6M10 5.1a15 15 0 0 1 12 3.7M5 12.6a10 10 0 0 1 5.2-2.5M15.8 11a10 10 0 0 1 3.2 1.6M8.5 16.1a5 5 0 0 1 7 0M12 20h.01M3 3l18 18',
  entrada: 'M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4',
  salida: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  vacaciones: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  permiso: 'M6 2h12M6 22h12M7 2v3a5 5 0 0 0 10 0V2M7 22v-3a5 5 0 0 1 10 0v3M12 10v4',
  extra: 'M11 20.9A9 9 0 1 1 20.9 11M12 7v5l3 2M18 15v6M15 18h6',
  olvidado: 'M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5M12 7v5l3 2',
  gasto: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h3',
  turnos: 'M4 8h13l-3-3M20 16H7l3 3',
  cifrado: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  passkey: 'M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2M9 9v1M15 9v1M9.5 15.5c1.4 1 3.6 1 5 0M12 9v4h-1',
  huella: 'M9 21a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM9 13V3h9v2.5M9 7.5h6',
  registro: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  exportar: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  supresion: 'M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 1h6a2 2 0 0 0 2-1l1-13M9 7V4h6v3',
} as const;

export type IconName = keyof typeof icons;

/** Stroke width per rendered size: thicker at small sizes so lines don't vanish. */
export function iconStroke(px: number): number {
  if (px <= 16) return 2;
  if (px <= 20) return 1.9;
  return 1.75;
}

/** Standalone SVG markup of the symbol (for asset generation). */
export function logoSvg(opts: { color: string; size: number; hands?: boolean; strokeWidth?: number; background?: string; radius?: number; scale?: number }): string {
  const { color, size, hands = true, background, radius = 0, scale = 1 } = opts;
  const sw = opts.strokeWidth ?? logo.strokeWidth;
  // Draw the 64-unit symbol centred, scaled to `scale` of the canvas.
  const inner = 64 / scale;
  const offset = (inner - 64) / 2;
  const bg = background
    ? `<rect x="${-offset}" y="${-offset}" width="${inner}" height="${inner}" rx="${(radius / size) * inner}" fill="${background}"/>`
    : '';
  const handsPath = hands ? `<path d="${logo.hands}" stroke-width="${logo.handsStrokeWidth}"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-offset} ${-offset} ${inner} ${inner}">` +
    bg +
    `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">` +
    `<circle cx="${logo.bow.cx}" cy="${logo.bow.cy}" r="${logo.bow.r}"/><path d="${logo.bit}"/>${handsPath}</g></svg>`
  );
}
