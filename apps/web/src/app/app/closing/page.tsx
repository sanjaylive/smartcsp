'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Lock, LockOpen } from 'lucide-react';
import { formatDate, formatDateTime } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  errorMessage,
  useFormErrors,
  useIdempotencyKey,
  usePermissions,
  useToday,
} from '@/lib/hooks';
import type { Closing, ClosingPreview, ClosingSummary } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DescList,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  Stat,
  Textarea,
  tableCls,
} from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { QueryState } from '@/components/query-state';
import { MoneyInput, rupeesOrZero } from '@/components/money-input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

function ClosingInner() {
  const { t, tk } = useI18n();
  const { can, ctx } = usePermissions();
  const sp = useSearchParams();
  const today = useToday();
  const [date, setDate] = useState(sp.get('date') ?? today);
  const preview = useQuery({
    queryKey: ['closing', 'preview', date],
    queryFn: () => api<ClosingPreview>(`/v1/closings/${date}/preview`),
    placeholderData: keepPreviousData,
  });
  const history = useQuery({
    queryKey: ['closing', 'list'],
    queryFn: () => api<{ items: Closing[] }>('/v1/closings'),
  });
  const tz = ctx?.tenant.timezone;

  return (
    <>
      <PageHeader title={t('closing.title')} description={t('closing.help')} />
      <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
        <Field label={t('closing.businessDate')}>
          {(p) => (
            <Input
              id={p.id}
              type="date"
              required
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value || today)}
              className="w-44"
            />
          )}
        </Field>
      </Card>
      <QueryState query={preview} rows={4}>
        {(p) => (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="flex flex-col gap-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label={t('closing.openingCash')}
                  value={<Money paise={p.openingCashPaise} />}
                />
                <Stat
                  label={t('cashbook.in')}
                  tone="success"
                  value={<Money paise={p.cashInPaise} />}
                />
                <Stat
                  label={t('cashbook.out')}
                  tone="danger"
                  value={<Money paise={p.cashOutPaise} />}
                />
                <Stat
                  label={t('closing.expected')}
                  tone="brand"
                  value={
                    <span data-testid="expected-cash">
                      <Money paise={p.expectedCashPaise} />
                    </span>
                  }
                  help={t('closing.expectedHelp')}
                />
              </div>
              <SummaryCard s={p.summary} />
              {p.summary.recordsUnposted > 0 ? (
                <Alert tone="warning">
                  {t('closing.unpostedWarning', { n: p.summary.recordsUnposted })}
                </Alert>
              ) : null}
            </div>
            <aside className="flex flex-col gap-4">
              {p.closing && p.status !== 'REOPENED' ? (
                <ClosedCard c={p.closing} date={date} tz={tz} />
              ) : can('day.close') ? (
                <CloseForm p={p} date={date} />
              ) : (
                <Alert tone="info">{t('closing.noPermission')}</Alert>
              )}
              {p.closing?.status === 'REOPENED' ? (
                <Alert tone="info">
                  {t('closing.reopenedNote', {
                    at: p.closing.reopenedAt ? formatDateTime(p.closing.reopenedAt, tz) : '',
                  })}
                </Alert>
              ) : null}
            </aside>
          </div>
        )}
      </QueryState>
      <Card className="mt-6">
        <CardHeader title={t('closing.history')} />
        <QueryState query={history}>
          {(h) =>
            h.items.length === 0 ? (
              <EmptyState
                icon={<CalendarCheck aria-hidden className="size-6" />}
                title={t('closing.noHistory')}
              />
            ) : (
              <div className={tableCls.wrap}>
                <table className={tableCls.table}>
                  <thead>
                    <tr>
                      <th className={tableCls.th}>{t('common.date')}</th>
                      <th className={tableCls.th}>{t('common.status')}</th>
                      <th className={cn(tableCls.th, 'text-right')}>{t('closing.expected')}</th>
                      <th className={cn(tableCls.th, 'text-right')}>{t('closing.counted')}</th>
                      <th className={cn(tableCls.th, 'text-right')}>{t('closing.variance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.items.map((c) => (
                      <tr key={c.id}>
                        <td className={tableCls.td}>
                          <button
                            type="button"
                            className="font-semibold text-brand hover:underline"
                            onClick={() => setDate(c.businessDate)}
                          >
                            {formatDate(c.businessDate)}
                          </button>
                        </td>
                        <td className={tableCls.td}>
                          <Badge tone={c.status === 'CLOSED' ? 'success' : 'warning'}>
                            {tk(`dayStatus.${c.status}`)}
                          </Badge>
                        </td>
                        <td className={cn(tableCls.td, tableCls.num)}>
                          <Money paise={c.expectedCashPaise} />
                        </td>
                        <td className={cn(tableCls.td, tableCls.num)}>
                          <Money paise={c.countedCashPaise} />
                        </td>
                        <td
                          className={cn(
                            tableCls.td,
                            tableCls.num,
                            c.variancePaise < 0
                              ? 'text-danger'
                              : c.variancePaise > 0
                                ? 'text-success'
                                : '',
                          )}
                        >
                          <Money paise={c.variancePaise} signed />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </QueryState>
      </Card>
    </>
  );
}

function SummaryCard({ s }: { s: ClosingSummary }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader title={t('closing.daySummary')} description={t('closing.daySummaryHelp')} />
      <div className="p-5">
        <DescList
          items={[
            { label: t('closing.records'), value: s.recordsTotal },
            { label: t('closing.unposted'), value: s.recordsUnposted },
            { label: t('dashboard.customerFees'), value: <Money paise={s.feeIncomePaise} /> },
            {
              label: t('closing.commissionAccrued'),
              value: <Money paise={s.commissionAccruedPaise} />,
            },
            { label: t('expense.title'), value: <Money paise={s.expensesPaise} /> },
            { label: t('closing.duesCollected'), value: <Money paise={s.duesCollectedPaise} /> },
            { label: t('closing.bankNet'), value: <Money paise={s.bankNetPaise} signed /> },
            { label: t('closing.walletNet'), value: <Money paise={s.walletNetPaise} signed /> },
          ]}
        />
      </div>
    </Card>
  );
}

function CloseForm({ p, date }: { p: ClosingPreview; date: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const idem = useIdempotencyKey();
  const errs = useFormErrors();
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const countedPaise = counted.trim() === '' ? null : rupeesOrZero(counted);
  const variance = countedPaise !== null ? countedPaise - p.expectedCashPaise : null;
  const m = useMutation({
    mutationFn: () =>
      api('/v1/closings', {
        method: 'POST',
        body: { businessDate: date, countedCashPaise: countedPaise, notes: notes.trim() || null },
        idempotencyKey: idem.key(),
      }),
    onSuccess: () => {
      idem.reset();
      toast('success', t('closing.closed'));
      void qc.invalidateQueries({ queryKey: ['closing'] });
      void qc.invalidateQueries({ queryKey: ['cashbook'] });
    },
    onError: errs.fromError,
  });
  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">{t('closing.close')}</h2>
      <p className="mt-1 text-sm text-fg-muted">{t('closing.closeHelp')}</p>
      <div className="mt-4 flex flex-col gap-4">
        <Field
          label={t('closing.counted')}
          required
          error={errs.get('countedCashPaise')}
          help={t('closing.countedHelp')}
        >
          {(f) => (
            <MoneyInput
              id={f.id}
              name="counted"
              describedBy={f.describedBy}
              invalid={f.invalid}
              value={counted}
              onChange={setCounted}
            />
          )}
        </Field>
        {variance !== null ? (
          <div
            className={cn(
              'rounded-xl px-4 py-3',
              variance === 0 ? 'bg-success-bg' : 'bg-warning-bg',
            )}
            aria-live="polite"
          >
            <p className="text-sm font-semibold">{t('closing.variance')}</p>
            <p className="text-xl font-extrabold" data-testid="variance">
              <Money paise={variance} signed />
            </p>
            <p className="text-[13px]">
              {variance === 0
                ? t('closing.balanced')
                : variance > 0
                  ? t('closing.over')
                  : t('closing.short')}
            </p>
          </div>
        ) : null}
        <Field label={t('common.notes')} optionalLabel={t('common.optional')}>
          {(f) => (
            <Textarea id={f.id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
        {errs.formMessage && !Object.keys(errs.fields).length ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
        <Button
          size="lg"
          icon={<Lock aria-hidden className="size-4" />}
          loading={m.isPending}
          onClick={() => {
            errs.clear();
            if (countedPaise === null) errs.setFields({ countedCashPaise: [t('msg.money')] });
            else m.mutate();
          }}
        >
          {t('closing.close')}
        </Button>
      </div>
    </Card>
  );
}

function ClosedCard({ c, date, tz }: { c: Closing; date: string; tz?: string }) {
  const { t, tk } = useI18n();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const done = (msg: string) => {
    toast('success', msg);
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ['closing'] });
    void qc.invalidateQueries({ queryKey: ['cashbook'] });
  };
  const req = useMutation({
    mutationFn: () =>
      api<Closing>(`/v1/closings/${date}/reopen-request`, { method: 'POST', body: { reason } }),
    onSuccess: (r) =>
      done(r.status === 'REOPENED' ? t('closing.reopened') : t('closing.requested')),
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const approve = useMutation({
    mutationFn: () => api(`/v1/closings/${date}/reopen-approve`, { method: 'POST' }),
    onSuccess: () => done(t('closing.reopened')),
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const reject = useMutation({
    mutationFn: () => api(`/v1/closings/${date}/reopen-reject`, { method: 'POST' }),
    onSuccess: () => done(t('closing.rejected')),
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  return (
    <Card className="p-5">
      <p className="flex items-center gap-2 text-lg font-bold" data-testid="day-closed">
        <Lock aria-hidden className="size-5 text-success" />
        {tk(`dayStatus.${c.status}`)}
      </p>
      <div className="mt-3">
        <DescList
          items={[
            { label: t('closing.counted'), value: <Money paise={c.countedCashPaise} /> },
            { label: t('closing.variance'), value: <Money paise={c.variancePaise} signed /> },
            {
              label: t('closing.closedAt'),
              value: c.closedAt ? formatDateTime(c.closedAt, tz) : null,
            },
            c.reopenReason ? { label: t('closing.reopenReason'), value: c.reopenReason } : null,
          ]}
        />
      </div>
      {c.status === 'CLOSED' && can('day.close') ? (
        <Button
          variant="outline"
          className="mt-4 w-full"
          icon={<LockOpen aria-hidden className="size-4" />}
          onClick={() => setOpen(true)}
        >
          {can('day.reopen') ? t('closing.reopenNow') : t('closing.reopenRequest')}
        </Button>
      ) : null}
      {c.status === 'REOPEN_REQUESTED' ? (
        can('day.reopen') ? (
          <div className="mt-4 flex gap-2">
            <Button onClick={() => approve.mutate()} loading={approve.isPending}>
              {t('closing.reopenApprove')}
            </Button>
            <Button variant="outline" onClick={() => reject.mutate()} loading={reject.isPending}>
              {t('closing.reopenReject')}
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-fg-muted">{t('closing.awaitingApproval')}</p>
        )
      ) : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={can('day.reopen') ? t('closing.reopenNow') : t('closing.reopenRequest')}
        description={t('closing.reopenHelp')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={reason.trim().length < 5}
              loading={req.isPending}
              onClick={() => req.mutate()}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <Field label={t('recordDetail.reasonLabel')} required help={t('closing.reasonHelp')}>
          {(f) => (
            <Textarea
              id={f.id}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
      </Dialog>
    </Card>
  );
}

export default function ClosingPage() {
  return (
    <Suspense>
      <ClosingInner />
    </Suspense>
  );
}
