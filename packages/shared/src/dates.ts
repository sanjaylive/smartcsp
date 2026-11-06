/**
 * Business dates are calendar dates in the tenant's timezone (default Asia/Kolkata),
 * serialized as ISO `YYYY-MM-DD`. Instants are serialized as ISO-8601 UTC strings.
 */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDate(instant: Date, timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Usage period key (calendar month in tenant timezone), e.g. "2026-11". */
export function monthPeriodKey(instant: Date, timeZone = DEFAULT_TIMEZONE): string {
  return localDate(instant, timeZone).slice(0, 7);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Unambiguous display: "06 Nov 2026". */
export function formatDate(isoDate: string): string {
  if (!isIsoDate(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "06 Nov 2026, 14:05" in tenant timezone. */
export function formatDateTime(instant: string | Date, timeZone = DEFAULT_TIMEZONE): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${formatDate(localDate(d, timeZone))}, ${time}`;
}
