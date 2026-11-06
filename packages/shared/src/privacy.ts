/**
 * Guards against accidentally storing sensitive identifiers in free text.
 * CSP2All does not collect Aadhaar numbers, card numbers (PAN/primary account numbers),
 * CVV, PINs or biometric data. These checks reject text that *looks* like such data.
 */

function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const VD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Verhoeff checksum (used by Aadhaar numbers). */
export function verhoeffValid(digits: string): boolean {
  let c = 0;
  const rev = digits.split('').reverse();
  for (let i = 0; i < rev.length; i++) c = VD[c][VP[i % 8][Number(rev[i])]];
  return c === 0;
}

/** 12-digit groups (Aadhaar-like), optionally separated by spaces or hyphens. */
const AADHAAR_LIKE = /(?<!\d)[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g;
/** 13–19 digit runs (card-like), optionally separated. */
const CARD_LIKE = /(?<!\d)(?:\d[\s-]?){13,19}(?!\d)/g;

export type SensitiveKind = 'AADHAAR_NUMBER' | 'CARD_NUMBER';

/**
 * Apply to free text (notes, names, custom text fields) — NOT to reference fields, since
 * bank RRN/UTR references are also 12 digits.
 */
export function detectSensitiveNumber(text: string | null | undefined): SensitiveKind | null {
  if (!text) return null;
  for (const m of text.match(AADHAAR_LIKE) ?? []) {
    if (verhoeffValid(m.replace(/\D/g, ''))) return 'AADHAAR_NUMBER';
  }
  for (const m of text.match(CARD_LIKE) ?? []) {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return 'CARD_NUMBER';
  }
  return null;
}

/** "9876543210" -> "******3210" */
export function maskIdentifier(value: string | null | undefined, visible = 4): string | null {
  if (!value) return value ?? null;
  if (value.length <= visible) return '*'.repeat(value.length);
  return '*'.repeat(Math.min(6, value.length - visible)) + value.slice(-visible);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
