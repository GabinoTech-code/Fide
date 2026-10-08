# ZConnect vs Fide · tesis para inversores — design reference

> **Visión de producto escrita el 4 de octubre de 2026, no estado actual.** Varias respuestas de esta tesis no existen
> todavía (push cifrado, NFC, API y conectores de nómina, SSO, BYOK) y el «asistente IA» choca con el principio
> «sin IA» del proyecto. Estado real y plan: `docs/audit/COMPARATIVA-COMPETENCIA-2026-10-08.md`.

This is a design mockup created in a visual design tool, exported as a
standalone page. Treat it as a REFERENCE MOCKUP, not production code:
the markup and inline styles carry the design's precise values — colors,
font sizes, spacing, radii, shadows, layout — which an implementation
should replicate faithfully in its own components and styling system
rather than copy wholesale.

## Contents

- `Comparativa.dc.html` — the artboard (a Design Component: an `<x-dc>`
  template + a small logic class). The values to replicate live in its
  inline `style="…"` attributes and the `<helmet><style>` block.
- `support.js`, `vendor/react*.js` — the runtime that renders the
  component in a browser; not part of the design.

## Viewing

Serve the folder (e.g. `python3 -m http.server`) and open `Comparativa.dc.html`;
some browsers block the scripts over file://.
