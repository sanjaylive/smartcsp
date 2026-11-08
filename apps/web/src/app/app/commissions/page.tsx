'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeIndianRupee, CheckCircle2, Clock, Plus } from 'lucide-react';
import { formatDate, FUND_ACCOUNTS } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useFormErrors, useIdempotencyKey, usePermissions, useToday } from '@/lib/hooks';
import type { Commissions } from '@/lib/types';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  Select,
  Textarea,
  tableCls,
} from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { QueryState } from '@/components/query-state';
import { MoneyInput, paiseToInput, rupeesOrZero } from '@/components/money-input';
import { ServiceName } from '@/components/service';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

export default function CommissionsPage() {
  const { t, tk } = useI18n();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['commissions'],
    queryFn: () => api<Commissions>('/v1/commissions'),
  });
  return (
    <>
      <PageHeader
        title={t('commission.title')}
        description={t('commissions.help')}
        actions={
          can('commissions.receive') ? (
            <Button icon={<Plus aria-hidden className="size-4" />} onClick={() => setOpen(true)}>
              {t('commission.receive')}
            </Button>
          ) : null
        }
      />
      <QueryState query={q}>
        {(d) => (
          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="pending-h" className="flex flex-col gap-4">
              <Card className="border-l-4 border-l-warning p-5">
                <p
                  id="pending-h"
                  className="flex items-center gap-2 text-sm font-bold text-warning"
                >
                  <Clock aria-hidden className="size-4" />
                  {t('commission.pending')}
                </p>
                <p className="money mt-1 text-3xl font-extrabold" data-testid="commission-pending">
                  <Money paise={d.pendingPaise} />
                </p>
                <p className="mt-1 text-[13px] text-fg-muted">{t('commissions.pendingHelp')}</p>
              </Card>
              <Card>
                <CardHeader title={t('commissions.outstandingRecords')} />
                {d.outstanding.length === 0 ? (
                  <EmptyState
                    icon={<BadgeIndianRupee aria-hidden className="size-6" />}
                    title={t('commissions.noneOutstanding')}
                  />
                ) : (
                  <div className={tableCls.wrap}>
                    <table className={cn(tableCls.table, 'min-w-[480px]')}>
                      <thead>
                        <tr>
                          <th className={tableCls.th}>#</th>
                          <th className={tableCls.th}>{t('records.service')}</th>
                          <th className={tableCls.th}>{t('common.date')}</th>
                          <th className={cn(tableCls.th, 'text-right')}>
                            {t('commissions.outstanding')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.outstanding.map((r) => (
                          <tr key={r.id}>
                            <td className={tableCls.td}>
                              <Link
                                href={`/app/records/${r.id}`}
                                className="font-semibold text-brand hover:underline"
                              >
                                #{r.recordNo}
                              </Link>
                            </td>
                            <td className={tableCls.td}>
                              <ServiceName code={r.serviceCode} />
                            </td>
                            <td className={cn(tableCls.td, 'whitespace-nowrap')}>
                              {formatDate(r.txnDate)}
                            </td>
                            <td className={cn(tableCls.td, tableCls.num)}>
                              <Money paise={r.outstandingPaise} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </section>
            <section aria-labelledby="received-h" className="flex flex-col gap-4">
              <Card className="border-l-4 border-l-success p-5">
                <p
                  id="received-h"
                  className="flex items-center gap-2 text-sm font-bold text-success"
                >
                  <CheckCircle2 aria-hidden className="size-4" />
                  {t('commission.received')}
                </p>
                <p className="money mt-1 text-3xl font-extrabold">
                  <Money paise={d.receivedToDatePaise} />
                </p>
                <p className="mt-1 text-[13px] text-fg-muted">{t('commissions.receivedHelp')}</p>
              </Card>
              <Card>
                <CardHeader title={t('commissions.receipts')} />
                {d.receipts.length === 0 ? (
                  <EmptyState title={t('commissions.noReceipts')} />
                ) : (
                  <ul className="divide-y divide-border">
                    {d.receipts.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <span>
                          <span className="block font-medium">
                            {formatDate(r.receivedOn)} · {tk(`account.${r.method}`)}
                          </span>
                          <span className="block text-[13px] text-fg-muted">
                            {r.allocations.length
                              ? t('commissions.linkedTo', { n: r.allocations.length })
                              : t('commissions.unlinked')}
                            {r.notes ? ` · ${r.notes}` : ''}
                          </span>
                        </span>
                        <Money paise={r.amountPaise} className="font-semibold text-success" />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          </div>
        )}
      </QueryState>
      {open && q.data ? <ReceiveDialog data={q.data} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ReceiveDialog({ data, onClose }: { data: Commissions; onClose: () => void }) {
  const { t, tk } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const today = useToday();
  const idem = useIdempotencyKey();
  const errs = useFormErrors();
  const [method, setMethod] = useState<(typeof FUND_ACCOUNTS)[number]>('FLOAT');
  const [receivedOn, setReceivedOn] = useState(today);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState('');
  const [notes, setNotes] = useState('');
  const allocations = data.outstanding.map((r) => ({ r, paise: rupeesOrZero(alloc[r.id] ?? '') }));
  const extraPaise = rupeesOrZero(extra);
  const total = allocations.reduce((a, x) => a + (x.paise ?? 0), 0) + (extraPaise ?? 0);
  const m = useMutation({
    mutationFn: (body: unknown) =>
      api('/v1/commissions/receipts', { method: 'POST', body, idempotencyKey: idem.key() }),
    onSuccess: () => {
      idem.reset();
      toast('success', t('commissions.saved'));
      void qc.invalidateQueries({ queryKey: ['commissions'] });
      void qc.invalidateQueries({ queryKey: ['cashbook'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: errs.fromError,
  });
  const submit = () => {
    errs.clear();
    const fe: Record<string, string[]> = {};
    allocations.forEach((a, i) => {
      if (a.paise === null) fe[`allocations.${i}.amountPaise`] = [t('msg.money')];
      else if (a.paise > a.r.outstandingPaise)
        fe[`allocations.${i}.amountPaise`] = [t('msg.exceedsDue')];
    });
    if (extraPaise === null) fe.unallocatedPaise = [t('msg.money')];
    if (!Object.keys(fe).length && total === 0) fe._ = [t('dues.enterAmount')];
    if (Object.keys(fe).length) return errs.setFields(fe);
    m.mutate({
      method,
      receivedOn,
      allocations: allocations
        .filter((a) => a.paise && a.paise > 0)
        .map((a) => ({ recordId: a.r.id, amountPaise: a.paise! })),
      unallocatedPaise: extraPaise ?? 0,
      notes: notes.trim() || null,
    });
  };
  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={t('commission.receive')}
      description={t('commissions.receiveHelp')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={m.isPending}>
            {t('common.save')} · <Money paise={total} />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('commissions.receivedInto')}>
            {(p) => (
              <Select
                id={p.id}
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
              >
                {FUND_ACCOUNTS.map((a) => (
                  <option key={a} value={a}>
                    {tk(`account.${a}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('dues.receivedOn')}>
            {(p) => (
              <Input
                id={p.id}
                type="date"
                required
                max={today}
                value={receivedOn}
                onChange={(e) => setReceivedOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        {data.outstanding.length ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">{t('commissions.allocate')}</legend>
            {allocations.map((a, i) => (
              <div
                key={a.r.id}
                className="grid items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_170px]"
              >
                <div>
                  <p className="font-semibold">
                    #{a.r.recordNo} · <ServiceName code={a.r.serviceCode} />
                  </p>
                  <p className="text-sm text-fg-muted">
                    {t('commissions.outstanding')}: <Money paise={a.r.outstandingPaise} />{' '}
                    <button
                      type="button"
                      className="ml-1 font-semibold text-brand underline"
                      onClick={() =>
                        setAlloc((x) => ({ ...x, [a.r.id]: paiseToInput(a.r.outstandingPaise) }))
                      }
                    >
                      {t('commissions.fill')}
                    </button>
                  </p>
                </div>
                <Field label={t('common.amount')} error={errs.get(`allocations.${i}.amountPaise`)}>
                  {(p) => (
                    <MoneyInput
                      id={p.id}
                      invalid={p.invalid}
                      describedBy={p.describedBy}
                      value={alloc[a.r.id] ?? ''}
                      onChange={(v) => setAlloc((x) => ({ ...x, [a.r.id]: v }))}
                    />
                  )}
                </Field>
              </div>
            ))}
          </fieldset>
        ) : null}
        <Field
          label={t('commissions.unallocated')}
          help={t('commissions.unallocatedHelp')}
          optionalLabel={t('common.optional')}
          error={errs.get('unallocatedPaise')}
        >
          {(p) => (
            <MoneyInput
              id={p.id}
              invalid={p.invalid}
              describedBy={p.describedBy}
              value={extra}
              onChange={setExtra}
            />
          )}
        </Field>
        <Field label={t('common.notes')} optionalLabel={t('common.optional')}>
          {(p) => (
            <Textarea id={p.id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
        {errs.get('_') ? <Alert tone="danger">{errs.get('_')}</Alert> : null}
        {errs.formMessage && !Object.keys(errs.fields).length ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
