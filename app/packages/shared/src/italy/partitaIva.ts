// Italian partita IVA: 11 digits, the last one is a Luhn-style check digit.
// The same algorithm is implemented in SQL as public.is_valid_partita_iva().

export function partitaIvaCheckDigit(first10: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const d = first10.charCodeAt(i) - 48;
    if (i % 2 === 0) {
      sum += d;
    } else {
      const doubled = d * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidPartitaIva(value: string): boolean {
  const piva = value.replace(/\s+/g, '');
  if (!/^\d{11}$/.test(piva)) return false;
  if (piva === '00000000000') return false;
  return partitaIvaCheckDigit(piva.slice(0, 10)) === piva.charCodeAt(10) - 48;
}
