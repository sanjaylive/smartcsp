import { formatDateTime, formatINR, type Entitlements } from '@csp2all/shared';

export { formatINR };

/** Admin console shows instants in IST (platform default) with an explicit zone hint. */
export function dt(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return String(v);
  return formatDateTime(d);
}

export function relative(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const fmt = (n: number, u: string) => `${n} ${u}${n === 1 ? '' : 's'}`;
  let s: string;
  if (abs < 60_000) s = 'just now';
  else if (abs < 3_600_000) s = fmt(Math.round(abs / 60_000), 'minute');
  else if (abs < 86_400_000) s = fmt(Math.round(abs / 3_600_000), 'hour');
  else s = fmt(Math.round(abs / 86_400_000), 'day');
  if (s === 'just now') return s;
  return diff >= 0 ? `${s} ago` : `in ${s}`;
}

export function pct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function humanize(code: string | null | undefined): string {
  if (!code) return '—';
  return code
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '—';
}

export const ENTITLEMENT_LABELS: Record<keyof Entitlements, string> = {
  staffLimit: 'Staff accounts',
  monthlyRecordLimit: 'Records per month',
  enabledServiceLimit: 'Enabled services',
  customServiceLimit: 'Custom services',
  storageLimitMb: 'Storage (MB)',
  exportsEnabled: 'Exports',
  advancedReports: 'Advanced reports',
  customBranding: 'Custom branding',
  connectorEligible: 'Connector eligible',
};

export const BOOLEAN_ENTITLEMENTS: (keyof Entitlements)[] = [
  'exportsEnabled',
  'advancedReports',
  'customBranding',
  'connectorEligible',
];
/** Numeric limits where `null` means unlimited. */
export const NULLABLE_ENTITLEMENTS: (keyof Entitlements)[] = [
  'staffLimit',
  'monthlyRecordLimit',
  'enabledServiceLimit',
];

export function entitlementValue(key: keyof Entitlements, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (v === null || v === undefined) return NULLABLE_ENTITLEMENTS.includes(key) ? 'Unlimited' : '—';
  return String(v);
}

/** Stable random idempotency key. */
export function newKey(prefix = 'adm'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
