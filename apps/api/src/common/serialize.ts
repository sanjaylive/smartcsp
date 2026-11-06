/** Helpers to serialize DB values consistently: money as safe-integer paise, dates as ISO. */

export function n(v: bigint | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const num = typeof v === 'bigint' ? Number(v) : v;
  if (!Number.isSafeInteger(num)) throw new RangeError('Money value exceeds safe integer range');
  return num;
}

/** DATE column -> YYYY-MM-DD (Prisma returns DATE as UTC midnight). */
export function d(v: Date | null | undefined): string | null {
  return v ? v.toISOString().slice(0, 10) : null;
}

/** YYYY-MM-DD -> Date for DATE columns. */
export function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export const big = (v: number | bigint) => (typeof v === 'bigint' ? v : BigInt(v));

/** Deep-convert remaining bigint values (fallback in the response interceptor). */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return n(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

export function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
