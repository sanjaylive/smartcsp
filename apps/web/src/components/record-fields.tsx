'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { FieldDef } from '@csp2all/shared';
import { cn } from '@/lib/cn';
import { OperatorTiles } from './operator-badge';
import { useI18n } from '@/lib/i18n';
import { Button, Checkbox, Field, Input, Select } from './ui';

export type DetailValue = string | boolean | Array<{ label: string; done: boolean }>;
export type DetailValues = Record<string, DetailValue>;

export function initialDetailValues(
  fields: FieldDef[],
  existing?: Record<string, unknown>,
): DetailValues {
  const out: DetailValues = {};
  for (const f of fields) {
    const v = existing?.[f.key];
    if (f.type === 'boolean') out[f.key] = v === true;
    else if (f.type === 'checklist')
      out[f.key] = Array.isArray(v) ? (v as Array<{ label: string; done: boolean }>) : [];
    else out[f.key] = v === null || v === undefined ? '' : String(v);
  }
  return out;
}

/** Converts form values to the typed `details` object the API validates (empties omitted). */
export function toDetails(fields: FieldDef[], values: DetailValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (f.type === 'boolean') {
      out[f.key] = v === true;
      continue;
    }
    if (f.type === 'checklist') {
      const list = (v as Array<{ label: string; done: boolean }>).filter((i) => i.label.trim());
      if (list.length) out[f.key] = list.map((i) => ({ label: i.label.trim(), done: i.done }));
      continue;
    }
    const s = typeof v === 'string' ? v.trim() : '';
    if (s === '') {
      if (f.required) out[f.key] = f.type === 'number' ? undefined : '';
      continue;
    }
    if (f.type === 'number') out[f.key] = Number(s);
    else if (f.type === 'ifsc') out[f.key] = s.toUpperCase();
    else out[f.key] = s;
  }
  return out;
}

export function DetailField({
  field,
  value,
  onChange,
  error,
  labelOverride,
  options: optionsOverride,
}: {
  /** Options to offer instead of `field.options` (e.g. operators filtered by recharge type). */
  options?: FieldDef['options'];
  field: FieldDef;
  value: DetailValue;
  onChange: (v: DetailValue) => void;
  error?: string | null;
  labelOverride?: string;
}) {
  const { tk, t } = useI18n();
  const label = labelOverride ?? tk(field.labelKey);
  const options = optionsOverride ?? field.options ?? [];
  const help = field.helpKey ? tk(field.helpKey) : undefined;
  if (field.type === 'boolean') {
    return (
      <div className="flex flex-col gap-1">
        <Checkbox label={label} checked={value === true} onChange={(v) => onChange(v)} />
        {error ? (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  if (field.type === 'checklist') {
    const list = value as Array<{ label: string; done: boolean }>;
    return (
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-semibold">{label}</legend>
        {list.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-[var(--brand)]"
              checked={item.done}
              aria-label={t('checklist.done', { item: item.label || String(i + 1) })}
              onChange={(e) =>
                onChange(list.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))
              }
            />
            <Input
              aria-label={t('checklist.item', { n: i + 1 })}
              value={item.label}
              maxLength={60}
              onChange={(e) =>
                onChange(list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
              }
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('checklist.remove', { n: i + 1 })}
              onClick={() => onChange(list.filter((_, j) => j !== i))}
            >
              <Trash2 aria-hidden className="size-4" />
            </Button>
          </div>
        ))}
        {list.length < 20 ? (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            icon={<Plus aria-hidden className="size-4" />}
            onClick={() => onChange([...list, { label: '', done: false }])}
          >
            {t('checklist.add')}
          </Button>
        ) : null}
        {error ? (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {error}
          </p>
        ) : null}
      </fieldset>
    );
  }
  return (
    <Field
      label={label}
      help={help}
      error={error}
      required={field.required}
      optionalLabel={t('common.optional')}
      className={field.key === 'operator' ? 'col-span-full' : undefined}
    >
      {({ id, describedBy, invalid }) => {
        const common = {
          id,
          'aria-describedby': describedBy,
          'aria-invalid': invalid || undefined,
          name: `details.${field.key}`,
        };
        const str = typeof value === 'string' ? value : '';
        switch (field.type) {
          case 'select':
            if (field.key === 'operator')
              return (
                <OperatorTiles
                  id={id}
                  label={label}
                  invalid={invalid}
                  describedBy={describedBy}
                  value={str}
                  options={options.map((o) => ({ value: o.value, label: tk(o.labelKey) }))}
                  onChange={(v) => onChange(v)}
                />
              );
            if (field.key === 'rechargeType')
              return (
                <div
                  id={id}
                  role="radiogroup"
                  tabIndex={-1}
                  aria-label={label}
                  aria-invalid={invalid || undefined}
                  aria-describedby={describedBy}
                  className="flex flex-wrap gap-2"
                >
                  {options.map((o) => {
                    const on = o.value === str;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(o.value)}
                        className={cn(
                          'inline-flex min-h-10 items-center rounded-[10px] border px-3.5 text-sm font-semibold transition focus-visible:ring-3 focus-visible:ring-focus/30 focus-visible:outline-none',
                          on
                            ? 'border-brand bg-brand-bg text-brand-strong dark:text-fg'
                            : invalid
                              ? 'border-danger/60 bg-surface hover:border-brand/40'
                              : 'border-border bg-surface text-fg hover:border-brand/40',
                        )}
                      >
                        {tk(o.labelKey)}
                      </button>
                    );
                  })}
                </div>
              );
            return (
              <Select {...common} value={str} onChange={(e) => onChange(e.target.value)}>
                <option value="">{t('form.choose')}</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {tk(o.labelKey)}
                  </option>
                ))}
              </Select>
            );
          case 'date':
            return (
              <Input
                {...common}
                type="date"
                required={!!field.required}
                value={str}
                onChange={(e) => onChange(e.target.value)}
              />
            );
          case 'number':
            return (
              <Input
                {...common}
                inputMode="decimal"
                value={str}
                onChange={(e) => onChange(e.target.value)}
              />
            );
          case 'phone':
            return (
              <Input
                {...common}
                inputMode="numeric"
                maxLength={10}
                autoComplete="off"
                value={str}
                onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
              />
            );
          case 'account':
            return (
              <Input
                {...common}
                inputMode="numeric"
                maxLength={18}
                autoComplete="off"
                className="money max-w-64"
                value={str}
                onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
              />
            );
          case 'ifsc':
            return (
              <Input
                {...common}
                maxLength={11}
                autoComplete="off"
                className="uppercase"
                value={str}
                onChange={(e) => onChange(e.target.value.toUpperCase())}
              />
            );
          default:
            return (
              <Input
                {...common}
                maxLength={field.maxLength ?? 120}
                autoComplete="off"
                value={str}
                onChange={(e) => onChange(e.target.value)}
              />
            );
        }
      }}
    </Field>
  );
}
