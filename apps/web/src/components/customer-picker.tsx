'use client';

import { useId, useState } from 'react';
import { useDebounced } from '@/lib/use-debounced';
import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/hooks';
import type { Customer, Page } from '@/lib/types';
import { Button, Field, Input } from './ui';
import { CustomerDialog } from './customer-form';
import { cn } from '@/lib/cn';

export { useDebounced };

export type CustomerChoice =
  { kind: 'customer'; id: string; name: string } | { kind: 'walkin'; name: string };

/** Search existing customers, add one in a side drawer (with duplicate hints) or type a walk-in name. */
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
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(term, 200);
  const canSearch = can('customers.view');
  const canAdd = can('customers.manage');

  const results = useQuery({
    queryKey: ['customers', 'search', debounced],
    queryFn: () => api<Page<Customer>>('/v1/customers', { query: { q: debounced, pageSize: 8 } }),
    enabled: canSearch && open && debounced.trim().length >= 1,
  });
  const items = results.data?.items ?? [];
  const showList = open && !!debounced.trim() && !!results.data;

  const pick = (c: Pick<Customer, 'id' | 'name'>) => {
    onChange({ kind: 'customer', id: c.id, name: c.name });
    setOpen(false);
    setTerm('');
    setCreating(false);
  };

  const drawer = creating ? (
    <CustomerDialog
      open
      initialName={/\d/.test(term) ? '' : term.trim()}
      onClose={() => setCreating(false)}
      onSaved={pick}
      onUseExisting={pick}
    />
  ) : null;

  if (value.kind === 'customer') {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold">{t('record.customer')}</p>
        <div className="flex min-h-10 items-center gap-3 rounded-[10px] border border-brand/50 bg-brand-bg px-3 py-1.5">
          <span className="grid size-7 place-items-center rounded-full bg-brand text-xs font-bold text-on-brand">
            {value.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="flex-1 truncate font-semibold" data-testid="selected-customer">
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
      {canSearch || canAdd ? (
        <Field
          label={t('customerPicker.search')}
          help={t('customerPicker.searchHelp')}
          error={error}
        >
          {({ id, describedBy }) => (
            <div className="flex items-stretch gap-2">
              {canSearch ? (
                <div className="relative min-w-0 flex-1">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
                  />
                  <Input
                    id={id}
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                      showList && items[active] ? `${listId}-${active}` : undefined
                    }
                    aria-describedby={describedBy}
                    className="pl-9"
                    placeholder="Name or mobile number"
                    value={term}
                    autoComplete="off"
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 120)}
                    onChange={(e) => {
                      setTerm(e.target.value);
                      setActive(0);
                      setOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (!showList) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActive((a) => Math.min(a + 1, items.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActive((a) => Math.max(a - 1, 0));
                      } else if (e.key === 'Enter' && items[active]) {
                        e.preventDefault();
                        pick(items[active]);
                      } else if (e.key === 'Escape') setOpen(false);
                    }}
                  />
                  {showList ? (
                    <ul
                      id={listId}
                      role="listbox"
                      aria-label={t('customerPicker.results')}
                      className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl"
                    >
                      {items.length === 0 ? (
                        <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-fg-muted">
                          {t('customerPicker.noMatch')}
                          {canAdd ? (
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => setCreating(true)}
                              className="font-semibold text-brand hover:underline"
                            >
                              + {t('customer.new')}
                            </button>
                          ) : null}
                        </li>
                      ) : (
                        items.map((c, i) => (
                          <li
                            key={c.id}
                            id={`${listId}-${i}`}
                            role="option"
                            aria-selected={i === active}
                            onMouseEnter={() => setActive(i)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pick(c)}
                            className={cn(
                              'flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm',
                              i === active && 'bg-surface-muted',
                            )}
                          >
                            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-bg text-xs font-bold text-brand">
                              {c.name.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="flex-1 truncate font-medium">{c.name}</span>
                            <span className="money text-fg-muted">{c.phone ?? ''}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {canAdd ? (
                <Button
                  variant="outline"
                  className="shrink-0"
                  icon={<UserPlus aria-hidden className="size-4" />}
                  onClick={() => setCreating(true)}
                >
                  <span className="hidden sm:inline">{t('customer.new')}</span>
                  <span className="sr-only sm:hidden">{t('customer.new')}</span>
                </Button>
              ) : null}
            </div>
          )}
        </Field>
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
            value={value.name}
            maxLength={80}
            onChange={(e) => onChange({ kind: 'walkin', name: e.target.value })}
          />
        )}
      </Field>
      {drawer}
    </div>
  );
}
