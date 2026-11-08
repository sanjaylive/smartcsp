'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  FileText,
  HandCoins,
  Info,
  Wallet,
  BadgeIndianRupee,
  IndianRupee,
  ClipboardList,
  CalendarDays,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { formatDate, formatDateTime } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/hooks';
import type { Dashboard } from '@/lib/types';
import { QueryState } from '@/components/query-state';
import { Badge, Button, Card, CardHeader, EmptyState, Money, tableCls } from '@/components/ui';
import { ServiceIcon, ServiceName, StatusBadge, useServiceLabel } from '@/components/service';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { NewRecordLink } from '@/components/record-wizard';

export default function DashboardPage() {
  const { t } = useI18n();
  const { ctx, can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const label = useServiceLabel();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/v1/dashboard') });
  const done = useMutation({
    mutationFn: (f: { id: string; version: number }) =>
      api(`/v1/follow-ups/${f.id}`, {
        method: 'PATCH',
        body: { version: f.version, status: 'DONE' },
      }),
    onSuccess: () => {
      toast('success', t('followUps.markedDone'));
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['follow-ups'] });
    },
    onError: () => toast('error', t('common.error')),
  });
  if (!ctx) return null;
  const widgets = new Set(ctx.dashboardWidgets);
  const name = ctx.tenant.ownerDisplayName;

  return (
    <>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
            {t('dashboard.greeting', { name })}
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-fg-muted">
            <CalendarDays aria-hidden className="size-3.5" />
            {ctx.tenant.name} · {formatDate(q.data?.date ?? '')}
          </p>
        </div>
        {ctx.quickActions.length > 0 ? (
          <nav aria-label={t('dashboard.quickActions')} data-testid="quick-actions">
            <ul className="flex flex-wrap gap-2">
              {ctx.quickActions.map((a) => (
                <li key={a.code}>
                  <NewRecordLink
                    href={a.path}
                    className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface pr-3 pl-1.5 text-sm font-semibold shadow-sm transition hover:border-brand/50 hover:text-brand"
                  >
                    <ServiceIcon code={a.code} size="sm" />
                    {label(a.code)}
                  </NewRecordLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      <QueryState query={q} rows={6}>
        {(d) => {
          const f = d.financial;
          const range = t('dashboard.rangeToday', { date: formatDate(d.date) });
          const checklist = [
            {
              key: 'customer',
              done: d.checklist.firstCustomer,
              label: t('dashboard.checklist.customer'),
              href: '/app/customers?new=1',
              show: can('customers.manage'),
            },
            {
              key: 'record',
              done: d.checklist.firstRecord,
              label: t('dashboard.checklist.record'),
              href: '/app/records/new',
              show: can('records.create'),
            },
            {
              key: 'opening',
              done: d.checklist.openingCash,
              label: t('dashboard.checklist.opening'),
              href: '/app/cashbook?opening=1',
              show: can('cashbook.manage'),
            },
            {
              key: 'staff',
              done: !!d.checklist.staffInvited,
              label: t('dashboard.checklist.staff'),
              href: '/app/staff?invite=1',
              show: d.checklist.staffInvited !== null,
            },
          ].filter((c) => c.show);
          const doneCount = checklist.filter((c) => c.done).length;
          const allDone = doneCount === checklist.length;
          const showNow = !!f || widgets.has('pendingApplications');

          return (
            <div className="flex flex-col gap-4">
              {d.scope === 'MY_RECORDS' ? (
                <p className="rounded-lg bg-info-bg px-3 py-2 text-sm text-fg">
                  {t('dashboard.scopeMine')}
                </p>
              ) : null}

              <div className={cn('grid gap-4', showNow && 'xl:grid-cols-2')}>
                <KpiGroup id="today-title" title={t('dashboard.today')} meta={range}>
                  <Kpi
                    icon={FileText}
                    label={t('dashboard.todayRecords')}
                    value={d.todayRecords.value}
                    help={t('dashboard.todayRecordsHelp')}
                  />
                  {f ? (
                    <>
                      <Kpi
                        icon={IndianRupee}
                        tone="success"
                        label={t('dashboard.customerFees')}
                        value={<Money paise={f.customerFeesPaise.value} />}
                        help={t('dashboard.customerFeesHelp')}
                      />
                      <Kpi
                        icon={ArrowDownLeft}
                        tone="info"
                        label={t('dashboard.cashIn')}
                        value={<Money paise={f.cashInPaise.value} />}
                        help={t('dashboard.cashHelp')}
                      />
                      <Kpi
                        icon={ArrowUpRight}
                        tone="brand"
                        label={t('dashboard.cashOut')}
                        value={<Money paise={f.cashOutPaise.value} />}
                        help={t('dashboard.cashHelp')}
                      />
                    </>
                  ) : null}
                </KpiGroup>

                {showNow ? (
                  <KpiGroup id="now-title" title={t('dashboard.asOfNow')}>
                    {f ? (
                      <>
                        <Kpi
                          icon={Wallet}
                          tone="brand"
                          label={t('dashboard.cashInHand')}
                          value={<Money paise={f.cashInHandPaise.value} />}
                          help={t('dashboard.cashInHandHelp')}
                        />
                        <Kpi
                          icon={HandCoins}
                          tone="warning"
                          label={t('dashboard.outstandingDues')}
                          value={<Money paise={f.outstandingDuesPaise.value} />}
                          help={t('dashboard.outstandingDuesHelp')}
                        />
                        <Kpi
                          icon={BadgeIndianRupee}
                          tone="info"
                          label={t('dashboard.pendingCommission')}
                          value={<Money paise={f.pendingCommissionPaise.value} />}
                          help={t('dashboard.pendingCommissionHelp')}
                        />
                      </>
                    ) : null}
                    {widgets.has('pendingApplications') ? (
                      <Kpi
                        icon={ClipboardList}
                        label={t('dashboard.pendingApplications')}
                        value={d.pendingApplications.value}
                        help={t('dashboard.pendingApplicationsHelp')}
                      />
                    ) : null}
                  </KpiGroup>
                ) : null}
              </div>

              <div className="grid items-start gap-4 lg:grid-cols-[1.65fr_1fr]">
                <div className="flex min-w-0 flex-col gap-4">
                  <Card aria-labelledby="recent-title">
                    <CardHeader
                      id="recent-title"
                      title={t('dashboard.recentActivity')}
                      actions={<ViewAll href="/app/records" label={t('common.viewAll')} />}
                    />
                    {d.recentActivity.length === 0 ? (
                      <EmptyState
                        icon={<FileText aria-hidden className="size-6" />}
                        title={t('records.empty')}
                        description={t('records.emptyHelp')}
                      />
                    ) : (
                      <ul className="divide-y divide-border">
                        {d.recentActivity.map((r) => (
                          <li key={r.id}>
                            <Link
                              href={`/app/records/${r.id}`}
                              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted/60"
                            >
                              <ServiceIcon code={r.serviceCode} size="sm" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">
                                  {label(r.serviceCode)}{' '}
                                  <span className="font-normal text-fg-muted">#{r.recordNo}</span>
                                </span>
                                <span className="block truncate text-xs text-fg-muted">
                                  {r.customerName ?? t('common.walkIn')} ·{' '}
                                  {formatDateTime(r.createdAt, ctx.tenant.timezone)}
                                </span>
                              </span>
                              {r.principalPaise > 0 ? (
                                <Money
                                  paise={r.principalPaise}
                                  className="hidden text-sm font-semibold sm:inline"
                                />
                              ) : null}
                              <StatusBadge status={r.opStatus} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>

                  {widgets.has('volume') ||
                  widgets.has('cashPayout') ||
                  widgets.has('cashCollected') ? (
                    <Card aria-labelledby="vol-title">
                      <CardHeader
                        id="vol-title"
                        title={t('dashboard.serviceVolume')}
                        description={t('dashboard.serviceVolumeHelp')}
                      />
                      {d.serviceVolume.items.length === 0 ? (
                        <p className="px-4 py-5 text-sm text-fg-muted">{t('dashboard.noVolume')}</p>
                      ) : (
                        <div className={tableCls.wrap}>
                          <table className={cn(tableCls.table, 'min-w-[520px]')}>
                            <thead>
                              <tr>
                                <th className={tableCls.th}>{t('records.service')}</th>
                                <th className={cn(tableCls.th, 'text-right')}>
                                  {t('dashboard.count')}
                                </th>
                                <th className={cn(tableCls.th, 'text-right')}>
                                  {t('dashboard.txnValue')}
                                </th>
                                <th className={cn(tableCls.th, 'text-right')}>
                                  {t('dashboard.feesRecorded')}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.serviceVolume.items.map((v) => (
                                <tr key={v.serviceCode} className="hover:bg-surface-muted/50">
                                  <td className={tableCls.td}>
                                    <ServiceName code={v.serviceCode} />
                                  </td>
                                  <td className={cn(tableCls.td, tableCls.num)}>{v.count}</td>
                                  <td className={cn(tableCls.td, tableCls.num)}>
                                    <Money paise={v.principalPaise} />
                                  </td>
                                  <td className={cn(tableCls.td, tableCls.num, 'text-success')}>
                                    <Money paise={v.customerFeePaise} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="flex items-start gap-1.5 px-4 py-2.5 text-xs text-fg-muted">
                        <Info aria-hidden className="mt-px size-3.5 shrink-0" />
                        {t('dashboard.notIncome')}
                      </p>
                    </Card>
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                  {!allDone && checklist.length > 0 ? (
                    <Card aria-labelledby="gs-title">
                      <div className="px-4 pt-3.5 pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <h2 id="gs-title" className="text-[15px] font-bold">
                            {t('dashboard.checklist.title')}
                          </h2>
                          <span className="money text-xs font-semibold text-fg-muted">
                            {doneCount}/{checklist.length}
                          </span>
                        </div>
                        <div
                          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={checklist.length}
                          aria-valuenow={doneCount}
                          aria-labelledby="gs-title"
                        >
                          <div
                            className="h-full rounded-full bg-brand transition-all"
                            style={{ width: `${(doneCount / checklist.length) * 100}%` }}
                          />
                        </div>
                      </div>
                      <ul className="flex flex-col p-1.5">
                        {checklist.map((c) => (
                          <li key={c.key}>
                            <Link
                              href={c.href}
                              className="flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-surface-muted"
                            >
                              {c.done ? (
                                <CheckCircle2 aria-hidden className="size-4 text-success" />
                              ) : (
                                <Circle aria-hidden className="size-4 text-fg-muted" />
                              )}
                              <span
                                className={cn('flex-1', c.done && 'text-fg-muted line-through')}
                              >
                                {c.label}
                              </span>
                              {!c.done ? (
                                <ChevronRight aria-hidden className="size-4 text-fg-muted" />
                              ) : null}
                              <span className="sr-only">
                                {c.done ? t('common.done') : t('common.notDone')}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  ) : null}

                  {can('followups.view') ? (
                    <Card aria-labelledby="fu-title">
                      <CardHeader
                        id="fu-title"
                        title={t('dashboard.followUpsDue')}
                        actions={<ViewAll href="/app/follow-ups" label={t('common.viewAll')} />}
                      />
                      {d.followUpsDue.length === 0 ? (
                        <p className="flex items-center gap-2 px-4 py-5 text-sm text-fg-muted">
                          <CalendarClock aria-hidden className="size-4" />
                          {t('followUps.noneDue')}
                        </p>
                      ) : (
                        <ul className="divide-y divide-border">
                          {d.followUpsDue.map((fu) => (
                            <li key={fu.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">
                                  {fu.recordId ? (
                                    <Link
                                      className="hover:underline"
                                      href={`/app/records/${fu.recordId}`}
                                    >
                                      {fu.title}
                                    </Link>
                                  ) : (
                                    fu.title
                                  )}
                                </p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                                  {fu.customerName ? <span>{fu.customerName}</span> : null}
                                  <Badge tone={fu.dueDate < d.date ? 'danger' : 'warning'}>
                                    {fu.dueDate < d.date
                                      ? t('followUps.overdue')
                                      : t('followUps.dueToday')}
                                  </Badge>
                                  {formatDate(fu.dueDate)}
                                </p>
                              </div>
                              {can('followups.manage') ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  loading={done.isPending && done.variables?.id === fu.id}
                                  onClick={() => done.mutate({ id: fu.id, version: fu.version })}
                                >
                                  {t('followUps.markDone')}
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  ) : null}
                </div>
              </div>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

/* ----------------------------------------------------------------------------- KPI strip */

const KPI_TONE = {
  neutral: 'bg-surface-muted text-fg',
  brand: 'bg-brand-bg text-brand',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  info: 'bg-info-bg text-info',
} as const;

function KpiGroup({
  id,
  title,
  meta,
  children,
}: {
  id: string;
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="card overflow-hidden">
      <h2
        id={id}
        className="flex items-center gap-2 border-b border-border bg-surface-muted/40 px-4 py-2 text-xs font-bold tracking-wide text-fg-muted uppercase"
      >
        {title}
        {meta ? <span className="font-medium normal-case tracking-normal">· {meta}</span> : null}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 [&>*]:border-border max-sm:[&>*:nth-child(odd)]:border-r max-sm:[&>*:nth-child(n+3)]:border-t sm:[&>*:not(:last-child)]:border-r">
        {children}
      </div>
    </section>
  );
}

function Kpi({
  icon: Icon,
  label: text,
  value,
  help,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  help: string;
  tone?: keyof typeof KPI_TONE;
}) {
  return (
    <div className="group relative flex min-w-0 flex-col gap-1.5 px-4 py-3" title={help}>
      <span className="flex min-h-8 items-center gap-2 text-xs font-medium text-fg-muted">
        <span className={cn('grid size-6 shrink-0 place-items-center rounded-md', KPI_TONE[tone])}>
          <Icon aria-hidden className="size-3.5" />
        </span>
        <span className="line-clamp-2 leading-tight">{text}</span>
      </span>
      <span className="money font-display text-lg font-extrabold tracking-tight sm:text-xl">
        {value}
      </span>
      <span className="sr-only">{help}</span>
    </div>
  );
}

function ViewAll({ href, label: text }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand hover:underline"
    >
      {text}
      <ChevronRight aria-hidden className="size-3.5" />
    </Link>
  );
}
