'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, ReceiptText, RotateCcw } from 'lucide-react';
import { formatDate } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  errorMessage,
  useFormErrors,
  useIdempotencyKey,
  usePermissions,
  useToday,
} from '@/lib/hooks';
import type { CollectionJson, DueGroup } from '@/lib/types';
import {
  Alert,
  Badge,
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
import { Dialog, Drawer } from '@/components/ui/dialog';
import { accountForMethod, useMasters } from '@/lib/masters';
import { QueryState } from '@/components/query-state';
import { MoneyInput, paiseToInput, rupeesOrZero } from '@/components/money-input';
import { PaymentBadge, ServiceName } from '@/components/service';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

function DuesInner() {
  const { t } = useI18n();
  const { can } = usePermissions();
  const sp = useSearchParams();
  const focusCustomer = sp.get('customer');
  const [collectFor, setCollectFor] = useState<DueGroup | null>(null);
  const dues = useQuery({
    queryKey: ['dues'],
    queryFn: () => api<{ items: DueGroup[]; totalDuePaise: number }>('/v1/dues'),
  });
  const groups = useMemo(() => {
    const items = dues.data?.items ?? [];
    return focusCustomer
      ? [...items].sort((a, b) =>
          a.customerId === focusCustomer ? -1 : b.customerId === focusCustomer ? 1 : 0,
        )
      : items;
  }, [dues.data, focusCustomer]);

  return (
    <>
      <PageHeader title={t('dues.title')} description={t('dues.help')} />
      <QueryState query={dues}>
        {(d) => (
          <div className="flex flex-col gap-6">
            <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="text-sm font-semibold text-fg-muted">
                  {t('dashboard.outstandingDues')}
                </p>
                <p className="money text-3xl font-extrabold text-warning" data-testid="total-dues">
                  <Money paise={d.totalDuePaise} />
                </p>
              </div>
              <p className="max-w-md text-sm text-fg-muted">{t('dues.postedOnly')}</p>
            </Card>
            {groups.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<HandCoins aria-hidden className="size-6" />}
                  title={t('dues.none')}
                  description={t('dues.noneHelp')}
                />
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {groups.map((g) => (
                  <Card
                    key={g.customerId ?? g.records[0]?.id}
                    className={cn(
                      g.customerId && g.customerId === focusCustomer && 'ring-2 ring-brand',
                    )}
                  >
                    <CardHeader
                      title={
                        g.customerId ? (
                          <Link className="hover:underline" href={`/app/customers/${g.customerId}`}>
                            {g.customerName}
                          </Link>
                        ) : (
                          g.customerName
                        )
                      }
                      description={g.customerId ? undefined : t('common.walkIn')}
                      actions={
                        <>
                          <Money
                            paise={g.totalDuePaise}
                            className="text-lg font-extrabold text-warning"
                          />
                          {can('dues.collect') ? (
                            <Button size="sm" onClick={() => setCollectFor(g)}>
                              {t('dues.collect')}
                            </Button>
                          ) : null}
                        </>
                      }
                    />
                    <ul className="divide-y divide-border">
                      {g.records.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                          <Link
                            href={`/app/records/${r.id}`}
                            className="font-semibold text-brand hover:underline"
                          >
                            #{r.recordNo}
                          </Link>
                          <ServiceName code={r.serviceCode} />
                          <span className="text-sm text-fg-muted">{formatDate(r.txnDate)}</span>
                          <span className="ml-auto flex items-center gap-2">
                            <PaymentBadge status={r.paymentStatus} />
                            <Money paise={r.amountDuePaise} className="font-semibold" />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            )}
            <Receipts />
          </div>
        )}
      </QueryState>
      {collectFor ? <CollectDialog group={collectFor} onClose={() => setCollectFor(null)} /> : null}
    </>
  );
}

function CollectDialog({ group, onClose }: { group: DueGroup; onClose: () => void }) {
  const { t, tk } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const today = useToday();
  const idem = useIdempotencyKey();
  const errs = useFormErrors();
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(group.records.map((r) => [r.id, paiseToInput(r.amountDuePaise)])),
  );
  const masters = useMasters();
  // "CASH" | "UPI" | "BANK" or "mode:<name>" for a shop-defined payment mode.
  const [payWith, setPayWith] = useState<string>('CASH');
  const customMode = payWith.startsWith('mode:')
    ? masters.active('PAYMENT_MODE').find((x) => `mode:${x.name}` === payWith)
    : undefined;
  const method = (customMode ? (customMode.data.account === 'CASH' ? 'CASH' : 'UPI') : payWith) as
    'CASH' | 'UPI' | 'BANK';
  const [receivedOn, setReceivedOn] = useState(today);
  const [notes, setNotes] = useState('');
  const parsed = group.records.map((r) => ({ r, paise: rupeesOrZero(amounts[r.id] ?? '') }));
  const total = parsed.reduce((a, p) => a + (p.paise ?? 0), 0);
  const m = useMutation({
    mutationFn: (body: unknown) =>
      api<{ receiptNo: number }>('/v1/collections', {
        method: 'POST',
        body,
        idempotencyKey: idem.key(),
      }),
    onSuccess: (res) => {
      idem.reset();
      toast('success', t('dues.collected', { no: res.receiptNo }));
      void qc.invalidateQueries({ queryKey: ['dues'] });
      void qc.invalidateQueries({ queryKey: ['collections'] });
      void qc.invalidateQueries({ queryKey: ['records'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: errs.fromError,
  });
  const submit = () => {
    errs.clear();
    const fe: Record<string, string[]> = {};
    parsed.forEach((p, i) => {
      if (p.paise === null) fe[`allocations.${i}.amountPaise`] = [t('msg.money')];
      else if (p.paise > p.r.amountDuePaise)
        fe[`allocations.${i}.amountPaise`] = [t('msg.exceedsDue')];
    });
    const allocations = parsed
      .filter((p) => p.paise && p.paise > 0)
      .map((p) => ({ recordId: p.r.id, amountPaise: p.paise! }));
    if (!allocations.length) fe._ = [t('dues.enterAmount')];
    if (Object.keys(fe).length) return errs.setFields(fe);
    m.mutate({
      customerId: group.customerId,
      method,
      paymentMode: customMode?.name ?? null,
      receivedOn,
      notes: notes.trim() || null,
      allocations,
    });
  };
  return (
    <Drawer
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={t('dues.collectFrom', { name: group.customerName })}
      description={t('dues.collectHelp')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={m.isPending}>
            {t('dues.recordAmount')} <Money paise={total} />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('dues.allocate')}</legend>
          <div className="flex flex-col gap-3">
            {parsed.map((p, i) => (
              <div
                key={p.r.id}
                className="grid items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_180px]"
              >
                <div>
                  <p className="font-semibold">
                    #{p.r.recordNo} · <ServiceName code={p.r.serviceCode} />
                  </p>
                  <p className="text-sm text-fg-muted">
                    {formatDate(p.r.txnDate)} · {t('record.amountDue')}:{' '}
                    <Money paise={p.r.amountDuePaise} />
                  </p>
                </div>
                <Field
                  label={t('dues.collectNow')}
                  error={errs.get(`allocations.${i}.amountPaise`)}
                >
                  {(f) => (
                    <MoneyInput
                      id={f.id}
                      describedBy={f.describedBy}
                      invalid={f.invalid}
                      value={amounts[p.r.id] ?? ''}
                      onChange={(v) => setAmounts((a) => ({ ...a, [p.r.id]: v }))}
                    />
                  )}
                </Field>
              </div>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('record.paymentMethod')}>
            {(f) => (
              <Select id={f.id} value={payWith} onChange={(e) => setPayWith(e.target.value)}>
                {(['CASH', 'UPI', 'BANK'] as const).map((x) => (
                  <option key={x} value={x}>
                    {tk(`method.${x}`)}
                  </option>
                ))}
                {masters
                  .active('PAYMENT_MODE')
                  .filter(
                    (x) => x.data.account === 'CASH' || x.data.account === accountForMethod('BANK'),
                  )
                  .map((x) => (
                    <option key={x.id} value={`mode:${x.name}`}>
                      {x.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t('dues.receivedOn')} error={errs.get('receivedOn')}>
            {(f) => (
              <Input
                id={f.id}
                type="date"
                required
                max={today}
                value={receivedOn}
                onChange={(e) => setReceivedOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={t('common.notes')} optionalLabel={t('common.optional')}>
          {(f) => (
            <Textarea id={f.id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
        {errs.get('_') ? <Alert tone="danger">{errs.get('_')}</Alert> : null}
        {errs.formMessage && !Object.keys(errs.fields).length ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
      </div>
    </Drawer>
  );
}

function Receipts() {
  const { t, tk } = useI18n();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const [reverse, setReverse] = useState<CollectionJson | null>(null);
  const [reason, setReason] = useState('');
  const q = useQuery({
    queryKey: ['collections'],
    queryFn: () => api<{ items: CollectionJson[] }>('/v1/collections'),
  });
  const m = useMutation({
    mutationFn: (c: CollectionJson) =>
      api(`/v1/collections/${c.id}/reverse`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast('success', t('dues.reversed'));
      setReverse(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['dues'] });
      void qc.invalidateQueries({ queryKey: ['collections'] });
      void qc.invalidateQueries({ queryKey: ['records'] });
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const canReverse = can('dues.collect') && can('records.reverse');
  return (
    <Card>
      <CardHeader title={t('dues.receipts')} description={t('dues.receiptsHelp')} />
      <QueryState query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState
              icon={<ReceiptText aria-hidden className="size-6" />}
              title={t('dues.noReceipts')}
            />
          ) : (
            <div className={tableCls.wrap}>
              <table className={tableCls.table} data-testid="receipts-table">
                <thead>
                  <tr>
                    <th className={tableCls.th}>{t('dues.receiptNo')}</th>
                    <th className={tableCls.th}>{t('common.date')}</th>
                    <th className={tableCls.th}>{t('record.paymentMethod')}</th>
                    <th className={tableCls.th}>{t('dues.records')}</th>
                    <th className={cn(tableCls.th, 'text-right')}>{t('common.amount')}</th>
                    <th className={tableCls.th}>
                      <span className="sr-only">{t('common.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((c) => (
                    <tr key={c.id}>
                      <td className={tableCls.td}>
                        #{c.receiptNo}{' '}
                        {c.reversedAt ? <Badge tone="warning">{t('common.reversed')}</Badge> : null}
                      </td>
                      <td className={cn(tableCls.td, 'whitespace-nowrap')}>
                        {formatDate(c.receivedOn)}
                      </td>
                      <td className={tableCls.td}>{tk(`method.${c.method}`)}</td>
                      <td className={tableCls.td}>
                        {c.allocations.map((a) => (
                          <Link
                            key={a.recordId}
                            href={`/app/records/${a.recordId}`}
                            className="mr-2 text-brand hover:underline"
                          >
                            #{a.recordNo}
                          </Link>
                        ))}
                      </td>
                      <td className={cn(tableCls.td, tableCls.num, c.reversedAt && 'line-through')}>
                        <Money paise={c.amountPaise} />
                      </td>
                      <td className={tableCls.td}>
                        {canReverse && !c.reversedAt ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<RotateCcw aria-hidden className="size-4" />}
                            onClick={() => setReverse(c)}
                          >
                            {t('common.reverse')}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryState>
      <Dialog
        open={!!reverse}
        onOpenChange={(o) => !o && setReverse(null)}
        title={t('dues.reverseTitle', { no: reverse?.receiptNo ?? '' })}
        description={t('dues.reverseHelp')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReverse(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 3}
              loading={m.isPending}
              onClick={() => reverse && m.mutate(reverse)}
            >
              {t('common.reverse')}
            </Button>
          </>
        }
      >
        <Field label={t('recordDetail.reasonLabel')} required help={t('msg.reason')}>
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

export default function DuesPage() {
  return (
    <Suspense>
      <DuesInner />
    </Suspense>
  );
}
