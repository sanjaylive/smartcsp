/**
 * Money is always handled as integer paise (1 INR = 100 paise).
 * Floating point is never used for arithmetic. Values crossing JSON are safe integers.
 */

export const MAX_PAISE = 1_000_000_000_000_00; // ₹1 lakh crore — far above any CSP value, well inside 2^53.

export function isValidPaise(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAX_PAISE;
}

export function assertPaise(v: unknown, field = 'amount'): number {
  if (!isValidPaise(v))
    throw new RangeError(`${field} must be a non-negative integer number of paise`);
  return v;
}

/**
 * Parses user input like "1,23,456.5", "₹ 500", "500.05" into paise using string arithmetic.
 * Returns null for invalid input or more than 2 decimal places.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  if (!/^\d{1,13}(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const paise = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** Indian digit grouping (12,34,567) without relying on Intl availability. */
function groupIndian(whole: string): string {
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

export interface FormatOptions {
  symbol?: boolean;
  /** Always show 2 decimals (default true). */
  decimals?: boolean;
  signed?: boolean;
}

/** formatINR(12345678) => "₹1,23,456.78" */
export function formatINR(paise: number | bigint, opts: FormatOptions = {}): string {
  const { symbol = true, decimals = true, signed = false } = opts;
  const big = typeof paise === 'bigint' ? paise : BigInt(paise);
  const neg = big < 0n;
  const abs = neg ? -big : big;
  const whole = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, '0');
  const body = groupIndian(whole) + (decimals || frac !== '00' ? '.' + frac : '');
  const sign = neg ? '−' : signed && big > 0n ? '+' : '';
  return `${sign}${symbol ? '₹' : ''}${body}`;
}

/** Plain decimal string for exports, e.g. 12345 => "123.45" (no grouping, ASCII minus). */
export function paiseToDecimalString(paise: number | bigint): string {
  const big = typeof paise === 'bigint' ? paise : BigInt(paise);
  const neg = big < 0n;
  const abs = neg ? -big : big;
  return `${neg ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

export function sumPaise(values: Array<number | bigint>): bigint {
  return values.reduce<bigint>((a, v) => a + (typeof v === 'bigint' ? v : BigInt(v)), 0n);
}
