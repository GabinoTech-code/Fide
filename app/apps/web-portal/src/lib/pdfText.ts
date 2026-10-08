// Page texts of a bulk payroll PDF, read with pdf.js in a worker (CSP
// worker-src 'self'). No rendering and no font loading: text only.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Messages are error codes mapped in lib/errors.ts. */
export class PdfError extends Error {
  constructor(code: 'pdf_password' | 'pdf_invalid') {
    super(code);
    this.name = 'PdfError';
  }
}

export async function extractPageTexts(bytes: Uint8Array): Promise<string[]> {
  // pdf.js transfers the buffer to its worker: hand it a copy.
  const task = getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (err) {
    throw new PdfError(err instanceof Error && err.name === 'PasswordException' ? 'pdf_password' : 'pdf_invalid');
  }
  try {
    const texts: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      page.cleanup();
    }
    return texts;
  } finally {
    await task.destroy();
  }
}

/**
 * pdf-lib cannot split encrypted PDFs (even "owner password only" ones that
 * pdf.js opens): the pages would be copied as unreadable streams.
 */
export async function loadSplittable(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes);
  } catch (err) {
    // pdf-lib's EncryptedPDFError sets neither `name` nor a working prototype chain.
    throw new PdfError(err instanceof Error && /is encrypted/.test(err.message) ? 'pdf_password' : 'pdf_invalid');
  }
}
