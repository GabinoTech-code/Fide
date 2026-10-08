// Italian codice fiscale (persone fisiche): 16 characters with a check character.
// Omocodia: digit positions may be substituted with L M N P Q R S T U V (0-9).
// The same algorithm is implemented in SQL as public.is_valid_codice_fiscale().

export const CODICE_FISCALE_PATTERN =
  /^[A-Z]{6}[0-9LMNP-V]{2}[ABCDEHLMPRST][0-9LMNP-V]{2}[A-Z][0-9LMNP-V]{3}[A-Z]$/;

// Unanchored, global variant for scanning extracted PDF text.
export const CODICE_FISCALE_SCAN_PATTERN =
  /[A-Z]{6}[0-9LMNP-V]{2}[ABCDEHLMPRST][0-9LMNP-V]{2}[A-Z][0-9LMNP-V]{3}[A-Z]/g;

const ODD_VALUES: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

function evenValue(ch: string): number {
  const code = ch.charCodeAt(0);
  return code <= 57 ? code - 48 : code - 65; // '0'-'9' → 0-9, 'A'-'Z' → 0-25
}

/** Check character for the first 15 characters of a codice fiscale. */
export function codiceFiscaleCheckChar(first15: string): string {
  const s = first15.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = s[i];
    // Positions are 1-based in the specification: index 0 is "odd".
    sum += i % 2 === 0 ? ODD_VALUES[ch] : evenValue(ch);
  }
  return String.fromCharCode(65 + (sum % 26));
}

export function normalizeCodiceFiscale(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function isValidCodiceFiscale(value: string): boolean {
  const cf = normalizeCodiceFiscale(value);
  if (!CODICE_FISCALE_PATTERN.test(cf)) return false;
  return codiceFiscaleCheckChar(cf.slice(0, 15)) === cf[15];
}
