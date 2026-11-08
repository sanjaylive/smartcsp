'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Info, Lock } from 'lucide-react';
import { EXPORT_TYPES, formatDate, formatDateTime } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, usePermissions, useToday } from '@/lib/hooks';
import { openSignedUrl } from '@/lib/download';
import type { ExportJob, JournalLineJson, ReportSummary } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  Select,
  Stat,
  tableCls,
} from '@/components/ui';
import { QueryState } from '@/components/query-state';
import { ServiceName, StatusBadge } from '@/components/service';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

type Tab = 'summary' | 'operations' | 'trial' | 'daybook' | 'exports';

export default function ReportsPage() {
  const { t } = useI18n();
  const { can, ctx } = usePermissions();
  const today = useToday();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const financial = can('reports.financial');
  const tabs: Array<{ key: Tab; label: string; show: boolean }> = [
    { key: 'summary', label: t('reports.summary'), show: financial },
    { key: 'operations', label: t('reports.operations'), show: can('reports.operational') },
    { key: 'trial', label: t('reports.trialBalance'), show: financial },
    { key: 'daybook', label: t('reports.daybook'), show: financial },
    { key: 'exports', label: t('reports.exports'), show: can('exports.create') },
  ];
  const visible = tabs.filter((x) => x.show);
  const [tab, setTab] = useState<Tab>(visible[0]?.key ?? 'operations');
  const advanced = !!ctx?.plan.entitlements.advancedReports;
  const exportsOn = !!ctx?.plan.entitlements.exportsEnabled;

  return (
    <>
      <PageHeader title={t('nav.reports')} description={t('reports.help')} />
      <div
        role="tablist"
        aria-label={t('nav.reports')}
        className="mb-4 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1"
      >
        {visible.map((x) => (
          <button
            key={x.key}
            role="tab"
            type="button"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={cn(
              'min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold whitespace-nowrap',
              tab === x.key ? 'bg-brand text-on-brand' : 'text-fg-muted hover:bg-surface-muted',
            )}
          >
            {x.label}
            {(x.key === 'trial' || x.key === 'daybook') && !advanced ? (
              <Lock aria-label={t('reports.locked')} className="ml-1 inline size-3.5" />
            ) : null}
            {x.key === 'exports' && !exportsOn ? (
              <Lock aria-label={t('reports.locked')} className="ml-1 inline size-3.5" />
            ) : null}
          </button>
        ))}
      </div>
      {tab === 'summary' || tab === 'operations' ? (
        <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
          <Field label={t('range.from')}>
            {(p) => (
              <Input
                id={p.id}
                type="date"
                required
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('range.to')}>
            {(p) => (
              <Input
                id={p.id}
                type="date"
                required
                value={to}
                max={today}
                onChange={(e) => setTo(e.target.value)}
              />
            )}
          </Field>
        </Card>
      ) : null}
      <div role="tabpanel">
        {tab === 'summary' ? <SummaryTab from={from} to={to} /> : null}
        {tab === 'operations' ? <OperationsTab from={from} to={to} /> : null}
        {tab === 'trial' ? advanced ? <TrialTab /> : <Locked /> : null}
        {tab === 'daybook' ? advanced ? <DaybookTab /> : <Locked /> : null}
        {tab === 'exports' ? exportsOn ? <ExportsTab /> : <Locked /> : null}
      </div>
    </>
  );
}

function Locked() {
  const { t } = useI18n();
  return (
    <Card>
      <EmptyState
        icon={<Lock aria-hidden className="size-6" />}
        title={t('upgrade.featureTitle')}
        description={<span data-testid="feature-locked">{t('upgrade.featureBody')}</span>}
        action={<ButtonLink href="/app/subscription">{t('plan.upgrade')}</ButtonLink>}
      />
    </Card>
  );
}

function SummaryTab({ from, to }: { from: string; to: string }) {
  const { t, tk } = useI18n();
  const q = useQuery({
    queryKey: ['reports', 'summary', from, to],
    queryFn: () => api<ReportSummary>('/v1/reports/summary', { query: { from, to } }),
    placeholderData: keepPreviousData,
  });
  return (
    <QueryState query={q}>
      {(s) => (
        <div className="flex flex-col gap-6">
          <Alert tone="info" title={t('reports.incomeVsPrincipal')}>
            <ul className="list-disc pl-5 text-sm">
              <li>{t('reports.note1')}</li>
              <li>{t('reports.note2')}</li>
            </ul>
          </Alert>
          <section aria-labelledby="inc-h">
            <h2 id="inc-h" className="mb-3 text-lg font-bold">
              {t('reports.income')}{' '}
              <span className="text-sm font-medium text-fg-muted">
                · {formatDate(s.range.from)} – {formatDate(s.range.to)}
              </span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Stat
                label={t('dashboard.customerFees')}
                value={<Money paise={s.income.customerFeesPaise} />}
              />
              <Stat
                label={t('closing.commissionAccrued')}
                value={<Money paise={s.income.commissionAccruedPaise} />}
              />
              <Stat
                label={t('expense.title')}
                tone="danger"
                value={<Money paise={-s.income.expensesPaise} signed />}
              />
              <Stat
                label={t('reports.overShort')}
                value={<Money paise={s.income.cashOverShortPaise} signed />}
              />
              <Stat
                label={t('reports.netIncome')}
                tone="brand"
                value={
                  <span data-testid="net-income">
                    <Money paise={s.income.netIncomePaise} />
                  </span>
                }
                help={t('reports.netIncomeHelp')}
              />
            </div>
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('commission.title')} />
              <div className="grid gap-3 p-5 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-fg-muted">{t('reports.accrued')}</p>
                  <p className="text-lg font-bold">
                    <Money paise={s.commission.accruedInRangePaise} />
                  </p>
                </div>
                <div>
                  <p className="text-sm text-fg-muted">{t('commission.received')}</p>
                  <p className="text-lg font-bold text-success">
                    <Money paise={s.commission.receivedInRangePaise} />
                  </p>
                </div>
                <div>
                  <p className="text-sm text-fg-muted">{t('commission.pending')}</p>
                  <p className="text-lg font-bold text-warning">
                    <Money paise={s.commission.pendingAsOfEndPaise} />
                  </p>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader title={t('reports.funds')} description={t('reports.fundsHelp')} />
              <div className={tableCls.wrap}>
                <table className={cn(tableCls.table, 'min-w-[420px]')}>
                  <thead>
                    <tr>
                      <th className={tableCls.th}>{t('cashbook.account')}</th>
                      <th className={cn(tableCls.th, 'text-right')}>{t('cashbook.in')}</th>
                      <th className={cn(tableCls.th, 'text-right')}>{t('cashbook.out')}</th>
                      <th className={cn(tableCls.th, 'text-right')}>{t('cashbook.closing')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.funds.map((f) => (
                      <tr key={f.account}>
                        <td className={tableCls.td}>{tk(`account.${f.account}`)}</td>
                        <td className={cn(tableCls.td, tableCls.num)}>
                          <Money paise={f.inPaise} />
                        </td>
                        <td className={cn(tableCls.td, tableCls.num)}>
                          <Money paise={f.outPaise} />
                        </td>
                        <td className={cn(tableCls.td, tableCls.num, 'font-semibold')}>
                          <Money paise={f.closingBalancePaise} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-5 py-3 text-sm text-fg-muted">
                {t('reports.duesAsOfEnd')}:{' '}
                <Money paise={s.duesOutstandingAsOfEndPaise} className="font-semibold" /> ·{' '}
                {t('reports.capital')}: <Money paise={s.openingCapitalPaise} />
              </p>
            </Card>
          </div>
          <Card>
            <CardHeader title={t('reports.byService')} description={t('reports.byServiceHelp')} />
            {s.services.length === 0 ? (
              <EmptyState title={t('reports.noData')} />
            ) : (
              <div className={tableCls.wrap}>
                <table className={tableCls.table}>
                  <thead>
                    <tr>
                      <th className={tableCls.th}>{t('records.service')}</th>
                      <th className={cn(tableCls.th, 'text-right')}>
                        {t('reports.postedRecords')}
                      </th>
                      <th className={cn(tableCls.th, 'text-right')}>{t('dashboard.txnValue')}</th>
                      <th className={cn(tableCls.th, 'text-right')}>
                        {t('dashboard.customerFees')}
                      </th>
                      <th className={cn(tableCls.th, 'text-right')}>
                        {t('record.expectedCommission')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.services.map((x) => (
                      <tr key={x.serviceCode}>
                        <td className={tableCls.td}>
                          <ServiceName code={x.serviceCode} />
                        </td>
                        <td className={cn(tableCls.td, tableCls.num)}>{x.postedRecords}</td>
                        <td className={cn(tableCls.td, tableCls.num, 'text-fg-muted')}>
                          <Money paise={x.transactionValuePaise} />
                        </td>
                        <td className={cn(tableCls.td, tableCls.num)}>
                          <Money paise={x.customerFeesPaise} />
                        </td>
                        <td className={cn(tableCls.td, tableCls.num)}>
                          <Money paise={x.expectedCommissionPaise} />
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
        </div>
      )}
    </QueryState>
  );
}

function OperationsTab({ from, to }: { from: string; to: string }) {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ['reports', 'ops', from, to],
    queryFn: () =>
      api<{
        scope: string;
        items: {
          serviceCode: string;
          opStatus: string;
          count: number;
          transactionValuePaise: number;
        }[];
      }>('/v1/reports/operations', { query: { from, to } }),
    placeholderData: keepPreviousData,
  });
  return (
    <QueryState query={q}>
      {(d) => (
        <Card>
          <CardHeader
            title={t('reports.operations')}
            description={d.scope === 'MY_RECORDS' ? t('dashboard.scopeMine') : t('reports.opsHelp')}
          />
          {d.items.length === 0 ? (
            <EmptyState title={t('reports.noData')} />
          ) : (
            <div className={tableCls.wrap}>
              <table className={tableCls.table} data-testid="ops-table">
                <thead>
                  <tr>
                    <th className={tableCls.th}>{t('records.service')}</th>
                    <th className={tableCls.th}>{t('common.status')}</th>
                    <th className={cn(tableCls.th, 'text-right')}>{t('dashboard.count')}</th>
                    <th className={cn(tableCls.th, 'text-right')}>{t('dashboard.txnValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((x, i) => (
                    <tr key={i}>
                      <td className={tableCls.td}>
                        <ServiceName code={x.serviceCode} />
                      </td>
                      <td className={tableCls.td}>
                        <StatusBadge status={x.opStatus} />
                      </td>
                      <td className={cn(tableCls.td, tableCls.num)}>{x.count}</td>
                      <td className={cn(tableCls.td, tableCls.num)}>
                        <Money paise={x.transactionValuePaise} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </QueryState>
  );
}

function TrialTab() {
  const { t, tk } = useI18n();
  const today = useToday();
  const [asOf, setAsOf] = useState(today);
  const q = useQuery({
    queryKey: ['reports', 'trial', asOf],
    queryFn: () =>
      api<{
        asOf: string;
        balanced: boolean;
        totalDebitPaise: number;
        totalCreditPaise: number;
        accounts: {
          code: string;
          key: string;
          name: string;
          type: string;
          debitPaise: number;
          creditPaise: number;
          balancePaise: number;
        }[];
      }>('/v1/reports/trial-balance', { query: { asOf } }),
  });
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <Field label={t('reports.asOf')}>
          {(p) => (
            <Input
              id={p.id}
              type="date"
              required
              max={today}
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          )}
        </Field>
      </Card>
      <QueryState query={q}>
        {(d) => (
          <Card>
            <CardHeader
              title={t('reports.trialBalance')}
              description={formatDate(d.asOf)}
              actions={
                <Badge tone={d.balanced ? 'success' : 'danger'}>
                  {d.balanced ? t('reports.balanced') : t('reports.unbalanced')}
                </Badge>
              }
            />
            <div className={tableCls.wrap}>
              <table className={tableCls.table} data-testid="trial-balance">
                <thead>
                  <tr>
                    <th className={tableCls.th}>{t('reports.code')}</th>
                    <th className={tableCls.th}>{t('ledger.account')}</th>
                    <th className={cn(tableCls.th, 'text-right')}>{t('ledger.debit')}</th>
                    <th className={cn(tableCls.th, 'text-right')}>{t('ledger.credit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.accounts.map((a) => (
                    <tr key={a.key}>
                      <td className={cn(tableCls.td, 'money text-fg-muted')}>{a.code}</td>
                      <td className={tableCls.td}>{tk(`ledger.${a.key}`)}</td>
                      <td className={cn(tableCls.td, tableCls.num)}>
                        {a.debitPaise ? <Money paise={a.debitPaise} /> : ''}
                      </td>
                      <td className={cn(tableCls.td, tableCls.num)}>
                        {a.creditPaise ? <Money paise={a.creditPaise} /> : ''}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className={tableCls.td} />
                    <td className={tableCls.td}>{t('reports.total')}</td>
                    <td className={cn(tableCls.td, tableCls.num)}>
                      <Money paise={d.totalDebitPaise} />
                    </td>
                    <td className={cn(tableCls.td, tableCls.num)}>
                      <Money paise={d.totalCreditPaise} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </QueryState>
    </div>
  );
}

function DaybookTab() {
  const { t, tk } = useI18n();
  const today = useToday();
  const [date, setDate] = useState(today);
  const q = useQuery({
    queryKey: ['reports', 'daybook', date],
    queryFn: () =>
      api<{
        date: string;
        entries: {
          id: string;
          entryNo: number;
          type: string;
          description: string;
          reversedByEntryId: string | null;
          lines: JournalLineJson[];
        }[];
      }>('/v1/reports/daybook', { query: { date } }),
  });
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <Field label={t('common.date')}>
          {(p) => (
            <Input
              id={p.id}
              type="date"
              required
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>
      </Card>
      <QueryState query={q}>
        {(d) =>
          d.entries.length === 0 ? (
            <Card>
              <EmptyState title={t('reports.noEntries')} />
            </Card>
          ) : (
            <div className="flex flex-col gap-3" data-testid="daybook">
              {d.entries.map((e) => (
                <Card key={e.id} className="p-4">
                  <p className="mb-2 font-semibold">
                    {t('recordDetail.entry', { no: e.entryNo })} · {tk(`entryType.${e.type}`)}{' '}
                    <span className="font-normal text-fg-muted">· {e.description}</span>
                    {e.reversedByEntryId ? (
                      <Badge tone="warning" className="ml-2">
                        {t('common.reversed')}
                      </Badge>
                    ) : null}
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-fg-muted">
                        <th className="py-1 font-semibold">{t('ledger.account')}</th>
                        <th className="py-1 text-right font-semibold">{t('ledger.debit')}</th>
                        <th className="py-1 text-right font-semibold">{t('ledger.credit')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.lines.map((l, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-1.5">{tk(`ledger.${l.account}`)}</td>
                          <td className="money py-1.5 text-right">
                            {l.debitPaise ? <Money paise={l.debitPaise} /> : ''}
                          </td>
                          <td className="money py-1.5 text-right">
                            {l.creditPaise ? <Money paise={l.creditPaise} /> : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
            </div>
          )
        }
      </QueryState>
    </div>
  );
}

function ExportsTab() {
  const { t, tk } = useI18n();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const today = useToday();
  const [type, setType] = useState<(typeof EXPORT_TYPES)[number]>('RECORDS');
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const q = useQuery({
    queryKey: ['exports'],
    queryFn: () => api<{ items: ExportJob[] }>('/v1/exports'),
    refetchInterval: (query) =>
      query.state.data?.items.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING')
        ? 2000
        : false,
  });
  const create = useMutation({
    mutationFn: () => api<ExportJob>('/v1/exports', { method: 'POST', body: { type, from, to } }),
    onSuccess: () => {
      toast('success', t('exports.requested'));
      void qc.invalidateQueries({ queryKey: ['exports'] });
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const types = EXPORT_TYPES.filter((x) =>
    x === 'LEDGER'
      ? can('reports.financial')
      : x === 'EXPENSES'
        ? can('expenses.view')
        : x === 'CUSTOMERS'
          ? can('customers.view')
          : true,
  );
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-bold">{t('exports.new')}</h2>
        <p className="mb-4 text-sm text-fg-muted">{t('exports.help')}</p>
        <div className="flex flex-wrap items-end gap-4">
          <Field label={t('exports.type')}>
            {(p) => (
              <Select
                id={p.id}
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                {types.map((x) => (
                  <option key={x} value={x}>
                    {tk(`exportType.${x}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('range.from')}>
            {(p) => (
              <Input
                id={p.id}
                type="date"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('range.to')}>
            {(p) => (
              <Input
                id={p.id}
                type="date"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            )}
          </Field>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            icon={<FileSpreadsheet aria-hidden className="size-4" />}
          >
            {t('exports.create')}
          </Button>
        </div>
      </Card>
      <QueryState query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileSpreadsheet aria-hidden className="size-6" />}
                title={t('exports.none')}
              />
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-border" data-testid="exports-list">
                {d.items.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{tk(`exportType.${j.type}`)}</span>
                      <span className="block text-[13px] text-fg-muted">
                        {formatDateTime(j.createdAt)}
                        {j.rowCount !== null ? ` · ${t('exports.rows', { n: j.rowCount })}` : ''}
                        {j.error ? ` · ${j.error}` : ''}
                      </span>
                    </span>
                    <Badge
                      tone={
                        j.status === 'READY'
                          ? 'success'
                          : j.status === 'FAILED'
                            ? 'danger'
                            : j.status === 'EXPIRED'
                              ? 'neutral'
                              : 'warning'
                      }
                    >
                      {tk(`exportStatus.${j.status}`)}
                    </Badge>
                    {j.status === 'READY' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Download aria-hidden className="size-4" />}
                        onClick={() =>
                          openSignedUrl(`/v1/exports/${j.id}/download`).catch((e) =>
                            toast('error', errorMessage(t, e)),
                          )
                        }
                      >
                        {t('common.download')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          )
        }
      </QueryState>
    </div>
  );
}
