'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ReceiptIndianRupee, RotateCcw } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  expenseCreateSchema,
  formatDate,
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
import type { Expense } from '@/lib/types';
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

export default function ExpensesPage() {
  const { t, tk } = useI18n();
  const { can } = usePermissions();
  const today = useToday();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [open, setOpen] = useState(false);
  const [reverse, setReverse] = useState<Expense | null>(null);
  const q = useQuery({
    queryKey: ['expenses', from, to],
    queryFn: () =>
      api<{ items: Expense[]; totalPaise: number }>('/v1/expenses', { query: { from, to } }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title={t('expense.title')}
        description={t('expenses.help')}
        actions={
          can('expenses.create') ? (
            <Button icon={<Plus aria-hidden className="size-4" />} onClick={() => setOpen(true)}>
              {t('expense.new')}
            </Button>
          ) : null
        }
      />
      <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
        <Field label={t('range.from')}>
          {(p) => (
            <Input id={p.id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          )}
        </Field>
        <Field label={t('range.to')}>
          {(p) => (
            <Input id={p.id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          )}
        </Field>
      </Card>
      <QueryState query={q}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                label={t('expenses.total')}
                tone="danger"
                value={<Money paise={d.totalPaise} />}
                help={t('expenses.totalHelp', { from: formatDate(from), to: formatDate(to) })}
              />
            </div>
            <Card>
              {d.items.length === 0 ? (
                <EmptyState
                  icon={<ReceiptIndianRupee aria-hidden className="size-6" />}
                  title={t('expenses.empty')}
                />
              ) : (
                <div className={tableCls.wrap}>
                  <table className={tableCls.table}>
                    <thead>
                      <tr>
                        <th className={tableCls.th}>{t('common.date')}</th>
                        <th className={tableCls.th}>{t('expense.category')}</th>
                        <th className={tableCls.th}>{t('expenses.vendor')}</th>
                        <th className={tableCls.th}>{t('expenses.paidFrom')}</th>
                        <th className={cn(tableCls.th, 'text-right')}>{t('common.amount')}</th>
                        <th className={tableCls.th}>
                          <span className="sr-only">{t('common.actions')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.items.map((e) => (
                        <tr key={e.id}>
                          <td className={cn(tableCls.td, 'whitespace-nowrap')}>
                            {formatDate(e.paidOn)}
                          </td>
                          <td className={tableCls.td}>
                            {tk(`expenseCategory.${e.category}`)}
                            {e.reversedAt ? (
                              <Badge tone="warning" className="ml-2">
                                {t('common.reversed')}
                              </Badge>
                            ) : null}
                            {e.notes ? (
                              <span className="block text-[13px] text-fg-muted">{e.notes}</span>
                            ) : null}
                          </td>
                          <td className={tableCls.td}>{e.vendor ?? '—'}</td>
                          <td className={tableCls.td}>{tk(`account.${e.method}`)}</td>
                          <td
                            className={cn(
                              tableCls.td,
                              tableCls.num,
                              e.reversedAt && 'line-through',
                            )}
                          >
                            <Money paise={e.amountPaise} />
                          </td>
                          <td className={tableCls.td}>
                            {can('expenses.reverse') && !e.reversedAt ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<RotateCcw aria-hidden className="size-4" />}
                                onClick={() => setReverse(e)}
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
              )}
            </Card>
          </div>
        )}
      </QueryState>
      {open ? <ExpenseDialog onClose={() => setOpen(false)} /> : null}
      {reverse ? <ReverseExpense e={reverse} onClose={() => setReverse(null)} /> : null}
    </>
  );
}

function ExpenseDialog({ onClose }: { onClose: () => void }) {
  const { t, tk } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const today = useToday();
  const idem = useIdempotencyKey();
  const errs = useFormErrors();
  const [category, setCategory] = useState<(typeof EXPENSE_CATEGORIES)[number]>('RENT');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof FUND_ACCOUNTS)[number]>('CASH');
  const [paidOn, setPaidOn] = useState(today);
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const m = useMutation({
    mutationFn: (body: unknown) =>
      api('/v1/expenses', { method: 'POST', body, idempotencyKey: idem.key() }),
    onSuccess: () => {
      idem.reset();
      toast('success', t('expenses.saved'));
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      void qc.invalidateQueries({ queryKey: ['cashbook'] });
      onClose();
    },
    onError: errs.fromError,
  });
  const submit = () => {
    errs.clear();
    const paise = rupeesOrZero(amount);
    if (paise === null) return errs.setFields({ amountPaise: [t('msg.money')] });
    const body = {
      category,
      amountPaise: paise,
      method,
      paidOn,
      vendor: vendor.trim() || null,
      notes: notes.trim() || null,
    };
    const r = expenseCreateSchema.safeParse(body);
    if (!r.success) return errs.setFields(zodToFieldErrors(r.error));
    m.mutate(body);
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('expense.new')}
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
        <Field label={t('expense.category')} required>
          {(p) => (
            <Select
              id={p.id}
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {tk(`expenseCategory.${c}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
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
        <Field label={t('expenses.paidFrom')}>
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
        <Field label={t('expenses.paidOn')} error={errs.get('paidOn')}>
          {(p) => (
            <Input
              id={p.id}
              type="date"
              max={today}
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t('expenses.vendor')}
          optionalLabel={t('common.optional')}
          error={errs.get('vendor')}
        >
          {(p) => (
            <Input
              id={p.id}
              value={vendor}
              maxLength={80}
              onChange={(e) => setVendor(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t('common.notes')}
          optionalLabel={t('common.optional')}
          error={errs.get('notes')}
          className="sm:col-span-2"
        >
          {(p) => (
            <Textarea id={p.id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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

function ReverseExpense({ e, onClose }: { e: Expense; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api(`/v1/expenses/${e.id}/reverse`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast('success', t('common.reversed'));
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      void qc.invalidateQueries({ queryKey: ['cashbook'] });
      onClose();
    },
    onError: (err) => toast('error', errorMessage(t, err)),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('expenses.reverseTitle')}
      description={t('expenses.reverseHelp')}
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
          <Textarea
            id={p.id}
            rows={3}
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
          />
        )}
      </Field>
    </Dialog>
  );
}
