// File names for documents saved outside the app.

/** «Cedolino settembre 2026.pdf»: no characters a file system could refuse. */
export function pdfName(title: string): string {
  const base = title.replace(/[^\p{L}\p{N} ._()-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${base || 'documento'}.pdf`;
}
