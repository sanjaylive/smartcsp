'use client';

import { parseRupeesToPaise } from '@csp2all/shared';
import { Input } from './ui';

/** Rupee text input. Keeps the raw text; callers convert with `parseRupeesToPaise`. */
export function MoneyInput({
  id,
  value,
  onChange,
  describedBy,
  invalid,
  disabled,
  placeholder = '0.00',
  name,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-semibold text-fg-muted"
      >
        ₹
      </span>
      <Input
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        className="money pl-7"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        disabled={disabled}
      />
    </div>
  );
}

/** "" → 0; invalid → null. */
export function rupeesOrZero(v: string): number | null {
  if (v.trim() === '') return 0;
  return parseRupeesToPaise(v);
}

export function paiseToInput(paise: number): string {
  if (!paise) return '';
  const whole = Math.trunc(paise / 100);
  const frac = paise % 100;
  return frac ? `${whole}.${String(frac).padStart(2, '0')}` : String(whole);
}
