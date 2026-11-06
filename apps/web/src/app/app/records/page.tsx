'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileText, Plus, Search, X } from 'lucide-react';
import {
  formatDate,
  getService,
  OP_STATUSES,
  PAYMENT_STATUSES,
  type ServiceCode,
} from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/hooks';
import type { Page, RecordJson } from '@/lib/types';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  Select,
  tableCls,
} from '@/components/ui';
import { QueryState } from '@/components/query-state';
import {
  PaymentBadge,
  PostingBadge,
  ServiceIcon,
  ServiceName,
  StatusBadge,
  useServiceLabel,
} from '@/components/service';
import { Pagination } from '@/components/pagination';
import { cn } from '@/lib/cn';

const FILTER_KEYS = ['service', 'status', 'paymentStatus', 'from', 'to', 'q'] as const;

function RecordsInner() {
  const { t, tk } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const { ctx, can } = usePermissions();
  const label = useServiceLabel();
  const service = params.get('service') as ServiceCode | null;
  const page = Number(params.get('page') ?? '1') || 1;
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as Record<
    (typeof FILTER_KEYS)[number],
    string
  >;
  const [q, setQ] = useState(filters.q);

  const query = useQuery({
    queryKey: ['records', 'list', filters, page],
    queryFn: () =>
      api<Page<RecordJson>>('/v1/records', { query: { ...filters, page, pageSize: 25 } }),
    placeholderData: keepPreviousData,
  });

  const setParam = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in updates)) next.delete('page');
    router.replace(`/app/records${next.toString() ? `?${next}` : ''}`);
  };

  const avail = service ? ctx?.services.find((s) => s.code === service) : null;
  const customNames = new Map(ctx?.customServices.map((c) => [c.id, c.name]));
  const anyFilter = FILTER_KEYS.some((k) => filters[k] && k !== 'service');
  const newHref = service ? `/app/records/new?service=${service}` : '/app/records/new';
  const showNew = can('records.create') && (!service || avail?.canCreate);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setParam({ q });
  };

  return (
    <>
      <PageHeader
        title={service ? label(service) : t('nav.records')}
        icon={service ? <ServiceIcon code={service} size="lg" /> : undefined}
        description={
          service
            ? t('records.serviceHistory')
            : can('records.view_all')
              ? t('records.allHelp')
              : t('records.mineHelp')
        }
        actions={
          showNew ? (
            <ButtonLink href={newHref} icon={<Plus aria-hidden className="size-4" />}>
              {t('nav.newRecord')}
            </ButtonLink>
          ) : null
        }
      />
      {service && avail && !avail.canCreate ? (
        <Alert tone="info" className="mb-4">
          <span data-testid="service-disabled-note">
            {t('service.disabled')} {avail.reason ? tk(`service.unavailable.${avail.reason}`) : ''}
          </span>
        </Alert>
      ) : null}

      <Card className="mb-4 p-4">
        <form
          onSubmit={onSearch}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          role="search"
          aria-label={t('records.filters')}
        >
          <Field label={t('common.search')} className="lg:col-span-2">
            {(p) => (
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
                />
                <Input
                  id={p.id}
                  className="pl-9"
                  placeholder={t('records.searchPlaceholder')}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onBlur={() => q !== filters.q && setParam({ q })}
                />
              </div>
            )}
          </Field>
          <Field label={t('records.service')}>
            {(p) => (
              <Select
                id={p.id}
                value={filters.service}
                onChange={(e) => setParam({ service: e.target.value })}
              >
                <option value="">{t('common.all')}</option>
                {ctx?.services
                  .filter((s) => s.selected || s.hasHistory)
                  .map((s) => (
                    <option key={s.code} value={s.code}>
                      {label(s.code)}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t('common.status')}>
            {(p) => (
              <Select
                id={p.id}
                value={filters.status}
                onChange={(e) => setParam({ status: e.target.value })}
              >
                <option value="">{t('common.all')}</option>
                {OP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tk(`status.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('records.payment')}>
            {(p) => (
              <Select
                id={p.id}
                value={filters.paymentStatus}
                onChange={(e) => setParam({ paymentStatus: e.target.value })}
              >
                <option value="">{t('common.all')}</option>
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tk(`payment.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('range.from')}>
              {(p) => (
                <Input
                  id={p.id}
                  type="date"
                  value={filters.from}
                  onChange={(e) => setParam({ from: e.target.value })}
                />
              )}
            </Field>
            <Field label={t('range.to')}>
              {(p) => (
                <Input
                  id={p.id}
                  type="date"
                  value={filters.to}
                  onChange={(e) => setParam({ to: e.target.value })}
                />
              )}
            </Field>
          </div>
          {anyFilter ? (
            <div className="lg:col-span-6">
              <Button
                variant="ghost"
                size="sm"
                icon={<X aria-hidden className="size-4" />}
                onClick={() => {
                  setQ('');
                  router.replace(service ? `/app/records?service=${service}` : '/app/records');
                }}
              >
                {t('records.clearFilters')}
              </Button>
            </div>
          ) : null}
        </form>
      </Card>

      <QueryState query={query} rows={6}>
        {(data) =>
          data.items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileText aria-hidden className="size-6" />}
                title={anyFilter ? t('records.noMatch') : t('records.empty')}
                description={anyFilter ? t('records.noMatchHelp') : t('records.emptyHelp')}
                action={
                  showNew && !anyFilter ? (
                    <ButtonLink href={newHref}>{t('nav.newRecord')}</ButtonLink>
                  ) : null
                }
              />
            </Card>
          ) : (
            <Card>
              <div className="hidden md:block">
                <div className={tableCls.wrap}>
                  <table className={tableCls.table} data-testid="records-table">
                    <caption className="sr-only">{t('nav.records')}</caption>
                    <thead>
                      <tr>
                        <th className={tableCls.th}>#</th>
                        <th className={tableCls.th}>{t('common.date')}</th>
                        <th className={tableCls.th}>{t('records.service')}</th>
                        <th className={tableCls.th}>{t('record.customer')}</th>
                        <th className={tableCls.th}>{t('common.status')}</th>
                        <th className={tableCls.th}>{t('records.payment')}</th>
                        <th className={cn(tableCls.th, 'text-right')}>{t('records.txnAmount')}</th>
                        <th className={cn(tableCls.th, 'text-right')}>{t('records.fee')}</th>
                        <th className={tableCls.th}>{t('records.cashbook')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((r) => (
                        <tr key={r.id} className="hover:bg-surface-muted/50">
                          <td className={tableCls.td}>
                            <Link
                              href={`/app/records/${r.id}`}
                              className="font-semibold text-brand underline-offset-2 hover:underline"
                            >
                              #{r.recordNo}
                            </Link>
                          </td>
                          <td className={cn(tableCls.td, 'whitespace-nowrap')}>
                            {formatDate(r.txnDate)}
                          </td>
                          <td className={tableCls.td}>
                            <ServiceName
                              code={r.serviceCode}
                              customName={
                                r.customServiceId ? customNames.get(r.customServiceId) : null
                              }
                            />
                          </td>
                          <td className={tableCls.td}>
                            {r.customer?.name ?? r.walkInName ?? (
                              <span className="text-fg-muted">{t('common.walkIn')}</span>
                            )}
                          </td>
                          <td className={tableCls.td}>
                            <StatusBadge status={r.opStatus} />
                          </td>
                          <td className={tableCls.td}>
                            <PaymentBadge status={r.paymentStatus} />
                          </td>
                          <td className={cn(tableCls.td, tableCls.num)}>
                            {r.principalPaise ? <Money paise={r.principalPaise} /> : '—'}
                          </td>
                          <td className={cn(tableCls.td, tableCls.num)}>
                            <Money paise={r.customerFeePaise} />
                          </td>
                          <td className={tableCls.td}>
                            <PostingBadge status={r.postingStatus} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <ul className="divide-y divide-border md:hidden">
                {data.items.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/app/records/${r.id}`}
                      className="flex items-start gap-3 px-4 py-3"
                    >
                      <ServiceIcon code={r.serviceCode} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          #{r.recordNo} ·{' '}
                          {r.customServiceId
                            ? customNames.get(r.customServiceId)
                            : tk(getService(r.serviceCode)?.labelKey ?? r.serviceCode)}
                        </span>
                        <span className="block text-sm text-fg-muted">
                          {r.customer?.name ?? r.walkInName ?? t('common.walkIn')} ·{' '}
                          {formatDate(r.txnDate)}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <StatusBadge status={r.opStatus} />
                          <PaymentBadge status={r.paymentStatus} />
                        </span>
                      </span>
                      {r.principalPaise ? (
                        <Money paise={r.principalPaise} className="text-sm font-semibold" />
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination
                page={data.page}
                pages={data.pages}
                total={data.total}
                onPage={(p) => setParam({ page: String(p) })}
              />
            </Card>
          )
        }
      </QueryState>
    </>
  );
}

export default function RecordsPage() {
  return (
    <Suspense>
      <RecordsInner />
    </Suspense>
  );
}
