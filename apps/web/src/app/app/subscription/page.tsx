'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Crown, Minus, Send } from 'lucide-react';
import { formatDateTime, paymentSubmissionSchema } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  qk,
  useFormErrors,
  useIdempotencyKey,
  usePermissions,
  useToday,
  zodToFieldErrors,
} from '@/lib/hooks';
import type { PlanListItem, SubscriptionInfo } from '@/lib/types';
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
  Meter,
  Money,
  PageHeader,
  Select,
  Textarea,
  tableCls,
} from '@/components/ui';
import { QueryState } from '@/components/query-state';
import { MoneyInput, paiseToInput, rupeesOrZero } from '@/components/money-input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

export default function SubscriptionPage() {
  const { t, tk } = useI18n();
  const { can, ctx } = usePermissions();
  const sub = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api<SubscriptionInfo>('/v1/subscription'),
  });
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: () => api<{ items: PlanListItem[] }>('/v1/plans'),
  });
  const [cycle, setCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [selected, setSelected] = useState<string | null>(null);
  const tz = ctx?.tenant.timezone;

  return (
    <>
      <PageHeader title={t('plan.title')} description={t('subscription.help')} />
      <QueryState query={sub} rows={4}>
        {(s) => {
          const e = s.effective.entitlements;
          return (
            <div className="flex flex-col gap-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                <Card className="p-5">
                  <p className="text-sm font-semibold text-fg-muted">{t('plan.current')}</p>
                  <p
                    className="mt-1 flex items-center gap-2 text-3xl font-extrabold"
                    data-testid="current-plan"
                  >
                    <Crown aria-hidden className="size-7 text-brand-alt" />
                    {s.plan.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge
                      tone={
                        s.subscription.status === 'ACTIVE'
                          ? 'success'
                          : s.subscription.status === 'GRACE'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {tk(`subStatus.${s.subscription.status}`)}
                    </Badge>
                    {s.subscription.billingCycle !== 'NONE' ? (
                      <Badge>{tk(`cycle.${s.subscription.billingCycle}`)}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-4">
                    <DescList
                      items={[
                        s.subscription.currentPeriodEnd
                          ? {
                              label: t('subscription.periodEnds'),
                              value: formatDateTime(s.subscription.currentPeriodEnd, tz),
                            }
                          : null,
                        s.subscription.graceEndsAt
                          ? {
                              label: t('subscription.graceEnds'),
                              value: formatDateTime(s.subscription.graceEndsAt, tz),
                            }
                          : null,
                        s.subscription.scheduledChange
                          ? {
                              label: t('subscription.scheduled'),
                              value: `${s.subscription.scheduledChange.name} · ${formatDateTime(s.subscription.scheduledChange.at, tz)}`,
                            }
                          : null,
                      ]}
                    />
                  </div>
                  {s.effective.overrides.length ? (
                    <p className="mt-3 text-[13px] text-fg-muted">
                      {t('subscription.overrides', { n: s.effective.overrides.length })}
                    </p>
                  ) : null}
                  <p className="mt-3 text-[13px] text-fg-muted">{s.historyPolicy}</p>
                </Card>
                <Card className="p-5">
                  <h2 className="mb-1 font-bold">{t('plan.usage')}</h2>
                  <p className="mb-4 text-[13px] text-fg-muted">
                    {t('subscription.period', { period: s.usage.periodKey })}
                  </p>
                  <div className="flex flex-col gap-4" data-testid="usage-meters">
                    <Meter
                      label={t('subscription.recordsMonth')}
                      used={s.usage.recordsThisPeriod}
                      limit={e.monthlyRecordLimit}
                      unlimitedLabel={t('subscription.unlimited')}
                    />
                    <Meter
                      label={t('subscription.staff')}
                      used={s.usage.staff}
                      limit={e.staffLimit}
                      unlimitedLabel={t('subscription.unlimited')}
                    />
                    <Meter
                      label={t('subscription.services')}
                      used={s.usage.enabledServices}
                      limit={e.enabledServiceLimit}
                      unlimitedLabel={t('subscription.unlimited')}
                    />
                    <Meter
                      label={t('subscription.customServices')}
                      used={s.usage.customServices}
                      limit={e.customServiceLimit}
                      unlimitedLabel={t('subscription.unlimited')}
                    />
                    <Meter
                      label={t('subscription.storage')}
                      used={Math.ceil(s.usage.storageBytes / 1048576)}
                      limit={e.storageLimitMb}
                      unit="MB"
                      unlimitedLabel={t('subscription.unlimited')}
                    />
                  </div>
                  <ul className="mt-4 grid gap-1 text-sm sm:grid-cols-2" data-testid="features">
                    {(
                      [
                        'exportsEnabled',
                        'advancedReports',
                        'customBranding',
                        'connectorEligible',
                      ] as const
                    ).map((k) => (
                      <li key={k} className="flex items-center gap-2">
                        {e[k] ? (
                          <Check aria-hidden className="size-4 text-success" />
                        ) : (
                          <Minus aria-hidden className="size-4 text-fg-muted" />
                        )}
                        <span>{tk(`feature.${k}`)}</span>
                        <span className="sr-only">
                          {e[k] ? t('subscription.included') : t('subscription.notIncluded')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              <section aria-labelledby="plans-h">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 id="plans-h" className="text-lg font-bold">
                    {t('subscription.plans')}
                  </h2>
                  <div
                    role="radiogroup"
                    aria-label={t('subscription.cycle')}
                    className="flex rounded-[10px] border border-border bg-surface p-1"
                  >
                    {(['MONTHLY', 'ANNUAL'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={cycle === c}
                        onClick={() => setCycle(c)}
                        className={cn(
                          'min-h-9 rounded-lg px-3 text-sm font-semibold',
                          cycle === c ? 'bg-brand text-on-brand' : 'text-fg-muted',
                        )}
                      >
                        {tk(`cycle.${c}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <Alert tone="info" className="mb-4">
                  <span className="inline-flex items-start gap-2">
                    <span data-testid="demo-notice">{t('plan.demoNotice')}</span>
                  </span>
                </Alert>
                <QueryState query={plans}>
                  {(p) => (
                    <div className="grid gap-4 md:grid-cols-3">
                      {p.items.map((pl) => {
                        const q = pl.quotes[cycle];
                        const current = pl.code === s.effective.planCode;
                        const pe = pl.current.entitlements;
                        return (
                          <Card
                            key={pl.code}
                            className={cn('flex flex-col p-5', current && 'ring-2 ring-brand')}
                          >
                            <div className="flex items-center justify-between">
                              <h3 className="text-xl font-extrabold">{pl.current.name}</h3>
                              {current ? <Badge tone="brand">{t('plan.current')}</Badge> : null}
                            </div>
                            {pl.current.description ? (
                              <p className="mt-1 text-sm text-fg-muted">{pl.current.description}</p>
                            ) : null}
                            <p className="mt-3 text-3xl font-extrabold">
                              <Money paise={q.basePaise} />
                              <span className="text-sm font-medium text-fg-muted">
                                {' '}
                                / {tk(`cyclePer.${cycle}`)}
                              </span>
                            </p>
                            {q.totalPaise !== q.basePaise ? (
                              <p className="text-[13px] text-fg-muted">
                                {t('subscription.withTax', {
                                  rate: (q.taxRateBps / 100).toFixed(0),
                                })}
                                : <Money paise={q.totalPaise} />
                              </p>
                            ) : null}
                            <ul className="mt-4 flex flex-1 flex-col gap-1.5 text-sm">
                              <li>
                                {pe.monthlyRecordLimit === null
                                  ? t('subscription.unlimitedRecords')
                                  : t('subscription.recordsLimit', { n: pe.monthlyRecordLimit })}
                              </li>
                              <li>
                                {pe.staffLimit === null
                                  ? t('subscription.unlimitedStaff')
                                  : t('subscription.staffLimit', { n: pe.staffLimit })}
                              </li>
                              <li>
                                {pe.enabledServiceLimit === null
                                  ? t('subscription.allServices')
                                  : t('subscription.servicesLimit', { n: pe.enabledServiceLimit })}
                              </li>
                              {(
                                [
                                  'exportsEnabled',
                                  'advancedReports',
                                  'customBranding',
                                  'connectorEligible',
                                ] as const
                              ).map((k) => (
                                <li
                                  key={k}
                                  className={cn(
                                    'flex items-center gap-1.5',
                                    !pe[k] && 'text-fg-muted',
                                  )}
                                >
                                  {pe[k] ? (
                                    <Check aria-hidden className="size-4 text-success" />
                                  ) : (
                                    <Minus aria-hidden className="size-4" />
                                  )}
                                  {tk(`feature.${k}`)}
                                </li>
                              ))}
                            </ul>
                            {!pl.isDefault && can('subscription.manage') ? (
                              <Button
                                className="mt-4"
                                variant={current ? 'outline' : 'primary'}
                                onClick={() => setSelected(pl.code)}
                              >
                                {current
                                  ? t('subscription.renew')
                                  : t('subscription.choose', { plan: pl.current.name })}
                              </Button>
                            ) : null}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </QueryState>
              </section>

              {can('subscription.manage') && plans.data ? (
                <PaymentForm
                  plans={plans.data.items}
                  planCode={selected}
                  cycle={cycle}
                  onPlan={setSelected}
                />
              ) : null}

              <Card>
                <CardHeader title={t('subscription.submissions')} />
                {s.paymentSubmissions.length === 0 ? (
                  <EmptyState title={t('subscription.noSubmissions')} />
                ) : (
                  <div className={tableCls.wrap}>
                    <table className={tableCls.table} data-testid="submissions-table">
                      <thead>
                        <tr>
                          <th className={tableCls.th}>{t('subscription.submittedAt')}</th>
                          <th className={tableCls.th}>{t('subscription.cycle')}</th>
                          <th className={tableCls.th}>{t('subscription.method')}</th>
                          <th className={tableCls.th}>{t('subscription.reference')}</th>
                          <th className={cn(tableCls.th, 'text-right')}>{t('common.amount')}</th>
                          <th className={tableCls.th}>{t('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.paymentSubmissions.map((p) => (
                          <tr key={p.id}>
                            <td className={cn(tableCls.td, 'whitespace-nowrap')}>
                              {formatDateTime(p.createdAt, tz)}
                            </td>
                            <td className={tableCls.td}>{tk(`cycle.${p.billingCycle}`)}</td>
                            <td className={tableCls.td}>{tk(`payMethod.${p.method}`)}</td>
                            <td className={cn(tableCls.td, 'money')}>{p.payerReference}</td>
                            <td className={cn(tableCls.td, tableCls.num)}>
                              <Money paise={p.amountPaise} />
                              {p.amountPaise !== p.expectedPaise ? (
                                <span className="block text-xs text-warning">
                                  {t('subscription.expected')}: <Money paise={p.expectedPaise} />
                                </span>
                              ) : null}
                            </td>
                            <td className={tableCls.td}>
                              <Badge
                                tone={
                                  p.status === 'APPROVED'
                                    ? 'success'
                                    : p.status === 'REJECTED'
                                      ? 'danger'
                                      : 'info'
                                }
                              >
                                {tk(`submissionStatus.${p.status}`)}
                              </Badge>
                              {p.reviewNotes ? (
                                <span className="block text-xs text-fg-muted">{p.reviewNotes}</span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
              <Card>
                <CardHeader title={t('subscription.history')} />
                <ul className="divide-y divide-border">
                  {s.events.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                    >
                      <span className="font-medium">{tk(`subEvent.${ev.type}`)}</span>
                      <span className="text-fg-muted">
                        {formatDateTime(ev.createdAt, tz)} · {tk(`actor.${ev.actorType}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

function PaymentForm({
  plans,
  planCode,
  cycle: initialCycle,
  onPlan,
}: {
  plans: PlanListItem[];
  planCode: string | null;
  cycle: 'MONTHLY' | 'ANNUAL';
  onPlan: (c: string) => void;
}) {
  const { t, tk } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const today = useToday();
  const idem = useIdempotencyKey();
  const errs = useFormErrors();
  const paid = plans.filter((p) => !p.isDefault);
  const [plan, setPlan] = useState(planCode ?? paid[0]?.code ?? '');
  const [cycle, setCycle] = useState(initialCycle);
  const [method, setMethod] = useState<'UPI' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE'>('UPI');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => {
    if (planCode) setPlan(planCode);
  }, [planCode]);
  useEffect(() => setCycle(initialCycle), [initialCycle]);
  const quote = paid.find((p) => p.code === plan)?.quotes[cycle];
  useEffect(() => {
    if (quote) setAmount(paiseToInput(quote.totalPaise));
  }, [quote]);

  const m = useMutation({
    mutationFn: (body: unknown) =>
      api<{ amountMatchesQuote: boolean }>('/v1/subscription/payment-submissions', {
        method: 'POST',
        body,
        idempotencyKey: idem.key(),
      }),
    onSuccess: (r) => {
      idem.reset();
      setResult(
        r.amountMatchesQuote ? t('subscription.submitted') : t('subscription.submittedMismatch'),
      );
      toast('success', t('subscription.submitted'));
      setReference('');
      void qc.invalidateQueries({ queryKey: ['subscription'] });
      void qc.invalidateQueries({ queryKey: qk.context });
    },
    onError: errs.fromError,
  });
  const submit = () => {
    errs.clear();
    setResult(null);
    const paise = rupeesOrZero(amount);
    if (paise === null) return errs.setFields({ amountPaise: [t('msg.money')] });
    const body = {
      planCode: plan,
      billingCycle: cycle,
      method,
      payerReference: reference,
      paidOn,
      amountPaise: paise,
      notes: notes.trim() || null,
    };
    const r = paymentSubmissionSchema.safeParse(body);
    if (!r.success) return errs.setFields(zodToFieldErrors(r.error));
    m.mutate(body);
  };
  if (!paid.length) return null;
  return (
    <Card id="pay">
      <CardHeader title={t('plan.submitPayment')} description={t('subscription.payHelp')} />
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t('subscription.plan')} error={errs.get('planCode')}>
          {(p) => (
            <Select
              id={p.id}
              value={plan}
              onChange={(e) => {
                setPlan(e.target.value);
                onPlan(e.target.value);
              }}
            >
              {paid.map((pl) => (
                <option key={pl.code} value={pl.code}>
                  {pl.current.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('subscription.cycle')}>
          {(p) => (
            <Select
              id={p.id}
              value={cycle}
              onChange={(e) => setCycle(e.target.value as typeof cycle)}
            >
              {(['MONTHLY', 'ANNUAL'] as const).map((c) => (
                <option key={c} value={c}>
                  {tk(`cycle.${c}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('subscription.method')}>
          {(p) => (
            <Select
              id={p.id}
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              {(['UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE'] as const).map((x) => (
                <option key={x} value={x}>
                  {tk(`payMethod.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t('subscription.reference')}
          required
          help={t('subscription.referenceHelp')}
          error={errs.get('payerReference')}
        >
          {(p) => (
            <Input
              id={p.id}
              aria-invalid={p.invalid || undefined}
              aria-describedby={p.describedBy}
              value={reference}
              maxLength={60}
              onChange={(e) => setReference(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('subscription.paidOn')} error={errs.get('paidOn')}>
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
          label={t('subscription.amountPaid')}
          required
          error={errs.get('amountPaise')}
          help={quote ? t('subscription.quoteHelp') : undefined}
        >
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
        <Field
          label={t('common.notes')}
          optionalLabel={t('common.optional')}
          className="sm:col-span-2 lg:col-span-3"
        >
          {(p) => (
            <Textarea id={p.id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
        {quote ? (
          <p className="text-sm sm:col-span-2 lg:col-span-3">
            {t('subscription.amountDue')}: <Money paise={quote.totalPaise} className="font-bold" />{' '}
            ({t('subscription.base')} <Money paise={quote.basePaise} /> + {t('subscription.tax')}{' '}
            <Money paise={quote.taxPaise} />)
          </p>
        ) : null}
        {result ? (
          <Alert tone="success" className="sm:col-span-2 lg:col-span-3">
            <span data-testid="payment-submitted">{result}</span>
          </Alert>
        ) : null}
        {errs.formMessage && !Object.keys(errs.fields).length ? (
          <Alert tone="danger" className="sm:col-span-2 lg:col-span-3">
            {errs.formMessage}
          </Alert>
        ) : null}
        <div className="sm:col-span-2 lg:col-span-3">
          <Button
            onClick={submit}
            loading={m.isPending}
            icon={<Send aria-hidden className="size-4" />}
          >
            {t('subscription.submit')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
