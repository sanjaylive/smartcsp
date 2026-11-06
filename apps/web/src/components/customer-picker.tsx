'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus, UserRound, X } from 'lucide-react';
import { customerCreateSchema } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions, useFormErrors, zodToFieldErrors } from '@/lib/hooks';
import type { Customer, Page } from '@/lib/types';
import { Alert, Button, Field, Input } from './ui';
import { cn } from '@/lib/cn';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export type CustomerChoice =
  { kind: 'customer'; id: string; name: string } | { kind: 'walkin'; name: string };

/** Search existing customers, create one inline (with duplicate hints) or record a walk-in name. */
export function CustomerPicker({
  value,
  onChange,
  error,
}: {
  value: CustomerChoice;
  onChange: (c: CustomerChoice) => void;
  error?: string | null;
}) {
  const { t } = useI18n();
  const { can } = usePermissions();
  const listId = useId();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const errs = useFormErrors();
  const debounced = useDebounced(term);
  const canSearch = can('customers.view');

  const results = useQuery({
    queryKey: ['customers', 'search', debounced],
    queryFn: () => api<Page<Customer>>('/v1/customers', { query: { q: debounced, pageSize: 8 } }),
    enabled: canSearch && open && debounced.trim().length >= 1,
  });
  const dupName = useDebounced(newName, 400);
  const dupPhone = useDebounced(newPhone, 400);
  const dups = useQuery({
    queryKey: ['customers', 'dups', dupName, dupPhone],
    queryFn: () =>
      api<{ items: Customer[] }>('/v1/customers/duplicates', {
        query: { name: dupName, phone: dupPhone },
      }),
    enabled: creating && (dupName.trim().length >= 3 || /^\d{10}$/.test(dupPhone)),
  });

  const create = async () => {
    errs.clear();
    const body = { name: newName, phone: newPhone || null, followUpPreference: 'NONE' as const };
    const r = customerCreateSchema.safeParse(body);
    if (!r.success) {
      errs.setFields(zodToFieldErrors(r.error));
      return;
    }
    setBusy(true);
    try {
      const c = await api<Customer>('/v1/customers', { method: 'POST', body });
      onChange({ kind: 'customer', id: c.id, name: c.name });
      setCreating(false);
      setNewName('');
      setNewPhone('');
    } catch (e) {
      errs.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  if (value.kind === 'customer') {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold">{t('record.customer')}</p>
        <div className="flex min-h-11 items-center gap-3 rounded-[10px] border border-brand bg-brand-bg px-3 py-2">
          <UserRound aria-hidden className="size-5 text-brand-strong dark:text-fg" />
          <span className="flex-1 font-semibold" data-testid="selected-customer">
            {value.name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={<X aria-hidden className="size-4" />}
            onClick={() => onChange({ kind: 'walkin', name: '' })}
          >
            {t('customerPicker.change')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canSearch ? (
        <div className="relative">
          <Field
            label={t('customerPicker.search')}
            help={t('customerPicker.searchHelp')}
            error={error}
          >
            {({ id, describedBy }) => (
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
                />
                <Input
                  id={id}
                  role="combobox"
                  aria-expanded={open && !!results.data}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-describedby={describedBy}
                  className="pl-9"
                  value={term}
                  autoComplete="off"
                  onFocus={() => setOpen(true)}
                  onChange={(e) => {
                    setTerm(e.target.value);
                    setOpen(true);
                  }}
                />
              </div>
            )}
          </Field>
          {open && debounced.trim() && results.data ? (
            <ul
              id={listId}
              role="listbox"
              aria-label={t('customerPicker.results')}
              className="absolute inset-x-0 top-[76px] z-20 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl"
            >
              {results.data.items.length === 0 ? (
                <li className="px-3 py-2 text-sm text-fg-muted">{t('customerPicker.noMatch')}</li>
              ) : (
                results.data.items.map((c) => (
                  <li key={c.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-surface-muted"
                      onClick={() => {
                        onChange({ kind: 'customer', id: c.id, name: c.name });
                        setOpen(false);
                        setTerm('');
                      }}
                    >
                      <UserRound aria-hidden className="size-4 text-fg-muted" />
                      <span className="flex-1 font-medium">{c.name}</span>
                      <span className="money text-sm text-fg-muted">{c.phone ?? ''}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      ) : null}

      {can('customers.manage') && !creating ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          icon={<UserPlus aria-hidden className="size-4" />}
          onClick={() => setCreating(true)}
        >
          {t('customer.new')}
        </Button>
      ) : null}

      {creating ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('customer.name')} required error={errs.get('name')}>
              {(p) => (
                <Input
                  id={p.id}
                  aria-describedby={p.describedBy}
                  aria-invalid={p.invalid || undefined}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              )}
            </Field>
            <Field
              label={t('customer.phone')}
              optionalLabel={t('common.optional')}
              error={errs.get('phone')}
            >
              {(p) => (
                <Input
                  id={p.id}
                  aria-describedby={p.describedBy}
                  aria-invalid={p.invalid || undefined}
                  inputMode="numeric"
                  maxLength={10}
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>
          </div>
          {dups.data?.items.length ? (
            <Alert tone="warning" title={t('customer.duplicates')}>
              <ul className="mt-1 flex flex-col gap-1">
                {dups.data.items.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="money text-sm text-fg-muted">{c.phone ?? ''}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onChange({ kind: 'customer', id: c.id, name: c.name });
                        setCreating(false);
                      }}
                    >
                      {t('customerPicker.useThis')}
                    </Button>
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {errs.formMessage && !Object.keys(errs.fields).length ? (
            <Alert tone="danger">{errs.formMessage}</Alert>
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" onClick={create} loading={busy}>
              {t('customerPicker.createSelect')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      <Field
        label={t('common.walkIn')}
        optionalLabel={t('common.optional')}
        help={t('customerPicker.walkInHelp')}
      >
        {(p) => (
          <Input
            id={p.id}
            aria-describedby={p.describedBy}
            className={cn()}
            value={value.name}
            maxLength={80}
            onChange={(e) => onChange({ kind: 'walkin', name: e.target.value })}
          />
        )}
      </Field>
    </div>
  );
}
