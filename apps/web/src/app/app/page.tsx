'use client';

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
} from 'lucide-react';
import { formatDate, formatDateTime } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/hooks';
import type { Dashboard } from '@/lib/types';
import { QueryState } from '@/components/query-state';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Money,
  PageHeader,
  Stat,
  tableCls,
} from '@/components/ui';
import { ServiceIcon, ServiceName, StatusBadge, useServiceLabel } from '@/components/service';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

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
      <PageHeader
        title={t('dashboard.greeting', { name })}
        description={`${ctx.tenant.name} · ${formatDate(q.data?.date ?? '')}`}
      />
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
          const allDone = checklist.every((c) => c.done);
          return (
            <div className="flex flex-col gap-6">
              {d.scope === 'MY_RECORDS' ? (
                <p className="rounded-xl bg-info-bg px-4 py-2 text-sm text-fg">
                  {t('dashboard.scopeMine')}
                </p>
              ) : null}

              {ctx.quickActions.length > 0 ? (
                <section aria-labelledby="qa-title">
                  <h2 id="qa-title" className="mb-3 text-lg font-bold">
                    {t('dashboard.quickActions')}
                  </h2>
                  <ul
                    className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
                    data-testid="quick-actions"
                  >
                    {ctx.quickActions.map((a) => (
                      <li key={a.code}>
                        <Link
                          href={a.path}
                          className="card flex min-h-20 items-center gap-3 p-3 hover:border-brand"
                        >
                          <ServiceIcon code={a.code} />
                          <span className="text-sm font-semibold leading-snug">
                            {label(a.code)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section aria-labelledby="today-title">
                <h2 id="today-title" className="mb-3 text-lg font-bold">
                  {t('dashboard.today')}{' '}
                  <span className="text-sm font-medium text-fg-muted">· {range}</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat
                    icon={<FileText aria-hidden className="size-4" />}
                    label={t('dashboard.todayRecords')}
                    value={d.todayRecords.value}
                    help={t('dashboard.todayRecordsHelp')}
                  />
                  {f ? (
                    <>
                      <Stat
                        icon={<IndianRupee aria-hidden className="size-4" />}
                        tone="success"
                        label={t('dashboard.customerFees')}
                        value={<Money paise={f.customerFeesPaise.value} />}
                        help={t('dashboard.customerFeesHelp')}
                      />
                      <Stat
                        icon={<ArrowDownLeft aria-hidden className="size-4" />}
                        label={t('dashboard.cashIn')}
                        value={<Money paise={f.cashInPaise.value} />}
                        help={t('dashboard.cashHelp')}
                      />
                      <Stat
                        icon={<ArrowUpRight aria-hidden className="size-4" />}
                        label={t('dashboard.cashOut')}
                        value={<Money paise={f.cashOutPaise.value} />}
                        help={t('dashboard.cashHelp')}
                      />
                    </>
                  ) : null}
                </div>
              </section>

              {f || widgets.has('pendingApplications') ? (
                <section aria-labelledby="now-title">
                  <h2 id="now-title" className="mb-3 text-lg font-bold">
                    {t('dashboard.asOfNow')}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {f ? (
                      <>
                        <Stat
                          icon={<Wallet aria-hidden className="size-4" />}
                          label={t('dashboard.cashInHand')}
                          value={<Money paise={f.cashInHandPaise.value} />}
                          help={t('dashboard.cashInHandHelp')}
                        />
                        <Stat
                          icon={<HandCoins aria-hidden className="size-4" />}
                          tone="warning"
                          label={t('dashboard.outstandingDues')}
                          value={<Money paise={f.outstandingDuesPaise.value} />}
                          help={t('dashboard.outstandingDuesHelp')}
                        />
                        <Stat
                          icon={<BadgeIndianRupee aria-hidden className="size-4" />}
                          tone="info"
                          label={t('dashboard.pendingCommission')}
                          value={<Money paise={f.pendingCommissionPaise.value} />}
                          help={t('dashboard.pendingCommissionHelp')}
                        />
                      </>
                    ) : null}
                    {widgets.has('pendingApplications') ? (
                      <Stat
                        icon={<ClipboardList aria-hidden className="size-4" />}
                        label={t('dashboard.pendingApplications')}
                        value={d.pendingApplications.value}
                        help={t('dashboard.pendingApplicationsHelp')}
                      />
                    ) : null}
                  </div>
                </section>
              ) : null}

              {widgets.has('volume') ||
              widgets.has('cashPayout') ||
              widgets.has('cashCollected') ? (
                <Card aria-labelledby="vol-title">
                  <CardHeader
                    id="vol-title"
                    title={t('dashboard.serviceVolume')}
                    description={`${t('dashboard.serviceVolumeHelp')} · ${range}`}
                  />
                  {d.serviceVolume.items.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-fg-muted">{t('dashboard.noVolume')}</p>
                  ) : (
                    <div className={tableCls.wrap}>
                      <table className={tableCls.table}>
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
                            <tr key={v.serviceCode}>
                              <td className={tableCls.td}>
                                <ServiceName code={v.serviceCode} />
                              </td>
                              <td className={cn(tableCls.td, tableCls.num)}>{v.count}</td>
                              <td className={cn(tableCls.td, tableCls.num)}>
                                <Money paise={v.principalPaise} />
                              </td>
                              <td className={cn(tableCls.td, tableCls.num)}>
                                <Money paise={v.customerFeePaise} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="flex items-start gap-2 px-5 py-3 text-[13px] text-fg-muted">
                    <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {t('dashboard.notIncome')}
                  </p>
                </Card>
              ) : null}

              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <Card aria-labelledby="recent-title">
                  <CardHeader
                    id="recent-title"
                    title={t('dashboard.recentActivity')}
                    actions={
                      <Link
                        href="/app/records"
                        className="text-sm font-semibold text-brand underline-offset-2 hover:underline"
                      >
                        {t('common.viewAll')}
                      </Link>
                    }
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
                            className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted"
                          >
                            <ServiceIcon code={r.serviceCode} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">
                                #{r.recordNo} · {label(r.serviceCode)}
                              </span>
                              <span className="block truncate text-sm text-fg-muted">
                                {r.customerName ?? t('common.walkIn')} ·{' '}
                                {formatDateTime(r.createdAt, ctx.tenant.timezone)}
                              </span>
                            </span>
                            <span className="flex flex-col items-end gap-1">
                              <StatusBadge status={r.opStatus} />
                              {r.principalPaise > 0 ? (
                                <Money paise={r.principalPaise} className="text-sm text-fg-muted" />
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <div className="flex flex-col gap-6">
                  {!allDone && checklist.length > 0 ? (
                    <Card aria-labelledby="gs-title">
                      <CardHeader
                        id="gs-title"
                        title={t('dashboard.checklist.title')}
                        description={t('dashboard.checklistHelp')}
                      />
                      <ul className="flex flex-col gap-1 p-3">
                        {checklist.map((c) => (
                          <li key={c.key}>
                            <Link
                              href={c.href}
                              className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-surface-muted"
                            >
                              {c.done ? (
                                <CheckCircle2 aria-hidden className="size-5 text-success" />
                              ) : (
                                <Circle aria-hidden className="size-5 text-fg-muted" />
                              )}
                              <span
                                className={cn('flex-1', c.done && 'text-fg-muted line-through')}
                              >
                                {c.label}
                              </span>
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
                        actions={
                          <Link
                            href="/app/follow-ups"
                            className="text-sm font-semibold text-brand hover:underline"
                          >
                            {t('common.viewAll')}
                          </Link>
                        }
                      />
                      {d.followUpsDue.length === 0 ? (
                        <EmptyState
                          icon={<CalendarClock aria-hidden className="size-6" />}
                          title={t('followUps.noneDue')}
                        />
                      ) : (
                        <ul className="divide-y divide-border">
                          {d.followUpsDue.map((fu) => (
                            <li key={fu.id} className="flex items-center gap-3 px-5 py-3">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold">
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
                                <p className="text-sm text-fg-muted">
                                  {fu.customerName ? `${fu.customerName} · ` : ''}
                                  <Badge tone={fu.dueDate < d.date ? 'danger' : 'warning'}>
                                    {fu.dueDate < d.date
                                      ? t('followUps.overdue')
                                      : t('followUps.dueToday')}
                                  </Badge>{' '}
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
