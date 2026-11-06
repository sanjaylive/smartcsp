'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, BookOpen, Lock, PiggyBank, RotateCcw, Scale } from 'lucide-react';
import {
  cashAdjustmentSchema,
  formatDate,
  fundTransferSchema,
  openingBalanceSchema,
  FUND_ACCOUNTS,
} from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  errorMessage,
  useFormErrors,
  useIdempotencyKey,
  usePermissions,
  useToday,
  zodToFieldErrors,
} from '@/lib/hooks';
import type { Cashbook } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  Select,
  Stat,
  Textarea,
  tableCls,
} from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { QueryState } from '@/components/query-state';
import { MoneyInput, rupeesOrZero } from '@/components/money-input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

type Account = (typeof FUND_ACCOUNTS)[number];
type DialogKind = 'opening' | 'adjust' | 'transfer' | null;

function CashbookInner() {
  const { t, tk } = useI18n();
  const { can } = usePermissions();
  const today = useToday();
  const sp = useSearchParams();
  const router = useRouter();
  const [date, setDate] = useState(sp.get('date') ?? today);
  const [account, setAccount] = useState<Account>((sp.get('account') as Account) ?? 'CASH');
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [reverseId, setReverseId] = useState<string | null>(null);
  useEffect(() => {
    if (sp.get('opening') && can('cashbook.manage')) setDialog('opening');
  }, [sp, can]);
  const q = useQuery({
    queryKey: ['cashbook', date, account],
    queryFn: () => api<Cashbook>('/v1/cashbook', { query: { date, account } }),
    placeholderData: keepPreviousData,
  });
  const manage = can('cashbook.manage');

  return (
    <>
      <PageHeader
        title={t('cashbook.title')}
        description={t('cashbook.help')}
        actions={
          manage ? (
            <>
              <Button
                variant="outline"
                icon={<PiggyBank aria-hidden className="size-4" />}
                onClick={() => setDialog('opening')}
              >
                {t('cashbook.setOpening')}
              </Button>
              <Button
                variant="outline"
                icon={<Scale aria-hidden className="size-4" />}
                onClick={() => setDialog('adjust')}
              >
                {t('cashbook.adjust')}
              </Button>
              <Button
                variant="outline"
                icon={<ArrowLeftRight aria-hidden className="size-4" />}
                onClick={() => setDialog('transfer')}
              >
                {t('cashbook.transfer')}
              </Button>
            </>
          ) : null
        }
      />
      <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
        <Field label={t('common.date')}>
          {(p) => (
            <Input
              id={p.id}
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value || today)}
              className="w-44"
            />
          )}
        </Field>
        <div
          role="tablist"
          aria-label={t('cashbook.account')}
          className="flex rounded-[10px] border border-border p-1"
        >
          {FUND_ACCOUNTS.map((a) => (
            <button
              key={a}
              role="tab"
              type="button"
              aria-selected={account === a}
              onClick={() => setAccount(a)}
              className={cn(
                'min-h-9 rounded-lg px-3 text-sm font-semibold',
                account === a ? 'bg-brand text-on-brand' : 'text-fg-muted hover:bg-surface-muted',
              )}
            >
              {tk(`account.${a}`)}
            </button>
          ))}
        </div>
      </Card>
      <QueryState query={q} rows={5}>
        {(cb) => (
          <div className="flex flex-col gap-6">
            {cb.dayStatus !== 'OPEN' ? (
              <Alert tone={cb.dayStatus === 'CLOSED' ? 'info' : 'warning'}>
                <span className="inline-flex items-center gap-2">
                  <Lock aria-hidden className="size-4" />
                  {tk(`dayStatus.${cb.dayStatus}`)} ·{' '}
                  <Link href={`/app/closing?date=${cb.date}`} className="font-semibold underline">
                    {t('nav.closing')}
                  </Link>
                </span>
              </Alert>
            ) : null}
            <div
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
              data-testid="cashbook-summary"
            >
              <Stat
                label={t('cashbook.opening')}
                value={<Money paise={cb.openingBalancePaise} />}
                help={t('cashbook.openingHelp')}
              />
              <Stat
                label={t('cashbook.in')}
                tone="success"
                value={<Money paise={cb.totalInPaise} />}
              />
              <Stat
                label={t('cashbook.out')}
                tone="danger"
                value={<Money paise={cb.totalOutPaise} />}
              />
              <Stat
                label={t('cashbook.closing')}
                tone="brand"
                value={
                  <span data-testid="closing-balance">
                    <Money paise={cb.closingBalancePaise} />
                  </span>
                }
                help={t('cashbook.closingHelp', { date: formatDate(cb.date) })}
              />
            </div>
            <Card>
              {cb.items.length === 0 ? (
                <EmptyState
                  icon={<BookOpen aria-hidden className="size-6" />}
                  title={t('cashbook.empty')}
                  description={t('cashbook.emptyHelp')}
                />
              ) : (
                <div className={tableCls.wrap}>
                  <table className={tableCls.table} data-testid="cashbook-table">
                    <caption className="sr-only">
                      {t('cashbook.title')} · {tk(`account.${account}`)} · {formatDate(cb.date)}
                    </caption>
                    <thead>
                      <tr>
                        <th className={tableCls.th}>#</th>
                        <th className={tableCls.th}>{t('cashbook.description')}</th>
                        <th className={cn(tableCls.th, 'text-right')}>{t('cashbook.in')}</th>
                        <th className={cn(tableCls.th, 'text-right')}>{t('cashbook.out')}</th>
                        <th className={cn(tableCls.th, 'text-right')}>{t('cashbook.balance')}</th>
                        <th className={tableCls.th}>
                          <span className="sr-only">{t('common.actions')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cb.items.map((it, i) => {
                        const manual = ['OPENING_BALANCE', 'ADJUSTMENT', 'TRANSFER'].includes(
                          it.type,
                        );
                        return (
                          <tr key={`${it.entryId}-${i}`}>
                            <td className={cn(tableCls.td, 'money text-fg-muted')}>{it.entryNo}</td>
                            <td className={tableCls.td}>
                              <p className="font-medium">
                                {it.sourceType === 'record' && it.sourceId ? (
                                  <Link
                                    href={`/app/records/${it.sourceId}`}
                                    className="text-brand hover:underline"
                                  >
                                    {it.description}
                                  </Link>
                                ) : (
                                  it.description
                                )}
                              </p>
                              <p className="text-[13px] text-fg-muted">
                                {tk(`entryType.${it.type}`)}
                                {it.memo ? ` · ${it.memo}` : ''}
                                {it.reversed ? (
                                  <Badge tone="warning" className="ml-2">
                                    {t('common.reversed')}
                                  </Badge>
                                ) : null}
                              </p>
                            </td>
                            <td className={cn(tableCls.td, tableCls.num, 'text-success')}>
                              {it.inPaise ? <Money paise={it.inPaise} /> : ''}
                            </td>
                            <td className={cn(tableCls.td, tableCls.num, 'text-danger')}>
                              {it.outPaise ? <Money paise={it.outPaise} /> : ''}
                            </td>
                            <td className={cn(tableCls.td, tableCls.num, 'font-semibold')}>
                              <Money paise={it.balancePaise} />
                            </td>
                            <td className={tableCls.td}>
                              {manage && manual && !it.reversed && !it.isReversal ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<RotateCcw aria-hidden className="size-4" />}
                                  onClick={() => setReverseId(it.entryId)}
                                >
                                  {t('common.reverse')}
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-bold">
                {t('cashbook.allBalances', { date: formatDate(cb.date) })}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-3">
                {cb.fundBalances.map((b) => (
                  <li key={b.account} className="rounded-xl bg-surface-muted px-4 py-3">
                    <p className="text-sm text-fg-muted">{tk(`account.${b.account}`)}</p>
                    <p className="text-xl font-extrabold">
                      <Money paise={b.balancePaise} />
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </QueryState>
      {dialog ? (
        <EntryDialog
          kind={dialog}
          account={account}
          date={date}
          onClose={() => {
            setDialog(null);
            if (sp.get('opening')) router.replace('/app/cashbook');
          }}
        />
      ) : null}
      {reverseId ? <ReverseEntryDialog id={reverseId} onClose={() => setReverseId(null)} /> : null}
    </>
  );
}

function EntryDialog({
  kind,
  account: initialAccount,
  date,
  onClose,
}: {
  kind: Exclude<DialogKind, null>;
  account: Account;
  date: string;
  onClose: () => void;
}) {
  const { t, tk } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const today = useToday();
  const idem = useIdempotencyKey();
  const errs = useFormErrors();
  const [account, setAccount] = useState<Account>(initialAccount);
  const [to, setTo] = useState<Account>(initialAccount === 'CASH' ? 'BANK' : 'CASH');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [amount, setAmount] = useState('');
  const [businessDate, setBusinessDate] = useState(date);
  const [text, setText] = useState('');
  const title =
    kind === 'opening'
      ? t('cashbook.setOpening')
      : kind === 'adjust'
        ? t('cashbook.adjust')
        : t('cashbook.transfer');
  const path =
    kind === 'opening'
      ? '/v1/cashbook/opening'
      : kind === 'adjust'
        ? '/v1/cashbook/adjustments'
        : '/v1/cashbook/transfers';
  const m = useMutation({
    mutationFn: (body: unknown) => api(path, { method: 'POST', body, idempotencyKey: idem.key() }),
    onSuccess: () => {
      idem.reset();
      toast('success', t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['cashbook'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: errs.fromError,
  });
  const submit = () => {
    errs.clear();
    const paise = rupeesOrZero(amount);
    if (paise === null) return errs.setFields({ amountPaise: [t('msg.money')] });
    let body: Record<string, unknown>;
    let r;
    if (kind === 'opening') {
      body = { account, amountPaise: paise, businessDate, notes: text.trim() || null };
      r = openingBalanceSchema.safeParse(body);
    } else if (kind === 'adjust') {
      body = { account, direction, amountPaise: paise, businessDate, reason: text };
      r = cashAdjustmentSchema.safeParse(body);
    } else {
      body = { from: account, to, amountPaise: paise, businessDate, notes: text.trim() || null };
      r = fundTransferSchema.safeParse(body);
    }
    if (!r.success) return errs.setFields(zodToFieldErrors(r.error));
    m.mutate(body);
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={
        kind === 'opening'
          ? t('cashbook.openingDialogHelp')
          : kind === 'adjust'
            ? t('cashbook.adjustHelp')
            : t('cashbook.transferHelp')
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={m.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={kind === 'transfer' ? t('cashbook.from') : t('cashbook.account')}
          error={errs.get('account') ?? errs.get('from')}
        >
          {(p) => (
            <Select
              id={p.id}
              value={account}
              onChange={(e) => setAccount(e.target.value as Account)}
            >
              {FUND_ACCOUNTS.map((a) => (
                <option key={a} value={a}>
                  {tk(`account.${a}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {kind === 'transfer' ? (
          <Field label={t('cashbook.to')} error={errs.get('to')}>
            {(p) => (
              <Select
                id={p.id}
                aria-invalid={p.invalid || undefined}
                value={to}
                onChange={(e) => setTo(e.target.value as Account)}
              >
                {FUND_ACCOUNTS.map((a) => (
                  <option key={a} value={a}>
                    {tk(`account.${a}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {kind === 'adjust' ? (
          <Field label={t('cashbook.direction')}>
            {(p) => (
              <Select
                id={p.id}
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}
              >
                <option value="IN">{t('cashbook.adjustIn')}</option>
                <option value="OUT">{t('cashbook.adjustOut')}</option>
              </Select>
            )}
          </Field>
        ) : null}
        <Field label={t('common.amount')} required error={errs.get('amountPaise')}>
          {(p) => (
            <MoneyInput
              id={p.id}
              describedBy={p.describedBy}
              invalid={p.invalid}
              value={amount}
              onChange={setAmount}
            />
          )}
        </Field>
        <Field label={t('cashbook.businessDate')} required error={errs.get('businessDate')}>
          {(p) => (
            <Input
              id={p.id}
              type="date"
              max={today}
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={kind === 'adjust' ? t('recordDetail.reasonLabel') : t('common.notes')}
          required={kind === 'adjust'}
          optionalLabel={t('common.optional')}
          error={errs.get('reason') ?? errs.get('notes')}
          className="sm:col-span-2"
        >
          {(p) => (
            <Textarea
              id={p.id}
              aria-invalid={p.invalid || undefined}
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        {errs.formMessage && !Object.keys(errs.fields).length ? (
          <Alert tone="danger" className="sm:col-span-2">
            {errs.formMessage}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

function ReverseEntryDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api(`/v1/journal/${id}/reverse`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast('success', t('common.reversed'));
      void qc.invalidateQueries({ queryKey: ['cashbook'] });
      onClose();
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('cashbook.reverseTitle')}
      description={t('cashbook.reverseHelp')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={reason.trim().length < 3}
            loading={m.isPending}
            onClick={() => m.mutate()}
          >
            {t('common.reverse')}
          </Button>
        </>
      }
    >
      <Field label={t('recordDetail.reasonLabel')} required help={t('msg.reason')}>
        {(p) => (
          <Textarea id={p.id} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
      </Field>
    </Dialog>
  );
}

export default function CashbookPage() {
  return (
    <Suspense>
      <CashbookInner />
    </Suspense>
  );
}
