'use client';

import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import Link from 'next/link';
import { AlertTriangle, Info, Loader2, CircleAlert, CheckCircle2 } from 'lucide-react';
import { formatINR } from '@csp2all/shared';
import { cn } from '@/lib/cn';

// ----------------------------------------------------------------------------- Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-strong shadow-sm',
  secondary: 'bg-brand-bg text-brand-strong hover:brightness-95 dark:text-fg',
  outline: 'border border-border bg-surface text-fg hover:bg-surface-muted',
  ghost: 'text-fg hover:bg-surface-muted',
  danger: 'bg-danger text-white hover:brightness-110 dark:text-bg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
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
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm'
          ? 'min-h-9 px-3 text-sm'
          : size === 'lg'
            ? 'min-h-12 px-6 text-base'
            : 'px-4 text-[15px]',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = 'primary',
  className,
  children,
  icon,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-[15px] font-semibold transition',
        variants[variant],
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

// ----------------------------------------------------------------------------- Form fields

const control =
  'w-full min-h-11 rounded-[10px] border border-border bg-surface px-3 text-[15px] text-fg placeholder:text-fg-muted/80 focus:border-brand focus:outline-none focus:ring-3 focus:ring-focus/30 disabled:bg-surface-muted disabled:opacity-70 aria-[invalid=true]:border-danger';

export interface FieldProps {
  label: ReactNode;
  help?: ReactNode;
  error?: string | string[] | null;
  required?: boolean;
  optionalLabel?: string;
  badge?: ReactNode;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({
  label,
  help,
  error,
  required,
  optionalLabel,
  badge,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const err = Array.isArray(error) ? error[0] : error;
  const helpId = help ? `${id}-help` : undefined;
  const errId = err ? `${id}-err` : undefined;
  const describedBy = [helpId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg"
      >
        <span>
          {label}
          {required ? (
            <span aria-hidden className="ml-0.5 text-danger">
              *
            </span>
          ) : null}
        </span>
        {!required && optionalLabel ? (
          <span className="text-xs font-normal text-fg-muted">({optionalLabel})</span>
        ) : null}
        {badge}
      </label>
      {children({ id, describedBy, invalid: !!err })}
      {help ? (
        <p id={helpId} className="text-[13px] text-fg-muted">
          {help}
        </p>
      ) : null}
      {err ? (
        <p
          id={errId}
          role="alert"
          className="flex items-center gap-1 text-[13px] font-medium text-danger"
        >
          <CircleAlert aria-hidden className="size-3.5" />
          {err}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(control, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-24 py-2', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(control, 'pr-8', className)} {...rest}>
        {children}
      </select>
    );
  },
);

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  description,
  id,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  description?: ReactNode;
  id?: string;
}) {
  const autoId = useId();
  const cid = id ?? autoId;
  return (
    <div className="flex items-start gap-3">
      <input
        id={cid}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={cid} className="text-[15px] leading-snug">
        {label}
        {description ? (
          <span className="block text-[13px] text-fg-muted">{description}</span>
        ) : null}
      </label>
    </div>
  );
}

// ----------------------------------------------------------------------------- Layout

export function Card({
  className,
  children,
  as: As = 'section',
  ...rest
}: {
  className?: string;
  children: ReactNode;
  as?: 'section' | 'div' | 'article';
  'aria-labelledby'?: string;
  id?: string;
}) {
  return (
    <As className={cn('card', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-[15px] text-fg-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

// ----------------------------------------------------------------------------- Feedback

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-fg',
  brand: 'bg-brand-bg text-brand-strong dark:text-fg',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
};

export function Badge({
  tone = 'neutral',
  children,
  icon,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon =
    tone === 'danger'
      ? CircleAlert
      : tone === 'warning'
        ? AlertTriangle
        : tone === 'success'
          ? CheckCircle2
          : Info;
  const bg = {
    info: 'bg-info-bg border-info/30',
    warning: 'bg-warning-bg border-warning/30',
    danger: 'bg-danger-bg border-danger/30',
    success: 'bg-success-bg border-success/30',
  }[tone];
  const fg = {
    info: 'text-info',
    warning: 'text-warning',
    danger: 'text-danger',
    success: 'text-success',
  }[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'note'}
      className={cn('flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3', bg, className)}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', fg)} />
      <div className="min-w-0 flex-1 text-[15px] text-fg">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? 'mt-0.5' : '', 'text-fg')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-fg-muted">
      <Loader2 aria-hidden className="size-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-surface-muted', className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-bg text-brand-strong dark:text-fg">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold">{title}</p>
      {description ? <p className="max-w-md text-sm text-fg-muted">{description}</p> : null}
      {action}
    </div>
  );
}

// ----------------------------------------------------------------------------- Data display

export function Money({
  paise,
  className,
  signed,
}: {
  paise: number;
  className?: string;
  signed?: boolean;
}) {
  return <span className={cn('money', className)}>{formatMoney(paise, signed)}</span>;
}

export function formatMoney(paise: number, signed = false): string {
  return formatINR(paise, { signed });
}

export function DescList({
  items,
}: {
  items: Array<{ label: ReactNode; value: ReactNode; key?: string } | null | false>;
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.filter(Boolean).map((it, i) => {
        const item = it as { label: ReactNode; value: ReactNode; key?: string };
        return (
          <div key={item.key ?? i} className="min-w-0">
            <dt className="text-[13px] font-medium text-fg-muted">{item.label}</dt>
            <dd className="mt-0.5 break-words text-[15px] font-medium">{item.value ?? '—'}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function Stat({
  label,
  value,
  help,
  tone,
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  help?: ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info';
  icon?: ReactNode;
}) {
  const tc = tone
    ? {
        brand: 'text-brand-strong',
        success: 'text-success',
        warning: 'text-warning',
        danger: 'text-danger',
        info: 'text-info',
      }[tone]
    : '';
  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
        {icon}
        {label}
      </div>
      <div className={cn('money text-2xl font-extrabold tracking-tight', tc)}>{value}</div>
      {help ? <p className="text-[13px] leading-snug text-fg-muted">{help}</p> : null}
    </div>
  );
}

export const tableCls = {
  wrap: 'overflow-x-auto',
  table: 'w-full min-w-[640px] border-collapse text-left text-[15px]',
  th: 'border-b border-border bg-surface-muted/60 px-4 py-2.5 text-[13px] font-semibold text-fg-muted whitespace-nowrap',
  td: 'border-b border-border px-4 py-3 align-top',
  num: 'text-right money',
};

export function Meter({
  label,
  used,
  limit,
  unit,
  unlimitedLabel,
}: {
  label: ReactNode;
  used: number;
  limit: number | null;
  unit?: string;
  unlimitedLabel: string;
}) {
  const pct =
    limit === null ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const tone =
    limit !== null && used >= limit ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-brand';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="money text-fg-muted">
          {used}
          {unit ? ` ${unit}` : ''} /{' '}
          {limit === null ? unlimitedLabel : `${limit}${unit ? ` ${unit}` : ''}`}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={limit ?? used}
        aria-valuenow={used}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div
          className={cn('h-full rounded-full', tone)}
          style={{ width: `${limit === null ? 4 : pct}%` }}
        />
      </div>
    </div>
  );
}
