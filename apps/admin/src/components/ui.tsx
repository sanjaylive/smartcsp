'use client';

import Link from 'next/link';
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { errorMessage, isApiError } from '@/lib/api';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ----------------------------------------------------------------------------- buttons

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-strong border border-transparent',
  secondary: 'bg-surface text-fg border border-line hover:bg-muted',
  danger: 'bg-danger text-white dark:text-[#0e1020] hover:opacity-90 border border-transparent',
  warning: 'bg-warning text-white dark:text-[#0e1020] hover:opacity-90 border border-transparent',
  ghost: 'bg-transparent text-fg hover:bg-muted border border-transparent',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading,
    icon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  children,
  variant = 'secondary',
  size = 'md',
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

// ----------------------------------------------------------------------------- form controls

const control =
  'w-full rounded-md border border-line bg-surface px-2.5 text-sm text-fg placeholder:text-fg-muted/80 focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40 disabled:opacity-60 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(control, 'h-9', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(control, 'min-h-[76px] py-2', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cx(control, 'h-9 pr-8', className)} {...rest}>
        {children}
      </select>
    );
  },
);

/**
 * Labelled form field. The child receives id / aria-describedby / aria-invalid via render prop
 * so labels and errors are always programmatically associated.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    required?: boolean;
  }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-fg">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  description,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  description?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--brand)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="text-sm">
        {label}
        {description && <span className="block text-xs text-fg-muted">{description}</span>}
      </label>
    </div>
  );
}

/** Accessible on/off switch (button role="switch"). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
        checked ? 'border-brand bg-brand' : 'border-line bg-muted',
      )}
    >
      <span
        className={cx(
          'inline-block size-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

// ----------------------------------------------------------------------------- layout

export function Card({
  title,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cx('rounded-lg border border-line bg-surface shadow-card', className)}
      aria-labelledby={title && id ? `${id}-title` : undefined}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          {title && (
            <h2 id={id ? `${id}-title` : undefined} className="text-sm font-semibold">
              {title}
            </h2>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName ?? 'p-4'}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 max-w-3xl text-[13px] text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
  href,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  href?: string;
  hint?: string;
}) {
  const inner = (
    <>
      <div className="text-xs font-medium text-fg-muted">{label}</div>
      <div className={cx('tabular mt-1 text-2xl font-semibold', tone && TONE_TEXT[tone])}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-fg-muted">{hint}</div>}
    </>
  );
  const cls = 'block rounded-lg border border-line bg-surface p-3 shadow-card';
  return href ? (
    <Link href={href} className={cx(cls, 'hover:border-brand')}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function DescList({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-fg-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ----------------------------------------------------------------------------- badges & callouts

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-muted text-fg-muted border-line',
  brand: 'bg-brand-bg text-brand-strong border-transparent dark:text-brand-strong',
  success: 'bg-success-bg text-success border-transparent',
  warning: 'bg-warning-bg text-warning border-transparent',
  danger: 'bg-danger-bg text-danger border-transparent',
  info: 'bg-info-bg text-info border-transparent',
};
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-fg',
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap',
        TONE_BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'success',
  APPROVED: 'success',
  SENT: 'success',
  SUCCESSFUL: 'success',
  PAID: 'success',
  POSTED: 'success',
  CONFIRMED: 'success',
  PROCESSED: 'success',
  TRIALING: 'info',
  SUBMITTED: 'info',
  QUEUED: 'info',
  PENDING: 'info',
  INFO: 'info',
  INVITED: 'info',
  SIMULATOR: 'info',
  GRACE: 'warning',
  WARNING: 'warning',
  PARTIAL: 'warning',
  UNPAID: 'warning',
  UNKNOWN: 'warning',
  PENDING_DELETION: 'danger',
  SUSPENDED: 'danger',
  DISABLED: 'danger',
  REJECTED: 'danger',
  FAILED: 'danger',
  EXPIRED: 'danger',
  CRITICAL: 'danger',
  CANCELLED: 'neutral',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-fg-muted">—</span>;
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{status.replaceAll('_', ' ')}</Badge>;
}

export function Callout({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cx(
        'flex gap-2.5 rounded-md border px-3 py-2.5 text-sm',
        TONE_BADGE[tone],
        'normal-case',
      )}
    >
      <span className="mt-0.5 shrink-0">
        {icon ?? <AlertTriangle className="size-4" aria-hidden />}
      </span>
      <div className={cx('min-w-0 text-fg', className)}>
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="text-[13px] text-fg">{children}</div>}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- tables

export function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]" aria-label={label}>
        {children}
      </table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cx(
        'border-b border-line bg-muted/60 px-3 py-2 text-xs font-semibold text-fg-muted whitespace-nowrap',
        className,
      )}
    >
      {children}
    </th>
  );
}
export function Td({
  children,
  className,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cx('border-b border-line px-3 py-2 align-top', className)}>
      {children}
    </td>
  );
}

export function Pagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <nav
      className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-fg-muted"
      aria-label="Pagination"
    >
      <span>
        {total} total · page {page} of {pages}
      </span>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
          icon={<ChevronLeft className="size-4" aria-hidden />}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
          icon={<ChevronRight className="size-4" aria-hidden />}
        />
      </div>
    </nav>
  );
}

// ----------------------------------------------------------------------------- states

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-10 text-sm text-fg-muted"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Empty({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      <span className="text-fg-muted">{icon ?? <Inbox className="size-6" aria-hidden />}</span>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-md text-[13px] text-fg-muted">{children}</div>}
    </div>
  );
}

export function PermissionDenied({ what }: { what?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line py-12 text-center"
      role="alert"
    >
      <Lock className="size-6 text-fg-muted" aria-hidden />
      <p className="text-sm font-semibold">Permission denied</p>
      <p className="max-w-md text-[13px] text-fg-muted">
        Your admin role does not include access to {what ?? 'this area'}. Ask a super admin if you
        need it.
      </p>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (isApiError(error) && error.code === 'PERMISSION_DENIED') return <PermissionDenied />;
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-danger/40 bg-danger-bg/40 py-10 text-center"
      role="alert"
    >
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <p className="text-sm font-semibold">Could not load this data</p>
      <p className="max-w-lg text-[13px] text-fg-muted">
        {errorMessage(error)}
        {isApiError(error) && error.requestId && (
          <span className="block text-xs">Request ID: {error.requestId}</span>
        )}
      </p>
      {onRetry && (
        <Button size="sm" onClick={onRetry} icon={<RefreshCw className="size-3.5" aria-hidden />}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Render loading / error / data for a TanStack query. */
export function QueryState<T>({
  query,
  children,
  loadingLabel,
}: {
  query: { data: T | undefined; error: unknown; isPending: boolean; refetch: () => unknown };
  children: (data: T) => ReactNode;
  loadingLabel?: string;
}) {
  if (query.isPending) return <Loading label={loadingLabel} />;
  if (query.error || query.data === undefined)
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <>{children(query.data)}</>;
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Callout tone="danger" title="Could not complete the action">
      {errorMessage(error)}
      {isApiError(error) && error.requestId && (
        <span className="block text-xs text-fg-muted">Request ID: {error.requestId}</span>
      )}
    </Callout>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">{children}</code>;
}
