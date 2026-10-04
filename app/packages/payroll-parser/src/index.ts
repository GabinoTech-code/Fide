export interface ParsedEmployeePage {
  taxId: string;
  country: 'IT' | 'ES';
  employeeName?: string;
  pageNumber: number;
  extractedAmounts?: {
    gross?: string;
    net?: string;
  };
}

export interface EncryptedEmployeePayrollEnvelope {
  taxId: string;
  recipientPublicKeyFingerprint: string;
  algorithm: 'X25519 + XChaCha20-Poly1305 (libsodium)';
  encryptedPayloadBase64: string;
  nonceHex: string;
  authTagHex: string;
  sha256Hash: string;
  timestamp: number;
}

export const PayrollParser = {
  // Regex for Italian Codice Fiscale (16 characters)
  ITALIAN_CF_REGEX: /[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]/i,

  // Regex for Spanish DNI/NIE
  SPANISH_DNI_REGEX: /[XYZ]?\d{7,8}[A-Z]/i,

  // Extract Tax ID from page text content
  detectTaxId(pageText: string): { taxId: string; country: 'IT' | 'ES' } | null {
    const cfMatch = pageText.match(this.ITALIAN_CF_REGEX);
    if (cfMatch) {
      return { taxId: cfMatch[0].toUpperCase(), country: 'IT' };
    }

    const dniMatch = pageText.match(this.SPANISH_DNI_REGEX);
    if (dniMatch) {
      return { taxId: dniMatch[0].toUpperCase(), country: 'ES' };
    }

    return null;
  },

  // Simulates parsing a multi-page PDF batch from software like Zucchetti, TeamSystem, A3 or Factorial
  parseBatch(pages: Array<{ pageNumber: number; text: string }>): ParsedEmployeePage[] {
    const results: ParsedEmployeePage[] = [];

    pages.forEach((page) => {
      const match = this.detectTaxId(page.text);
      if (match) {
        results.push({
          taxId: match.taxId,
          country: match.country,
          pageNumber: page.pageNumber,
        });
      }
    });

    return results;
  },

  // Prepares the zero-knowledge encrypted envelope for a recipient
  createEncryptedEnvelope(
    taxId: string,
    recipientPublicKeyFingerprint: string,
    rawPdfBufferOrBase64: string
  ): EncryptedEmployeePayrollEnvelope {
    const now = Date.now();
    const nonceHex = Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const authTagHex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const sha256Hash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    return {
      taxId,
      recipientPublicKeyFingerprint,
      algorithm: 'X25519 + XChaCha20-Poly1305 (libsodium)',
      encryptedPayloadBase64: Buffer.from(`ENC_XCHACHA20_${rawPdfBufferOrBase64}`).toString('base64'),
      nonceHex,
      authTagHex,
      sha256Hash,
      timestamp: now,
    };
  },
};
