'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

/**
 * Six single-digit boxes acting as one control. Pasting (or autofill of) the full code into any
 * box fills all of them; Backspace moves back. Each box has its own accessible name.
 */
export function OtpInput({
  value,
  onChange,
  invalid,
  describedBy,
  disabled,
  labelId,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  labelId: string;
}) {
  const { t } = useI18n();
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const setFrom = (start: number, text: string) => {
    const clean = text.replace(/\D/g, '');
    if (!clean) return;
    const arr = [...digits];
    for (let i = 0; i < clean.length && start + i < 6; i++) arr[start + i] = clean[i];
    const next = arr.join('').slice(0, 6);
    onChange(next);
    const focusAt = Math.min(5, start + clean.length);
    refs.current[focusAt]?.focus();
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const arr = [...digits];
      if (arr[i]) arr[i] = '';
      else if (i > 0) {
        arr[i - 1] = '';
        refs.current[i - 1]?.focus();
      }
      onChange(arr.join('').replace(/\s/g, ''));
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setFrom(i, e.clipboardData.getData('text'));
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex gap-2 sm:gap-3"
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={t('otp.digit', { n: i + 1 })}
          aria-invalid={invalid || undefined}
          className={cn(
            'money size-12 rounded-xl border border-border bg-surface text-center text-2xl font-bold focus:border-brand focus:outline-none focus:ring-3 focus:ring-focus/30 sm:size-14',
            invalid && 'border-danger',
          )}
          onChange={(e) => {
            const v = e.target.value;
            if (v.length > 1) setFrom(i, v);
            else if (/^\d$/.test(v)) setFrom(i, v);
            else if (v === '') {
              const arr = [...digits];
              arr[i] = '';
              onChange(arr.join(''));
            }
          }}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
