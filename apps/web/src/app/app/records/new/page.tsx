'use client';

import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Lock } from 'lucide-react';
import {
  buildDetailsSchema,
  customFieldsToFieldDefs,
  getService,
  initialStatuses,
  isPostableStatus,
  recordCreateSchema,
  type CustomFieldDef,
  type FieldDef,
  type OpStatus,
  type PrincipalDirection,
  type ServiceCode,
  type WorkflowType,
} from '@csp2all/shared';
import { api, isApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  useFormErrors,
  useIdempotencyKey,
  usePermissions,
  useToday,
  zodToFieldErrors,
  qk,
} from '@/lib/hooks';
import type { PostingPreview, RecordJson, TenantContext } from '@/lib/types';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Field,
  Input,
  Money,
  PageHeader,
  Select,
  Textarea,
  tableCls,
} from '@/components/ui';
import {
  DetailField,
  initialDetailValues,
  toDetails,
  type DetailValues,
} from '@/components/record-fields';
import { CustomerPicker, useDebounced, type CustomerChoice } from '@/components/customer-picker';
import { MoneyInput, paiseToInput, rupeesOrZero } from '@/components/money-input';
import { ServiceIcon, useServiceLabel } from '@/components/service';
import { UpgradeNotice } from '@/components/query-state';
import { cn } from '@/lib/cn';

interface Resolved {
  code: ServiceCode;
  customServiceId: string | null;
  name: string;
  workflow: WorkflowType;
  fields: FieldDef[];
  direction: (d: Record<string, unknown>) => PrincipalDirection;
  principalLabelKey: string | null;
  noticeKey?: string;
  defaultFeePaise: number;
}

function resolve(
  ctx: TenantContext,
  code: ServiceCode,
  customId: string | null,
  label: (c: string, n?: string | null) => string,
): Resolved | null {
  if (code === 'CUSTOM') {
    const cs = ctx.customServices.find((c) => c.id === customId && c.active);
    if (!cs) return null;
    return {
      code,
      customServiceId: cs.id,
      name: cs.name,
      workflow: cs.workflowType,
      fields: customFieldsToFieldDefs(cs.fields as CustomFieldDef[]),
      direction: () => cs.principalDirection,
      principalLabelKey: cs.principalDirection === 'NONE' ? null : 'record.principal.generic',
      defaultFeePaise: cs.defaultFeePaise,
    };
  }
  const def = getService(code);
  if (!def) return null;
  return {
    code,
    customServiceId: null,
    name: label(code),
    workflow: def.workflowType,
    fields: def.fields,
    direction: def.principalDirection,
    principalLabelKey: def.principalLabelKey,
    noticeKey: def.noticeKey,
    defaultFeePaise: 0,
  };
}

function ServicePicker({ ctx }: { ctx: TenantContext }) {
  const { t, tk } = useI18n();
  const label = useServiceLabel();
  const creatable = ctx.services.filter((s) => s.canCreate && s.code !== 'CUSTOM');
  const customOn = ctx.services.find((s) => s.code === 'CUSTOM')?.canCreate;
  const unavailable = ctx.services.filter((s) => !s.canCreate && (s.selected || s.hasHistory));
  return (
    <>
      <PageHeader title={t('nav.newRecord')} description={t('newRecord.pickService')} />
      {creatable.length === 0 && !customOn ? (
        <Alert tone="warning">{t('newRecord.noServices')}</Alert>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {creatable.map((s) => (
          <li key={s.code}>
            <Link
              href={`/app/records/new?service=${s.code}`}
              className="card flex min-h-20 items-center gap-3 p-4 hover:border-brand"
            >
              <ServiceIcon code={s.code} size="lg" />
              <span>
                <span className="block font-bold">{label(s.code)}</span>
                <span className="block text-sm text-fg-muted">
                  {tk(getService(s.code)?.descriptionKey ?? '')}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {customOn
          ? ctx.customServices
              .filter((c) => c.active)
              .map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/app/records/new?service=CUSTOM&custom=${c.id}`}
                    className="card flex min-h-20 items-center gap-3 p-4 hover:border-brand"
                  >
                    <ServiceIcon code="CUSTOM" size="lg" />
                    <span>
                      <span className="block font-bold">{c.name}</span>
                      <span className="block text-sm text-fg-muted">{c.category}</span>
                    </span>
                  </Link>
                </li>
              ))
          : null}
      </ul>
      {unavailable.length ? (
        <div className="mt-6">
          <h2 className="mb-2 font-bold">{t('newRecord.unavailableTitle')}</h2>
          <ul className="flex flex-col gap-2">
            {unavailable.map((s) => (
              <li
                key={s.code}
                className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3"
              >
                <ServiceIcon code={s.code} size="sm" />
                <span className="font-medium">{label(s.code)}</span>
                <span className="text-sm text-fg-muted">
                  — {tk(`service.unavailable.${s.reason}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function NewRecordInner() {
  const { t, tk } = useI18n();
  const params = useSearchParams();
  const { ctx, can } = usePermissions();
  const label = useServiceLabel();
  const code = params.get('service') as ServiceCode | null;
  const customId = params.get('custom');

  if (!ctx) return null;
  if (!can('records.create')) {
    return (
      <Alert tone="warning" title={t('state.permissionTitle')}>
        {t('service.unavailable.PERMISSION')}
      </Alert>
    );
  }
  if (!code || !getService(code)) return <ServicePicker ctx={ctx} />;
  const avail = ctx.services.find((s) => s.code === code);
  if (!avail?.canCreate) {
    return (
      <>
        <PageHeader
          title={t('record.new', { service: label(code) })}
          icon={<ServiceIcon code={code} size="lg" />}
        />
        <Alert
          tone="warning"
          title={t('newRecord.unavailable')}
          action={
            avail?.hasHistory ? (
              <ButtonLink href={`/app/records?service=${code}`} variant="outline">
                {t('newRecord.viewHistory')}
              </ButtonLink>
            ) : avail?.reason === 'PLAN' ? (
              <ButtonLink href="/app/subscription">{t('plan.upgrade')}</ButtonLink>
            ) : null
          }
        >
          <p data-testid="service-unavailable">
            {tk(`service.unavailable.${avail?.reason ?? 'PLATFORM'}`)}
          </p>
        </Alert>
      </>
    );
  }
  const svc = resolve(ctx, code, customId, label);
  if (!svc) {
    if (code === 'CUSTOM') return <ServicePicker ctx={ctx} />;
    return null;
  }
  return <RecordForm key={`${code}:${customId ?? ''}`} svc={svc} />;
}

function RecordForm({ svc }: { svc: Resolved }) {
  const { t, tk } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const today = useToday();
  const idem = useIdempotencyKey();
  const errs = useFormErrors();
  const [customer, setCustomer] = useState<CustomerChoice>({ kind: 'walkin', name: '' });
  const [txnDate, setTxnDate] = useState(today);
  const [opStatus, setOpStatus] = useState<OpStatus>(
    svc.workflow === 'TRANSACTION' ? 'SUCCESSFUL' : 'SUBMITTED',
  );
  const [details, setDetails] = useState<DetailValues>(() => initialDetailValues(svc.fields));
  const [principal, setPrincipal] = useState('');
  const [fee, setFee] = useState(paiseToInput(svc.defaultFeePaise));
  const [commission, setCommission] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'BANK' | 'NONE'>('CASH');
  const [principalMethod, setPrincipalMethod] = useState<'CASH' | 'UPI' | 'BANK'>('CASH');
  const [collected, setCollected] = useState('');
  const [collectedTouched, setCollectedTouched] = useState(false);
  const [externalRef, setExternalRef] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const canPost = can('records.post');
  const [post, setPost] = useState(canPost);
  const [busy, setBusy] = useState(false);

  const detailsObj = useMemo(() => toDetails(svc.fields, details), [svc.fields, details]);
  const direction = svc.direction(detailsObj);
  const principalPaise = direction === 'NONE' ? 0 : rupeesOrZero(principal);
  const feePaise = rupeesOrZero(fee);
  const commissionPaise = rupeesOrZero(commission);
  const receivable =
    principalPaise !== null && feePaise !== null
      ? direction === 'COLLECT'
        ? principalPaise + feePaise
        : feePaise
      : null;

  // Default "collected now" to the full amount owed until the operator edits it.
  useEffect(() => {
    if (!collectedTouched) setCollected(receivable ? paiseToInput(receivable) : '');
  }, [receivable, collectedTouched]);
  const collectedPaise = rupeesOrZero(collected);
  const postable = isPostableStatus(svc.workflow, opStatus);
  const willPost = canPost && post && postable;

  const body = {
    serviceCode: svc.code,
    customServiceId: svc.customServiceId,
    customerId: customer.kind === 'customer' ? customer.id : null,
    walkInName: customer.kind === 'walkin' && customer.name.trim() ? customer.name.trim() : null,
    txnDate,
    opStatus,
    principalPaise: principalPaise ?? 0,
    customerFeePaise: feePaise ?? 0,
    expectedCommissionPaise: commissionPaise ?? 0,
    paymentMethod,
    amountCollectedPaise: collectedPaise ?? 0,
    principalMethod,
    externalRef: externalRef.trim() || null,
    notes: notes.trim() || null,
    followUpDate: followUpDate || null,
    details: detailsObj,
    post: willPost,
  };
  const amountsValid =
    principalPaise !== null &&
    feePaise !== null &&
    commissionPaise !== null &&
    collectedPaise !== null;
  const previewBody = useDebounced(JSON.stringify(body), 400);
  const previewValid = useMemo(() => {
    const b = JSON.parse(previewBody);
    return (
      amountsValid &&
      recordCreateSchema.safeParse(b).success &&
      buildDetailsSchema(svc.fields).safeParse(b.details).success
    );
  }, [previewBody, amountsValid, svc.fields]);
  const preview = useQuery({
    queryKey: ['posting-preview', previewBody],
    queryFn: () =>
      api<PostingPreview>('/v1/records/posting-preview', {
        method: 'POST',
        body: JSON.parse(previewBody),
      }),
    enabled: willPost && previewValid,
    retry: false,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    errs.clear();
    const fe: Record<string, string[]> = {};
    if (principalPaise === null) fe.principalPaise = [t('msg.money')];
    if (feePaise === null) fe.customerFeePaise = [t('msg.money')];
    if (commissionPaise === null) fe.expectedCommissionPaise = [t('msg.money')];
    if (collectedPaise === null) fe.amountCollectedPaise = [t('msg.money')];
    const r = recordCreateSchema.safeParse(body);
    if (!r.success) Object.assign(fe, zodToFieldErrors(r.error));
    const d = buildDetailsSchema(svc.fields).safeParse(detailsObj);
    if (!d.success) Object.assign(fe, zodToFieldErrors(d.error, 'details.'));
    if (receivable !== null && collectedPaise !== null && collectedPaise > receivable)
      fe.amountCollectedPaise = [t('msg.exceedsOwed')];
    if (Object.keys(fe).length) {
      errs.setFields(fe);
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    try {
      const rec = await api<RecordJson>('/v1/records', {
        method: 'POST',
        body,
        idempotencyKey: idem.key(),
      });
      idem.reset();
      void qc.invalidateQueries({ queryKey: qk.context });
      void qc.invalidateQueries({ queryKey: ['records'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      router.push(`/app/records/${rec.id}?created=1`);
    } catch (err) {
      errs.fromError(err);
      setBusy(false);
      // A validation error means this submission was rejected: a corrected retry is a new request.
      if (isApiError(err) && err.status >= 400 && err.status < 500) idem.reset();
    }
  };

  const err = errs.formError;
  const statuses = initialStatuses(svc.workflow);
  const showPrincipal = svc.principalLabelKey !== null && direction !== 'NONE';
  const fieldErrs = Object.keys(errs.fields).length > 0;

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title={t('record.new', { service: svc.name })}
        icon={<ServiceIcon code={svc.code} size="lg" />}
        description={t('newRecord.subtitle')}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Alert tone="info" title={t('newRecord.manualTitle')}>
            <span className="inline-flex items-start gap-2">{t('record.manualNotice')}</span>
          </Alert>
          {svc.noticeKey ? (
            <Alert tone="warning" title={t('newRecord.privacyTitle')}>
              <span className="inline-flex items-start gap-2" data-testid="service-notice">
                {tk(svc.noticeKey)}
              </span>
            </Alert>
          ) : null}

          <Card className="p-5">
            <h2 className="mb-4 text-lg font-bold">{t('record.customer')}</h2>
            <CustomerPicker
              value={customer}
              onChange={setCustomer}
              error={errs.get('customerId') ?? errs.get('walkInName')}
            />
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-lg font-bold">{t('newRecord.serviceDetails')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={
                  svc.workflow === 'APPLICATION' ? t('record.applicationDate') : t('record.txnDate')
                }
                required
                error={errs.get('txnDate')}
              >
                {(p) => (
                  <Input
                    id={p.id}
                    type="date"
                    max={today}
                    aria-describedby={p.describedBy}
                    aria-invalid={p.invalid || undefined}
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('common.status')}
                required
                error={errs.get('opStatus')}
                help={opStatus === 'SUCCESSFUL' ? t('record.reportedSuccess') : undefined}
              >
                {(p) => (
                  <Select
                    id={p.id}
                    aria-describedby={p.describedBy}
                    value={opStatus}
                    onChange={(e) => setOpStatus(e.target.value as OpStatus)}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {tk(`status.${s}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {svc.fields.map((f) => (
                <DetailField
                  key={f.key}
                  field={f}
                  value={details[f.key]}
                  labelOverride={svc.code === 'CUSTOM' ? f.labelKey : undefined}
                  onChange={(v) => setDetails((d) => ({ ...d, [f.key]: v }))}
                  error={errs.get(`details.${f.key}`)}
                />
              ))}
              <Field
                label={t('record.externalRef')}
                optionalLabel={t('common.optional')}
                help={t('record.externalRefHelp')}
                error={errs.get('externalRef')}
              >
                {(p) => (
                  <Input
                    id={p.id}
                    aria-describedby={p.describedBy}
                    aria-invalid={p.invalid || undefined}
                    maxLength={60}
                    value={externalRef}
                    onChange={(e) => setExternalRef(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('record.followUpDate')}
                optionalLabel={t('common.optional')}
                help={t('newRecord.followUpHelp')}
                error={errs.get('followUpDate')}
              >
                {(p) => (
                  <Input
                    id={p.id}
                    type="date"
                    aria-describedby={p.describedBy}
                    aria-invalid={p.invalid || undefined}
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('common.notes')}
                optionalLabel={t('common.optional')}
                help={t('newRecord.notesHelp')}
                error={errs.get('notes')}
                className="sm:col-span-2"
              >
                {(p) => (
                  <Textarea
                    id={p.id}
                    aria-describedby={p.describedBy}
                    aria-invalid={p.invalid || undefined}
                    rows={2}
                    maxLength={1000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 text-lg font-bold">{t('newRecord.amounts')}</h2>
            <p className="mb-4 text-sm text-fg-muted">
              {direction === 'PAYOUT'
                ? t('newRecord.payoutHelp')
                : direction === 'COLLECT'
                  ? t('newRecord.collectHelp')
                  : t('newRecord.noneHelp')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {showPrincipal ? (
                <Field
                  label={tk(svc.principalLabelKey!)}
                  error={errs.get('principalPaise')}
                  help={t('newRecord.principalHelp')}
                >
                  {(p) => (
                    <MoneyInput
                      id={p.id}
                      name="principal"
                      describedBy={p.describedBy}
                      invalid={p.invalid}
                      value={principal}
                      onChange={setPrincipal}
                    />
                  )}
                </Field>
              ) : null}
              {showPrincipal ? (
                <Field
                  label={
                    direction === 'PAYOUT' ? t('newRecord.paidOutVia') : t('newRecord.principalVia')
                  }
                  error={errs.get('principalMethod')}
                >
                  {(p) => (
                    <Select
                      id={p.id}
                      value={principalMethod}
                      onChange={(e) =>
                        setPrincipalMethod(e.target.value as 'CASH' | 'UPI' | 'BANK')
                      }
                    >
                      {(['CASH', 'UPI', 'BANK'] as const).map((m) => (
                        <option key={m} value={m}>
                          {tk(`method.${m}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : null}
              <Field
                label={t('record.customerFee')}
                error={errs.get('customerFeePaise')}
                help={t('newRecord.feeHelp')}
              >
                {(p) => (
                  <MoneyInput
                    id={p.id}
                    name="fee"
                    describedBy={p.describedBy}
                    invalid={p.invalid}
                    value={fee}
                    onChange={setFee}
                  />
                )}
              </Field>
              <Field
                label={t('record.expectedCommission')}
                optionalLabel={t('common.optional')}
                error={errs.get('expectedCommissionPaise')}
                help={t('newRecord.commissionHelp')}
              >
                {(p) => (
                  <MoneyInput
                    id={p.id}
                    name="commission"
                    describedBy={p.describedBy}
                    invalid={p.invalid}
                    value={commission}
                    onChange={setCommission}
                  />
                )}
              </Field>
              <div className="rounded-xl bg-surface-muted px-4 py-3 sm:col-span-2">
                <p className="text-sm text-fg-muted">{t('newRecord.customerOwes')}</p>
                <p className="text-xl font-extrabold">
                  {receivable !== null ? <Money paise={receivable} /> : '—'}
                </p>
              </div>
              <Field
                label={t('record.amountCollected')}
                error={errs.get('amountCollectedPaise')}
                help={t('newRecord.collectedHelp')}
              >
                {(p) => (
                  <MoneyInput
                    id={p.id}
                    name="collected"
                    describedBy={p.describedBy}
                    invalid={p.invalid}
                    value={collected}
                    onChange={(v) => {
                      setCollectedTouched(true);
                      setCollected(v);
                    }}
                  />
                )}
              </Field>
              <Field label={t('record.paymentMethod')} error={errs.get('paymentMethod')}>
                {(p) => (
                  <Select
                    id={p.id}
                    aria-invalid={p.invalid || undefined}
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  >
                    {(['CASH', 'UPI', 'BANK', 'NONE'] as const).map((m) => (
                      <option key={m} value={m}>
                        {tk(`method.${m}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {receivable !== null && collectedPaise !== null && receivable - collectedPaise > 0 ? (
                <p
                  className="text-sm font-semibold text-warning sm:col-span-2"
                  data-testid="due-hint"
                >
                  {t('newRecord.willBeDue')} <Money paise={receivable - collectedPaise} />
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <h2 className="text-lg font-bold">{t('record.cashPreview')}</h2>
            {canPost ? (
              <div className="mt-3">
                <Checkbox
                  checked={post && postable}
                  disabled={!postable}
                  onChange={setPost}
                  label={<span className="font-semibold">{t('record.post')}</span>}
                  description={postable ? t('record.postHelp') : t('newRecord.notPostable')}
                />
              </div>
            ) : (
              <p className="mt-2 flex items-start gap-2 text-sm text-fg-muted">
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
                {t('newRecord.noPostPermission')}
              </p>
            )}
            {willPost ? (
              <div className="mt-4" aria-live="polite" data-testid="posting-preview">
                {!previewValid ? (
                  <p className="text-sm text-fg-muted">{t('newRecord.previewIncomplete')}</p>
                ) : preview.isFetching && !preview.data ? (
                  <p className="text-sm text-fg-muted">{t('common.loading')}</p>
                ) : preview.isError ? (
                  <p className="text-sm text-danger">
                    {isApiError(preview.error) ? preview.error.message : t('common.error')}
                  </p>
                ) : preview.data ? (
                  <PreviewView
                    p={preview.data}
                    principalCash={
                      direction === 'PAYOUT' && principalMethod === 'CASH'
                        ? (principalPaise ?? 0)
                        : 0
                    }
                    cashCollected={paymentMethod === 'CASH' ? (collectedPaise ?? 0) : 0}
                  />
                ) : null}
              </div>
            ) : null}
          </Card>
          {err && isApiError(err, 'QUOTA_EXCEEDED') ? <UpgradeNotice error={err} /> : null}
          {err && !isApiError(err, 'QUOTA_EXCEEDED') ? (
            <Alert tone="danger" title={fieldErrs ? t('error.VALIDATION_FAILED') : undefined}>
              {fieldErrs ? null : errs.formMessage}
            </Alert>
          ) : !err && fieldErrs ? (
            <Alert tone="danger">{t('error.VALIDATION_FAILED')}</Alert>
          ) : null}
          <Button type="submit" size="lg" loading={busy} className="w-full">
            {willPost ? t('newRecord.saveAndPost') : t('newRecord.save')}
          </Button>
          <ButtonLink href="/app/records" variant="ghost" className="w-full">
            {t('common.cancel')}
          </ButtonLink>
        </aside>
      </div>
    </form>
  );
}

function PreviewView({
  p,
  principalCash,
  cashCollected,
}: {
  p: PostingPreview;
  principalCash: number;
  cashCollected: number;
}) {
  const { t, tk } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-danger-bg px-3 py-2">
          <p className="flex items-center gap-1 text-xs font-semibold text-danger">
            <ArrowUpRight aria-hidden className="size-3.5" />
            {t('record.netCashToCustomer')}
          </p>
          <p className="text-lg font-extrabold" data-testid="cash-to-customer">
            <Money paise={principalCash} />
          </p>
        </div>
        <div className="rounded-xl bg-success-bg px-3 py-2">
          <p className="flex items-center gap-1 text-xs font-semibold text-success">
            <ArrowDownLeft aria-hidden className="size-3.5" />
            {t('record.netCashFromCustomer')}
          </p>
          <p className="text-lg font-extrabold" data-testid="cash-from-customer">
            <Money paise={cashCollected} />
          </p>
        </div>
      </div>
      <p className="text-sm">
        {t('newRecord.netCash')}{' '}
        <strong
          className={cn(
            p.cashEffectPaise < 0 ? 'text-danger' : p.cashEffectPaise > 0 ? 'text-success' : '',
          )}
        >
          <Money paise={p.cashEffectPaise} signed />
        </strong>
      </p>
      {p.amountDuePaise > 0 ? (
        <p className="text-sm">
          {t('record.amountDue')}: <Money paise={p.amountDuePaise} className="font-semibold" />
        </p>
      ) : null}
      <div className={tableCls.wrap}>
        <table className="w-full text-sm">
          <caption className="sr-only">{t('newRecord.entries')}</caption>
          <thead>
            <tr className="text-left text-xs text-fg-muted">
              <th className="py-1 font-semibold">{t('ledger.account')}</th>
              <th className="py-1 text-right font-semibold">{t('ledger.debit')}</th>
              <th className="py-1 text-right font-semibold">{t('ledger.credit')}</th>
            </tr>
          </thead>
          <tbody>
            {p.lines.map((l, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5">
                  {tk(`ledger.${l.account}`)}
                  {l.memo ? <span className="block text-xs text-fg-muted">{l.memo}</span> : null}
                </td>
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
      </div>
      <p className="text-xs text-fg-muted">{t('newRecord.principalNotIncome')}</p>
    </div>
  );
}

export default function NewRecordPage() {
  return (
    <Suspense>
      <NewRecordInner />
    </Suspense>
  );
}
