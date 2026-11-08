'use client';

/*
 * Step-by-step record entry. One flow for every service, with an extra Beneficiary step for money
 * transfers:  Service → Customer → Details → (Beneficiary) → Amount → Review.
 * Shown as its own page at /app/records/new (a drawer layout also exists for reuse, but records
 * use the page so a stray click elsewhere can't close a half-filled form).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Landmark,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import {
  beneficiaryCreateSchema,
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
import { useDebounced } from '@/lib/use-debounced';
import { useMasters } from '@/lib/masters';
import type {
  Beneficiary,
  CustomerDetail,
  PostingPreview,
  RecordJson,
  TenantContext,
} from '@/lib/types';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Money,
  Select,
  Textarea,
  tableCls,
} from './ui';
import { Drawer, StepBar } from './ui/dialog';
import { DetailField, initialDetailValues, toDetails, type DetailValues } from './record-fields';
import { CustomerPicker, type CustomerChoice } from './customer-picker';
import { MoneyInput, paiseToInput, rupeesOrZero } from './money-input';
import { ServiceIcon, useServiceLabel } from './service';
import { UpgradeNotice } from './query-state';
import { KycBadge, KycDrawer } from './customer-kyc';
import { useToast } from './ui/toast';
import { cn } from '@/lib/cn';

/* ----------------------------------------------------------------------------- service resolution */

export interface Resolved {
  code: ServiceCode;
  customServiceId: string | null;
  name: string;
  workflow: WorkflowType;
  fields: FieldDef[];
  direction: (d: Record<string, unknown>) => PrincipalDirection;
  principalLabelKey: string | null;
  defaultFeePaise: number;
}

export function resolveService(
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
    defaultFeePaise: 0,
  };
}

/* ----------------------------------------------------------------------------- entry links */

/**
 * Link to the record flow. Records open on their own page (not a drawer), so a stray click
 * elsewhere can never close a half-filled record.
 */
export function NewRecordLink({
  href,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <Link href={href} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}

/* ----------------------------------------------------------------------------- frame */

function Frame({
  layout,
  title,
  description,
  icon,
  steps,
  footer,
  onClose,
  children,
}: {
  layout: 'drawer' | 'page';
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  steps?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  if (layout === 'drawer')
    return (
      <Drawer
        open
        onOpenChange={(o) => !o && onClose()}
        size="xl"
        title={title}
        description={description}
        icon={icon}
        steps={steps}
        footer={footer}
      >
        {children}
      </Drawer>
    );
  return (
    <Card className="mx-auto max-w-3xl overflow-hidden">
      <div className="flex items-start gap-3 px-5 pt-5 pb-3">
        {icon}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold tracking-tight">{title}</h1>
          {description ? <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p> : null}
        </div>
      </div>
      {steps ? <div className="px-5 pb-3">{steps}</div> : null}
      <div className="border-t border-border px-5 py-5">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-muted/50 px-5 py-3">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

/* ----------------------------------------------------------------------------- wizard */

export function RecordWizard({
  layout,
  initialCode,
  initialCustomId,
  onClose,
}: {
  layout: 'drawer' | 'page';
  initialCode: ServiceCode | null;
  initialCustomId: string | null;
  onClose: () => void;
}) {
  const { t, tk } = useI18n();
  const { ctx, can } = usePermissions();
  const label = useServiceLabel();
  const [pick, setPick] = useState<{ code: ServiceCode; custom: string | null } | null>(
    initialCode && getService(initialCode) ? { code: initialCode, custom: initialCustomId } : null,
  );
  const preselected = !!initialCode;
  if (!ctx) return null;

  const blocked = (body: ReactNode) => (
    <Frame layout={layout} title={t('nav.newRecord')} onClose={onClose}>
      {body}
    </Frame>
  );
  if (!can('records.create'))
    return blocked(
      <Alert tone="warning" title={t('state.permissionTitle')}>
        {t('service.unavailable.PERMISSION')}
      </Alert>,
    );

  if (pick) {
    const avail = ctx.services.find((s) => s.code === pick.code);
    if (!avail?.canCreate)
      return blocked(
        <Alert tone="warning" title={t('newRecord.unavailable')}>
          <p data-testid="service-unavailable">
            {tk(`service.unavailable.${avail?.reason ?? 'PLATFORM'}`)}
          </p>
        </Alert>,
      );
    const svc = resolveService(ctx, pick.code, pick.custom, label);
    if (svc)
      return (
        <RecordSteps
          key={`${pick.code}:${pick.custom ?? ''}`}
          layout={layout}
          svc={svc}
          onClose={onClose}
          onChangeService={preselected ? undefined : () => setPick(null)}
        />
      );
  }

  return (
    <Frame
      layout={layout}
      title={t('nav.newRecord')}
      description={t('newRecord.pickService')}
      onClose={onClose}
      icon={
        <span className="grid size-10 place-items-center rounded-xl bg-brand text-on-brand">
          <Plus aria-hidden className="size-5" />
        </span>
      }
    >
      <ServiceGrid ctx={ctx} onPick={(code, custom) => setPick({ code, custom })} />
    </Frame>
  );
}

function ServiceGrid({
  ctx,
  onPick,
}: {
  ctx: TenantContext;
  onPick: (c: ServiceCode, custom: string | null) => void;
}) {
  const { t, tk } = useI18n();
  const label = useServiceLabel();
  const [q, setQ] = useState('');
  const creatable = ctx.services.filter((s) => s.canCreate && s.code !== 'CUSTOM');
  const customOn = ctx.services.find((s) => s.code === 'CUSTOM')?.canCreate;
  const items = [
    ...creatable.map((s) => ({
      key: s.code,
      code: s.code,
      custom: null as string | null,
      name: label(s.code),
      sub: tk(getService(s.code)?.descriptionKey ?? ''),
    })),
    ...(customOn
      ? ctx.customServices
          .filter((c) => c.active)
          .map((c) => ({
            key: c.id,
            code: 'CUSTOM' as ServiceCode,
            custom: c.id,
            name: c.name,
            sub: c.category,
          }))
      : []),
  ].filter((i) => !q.trim() || `${i.name} ${i.sub}`.toLowerCase().includes(q.trim().toLowerCase()));

  if (!creatable.length && !customOn)
    return <Alert tone="warning">{t('newRecord.noServices')}</Alert>;
  return (
    <div className="flex flex-col gap-4">
      {creatable.length + ctx.customServices.length > 6 ? (
        <Input
          placeholder="Search services…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      ) : null}
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.key}>
            <button
              type="button"
              onClick={() => onPick(i.code, i.custom)}
              className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md"
            >
              <ServiceIcon code={i.code} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{i.name}</span>
                <span className="line-clamp-1 block text-xs text-fg-muted">{i.sub}</span>
              </span>
              <ArrowRight
                aria-hidden
                className="size-4 text-fg-muted transition group-hover:translate-x-0.5 group-hover:text-brand"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------------------------- the steps */

type StepKey = 'customer' | 'details' | 'beneficiary' | 'amount' | 'review';
const BENEFICIARY_KEYS = ['beneficiaryName', 'bankName', 'accountNumber', 'ifsc'];
const AMOUNT_KEYS = [
  'principalPaise',
  'customerFeePaise',
  'expectedCommissionPaise',
  'amountCollectedPaise',
  'paymentMethod',
  'principalMethod',
  'paymentMode',
];

function RecordSteps({
  layout,
  svc,
  onClose,
  onChangeService,
}: {
  layout: 'drawer' | 'page';
  svc: Resolved;
  onClose: () => void;
  onChangeService?: () => void;
}) {
  const { t, tk } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = usePermissions();
  const today = useToday();
  const idem = useIdempotencyKey();
  const errs = useFormErrors();
  const masters = useMasters();
  const isDmt = svc.code === 'DMT';

  const steps: { key: StepKey; label: string }[] = [
    { key: 'customer', label: t('record.customer') },
    { key: 'details', label: isDmt ? 'Sender' : 'Details' },
    ...(isDmt ? [{ key: 'beneficiary' as const, label: 'Beneficiary' }] : []),
    { key: 'amount', label: isDmt ? 'Transfer' : 'Amount' },
    { key: 'review', label: 'Review' },
  ];
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx]!.key;

  // ---- form state
  const [customer, setCustomer] = useState<CustomerChoice>({ kind: 'walkin', name: '' });
  const [txnDate, setTxnDate] = useState(today);
  const [opStatus, setOpStatus] = useState<OpStatus>(
    svc.workflow === 'TRANSACTION' ? 'SUCCESSFUL' : 'SUBMITTED',
  );
  const [details, setDetails] = useState<DetailValues>(() => initialDetailValues(svc.fields));
  const [principal, setPrincipal] = useState('');
  const [fee, setFee] = useState(paiseToInput(svc.defaultFeePaise));
  const [feeTouched, setFeeTouched] = useState(false);
  const [commission, setCommission] = useState('');
  // "CASH" | "UPI" | "BANK" | "NONE" or "mode:<name>" for a shop-defined payment mode.
  const [payWith, setPayWith] = useState('CASH');
  const [principalMethod, setPrincipalMethod] = useState<'CASH' | 'UPI' | 'BANK'>('CASH');
  const [collected, setCollected] = useState('');
  const [collectedTouched, setCollectedTouched] = useState(false);
  const [provider, setProvider] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const canPost = can('records.post');
  const [post, setPost] = useState(canPost);
  const [busy, setBusy] = useState(false);
  const [beneficiaryId, setBeneficiaryId] = useState<string | 'new' | null>(null);
  const [saveBeneficiary, setSaveBeneficiary] = useState(true);
  const [kycOpen, setKycOpen] = useState(false);

  const customerId = customer.kind === 'customer' ? customer.id : null;
  const cust = useQuery({
    queryKey: ['customers', 'detail', customerId],
    queryFn: () => api<CustomerDetail>(`/v1/customers/${customerId}`),
    enabled: !!customerId && can('customers.view'),
  });
  const bens = useQuery({
    queryKey: ['customers', customerId, 'beneficiaries'],
    queryFn: () => api<{ items: Beneficiary[] }>(`/v1/customers/${customerId}/beneficiaries`),
    enabled: isDmt && !!customerId && can('customers.view'),
  });
  const activeBens = (bens.data?.items ?? []).filter((b) => b.active);

  // DMT: the sender is usually the customer — prefill once we know who they are.
  useEffect(() => {
    if (!isDmt || !cust.data) return;
    setDetails((d) => ({
      ...d,
      senderName: d.senderName ? d.senderName : cust.data.name,
      senderMobile:
        d.senderMobile || cust.data.phoneMasked || !cust.data.phone
          ? d.senderMobile
          : cust.data.phone,
    }));
  }, [isDmt, cust.data]);

  // Walk-in DMT: the walk-in name is the sender.
  useEffect(() => {
    if (!isDmt || customer.kind !== 'walkin') return;
    setDetails((d) => (d.senderNameTouched ? d : { ...d, senderName: customer.name }));
  }, [isDmt, customer]);

  // Default to the most recently used saved beneficiary.
  useEffect(() => {
    if (!isDmt) return;
    if (activeBens.length && beneficiaryId === null) setBeneficiaryId(activeBens[0]!.id);
    if (!customerId && beneficiaryId !== 'new') setBeneficiaryId('new');
  }, [isDmt, activeBens, beneficiaryId, customerId]);

  const pickBeneficiary = (b: Beneficiary | 'new') => {
    setBeneficiaryId(b === 'new' ? 'new' : b.id);
    setDetails((d) => ({
      ...d,
      beneficiaryName: b === 'new' ? '' : b.name,
      bankName: b === 'new' ? '' : b.bankName,
      accountNumber: b === 'new' ? '' : b.accountNumber,
      ifsc: b === 'new' ? '' : (b.ifsc ?? ''),
    }));
  };
  useEffect(() => {
    const b = activeBens.find((x) => x.id === beneficiaryId);
    if (b && !details.beneficiaryName) pickBeneficiary(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beneficiaryId, activeBens]);

  // ---- derived amounts
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

  // Fee presets (Settings → Masters) fill the fee until the operator types their own.
  const preset = principalPaise ? masters.feeFor(svc.code, principalPaise) : null;
  useEffect(() => {
    if (!feeTouched && preset) setFee(paiseToInput(preset.fee));
  }, [preset?.fee, feeTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!collectedTouched) setCollected(receivable ? paiseToInput(receivable) : '');
  }, [receivable, collectedTouched]);
  const collectedPaise = rupeesOrZero(collected);

  const customMode = payWith.startsWith('mode:')
    ? masters.active('PAYMENT_MODE').find((m) => `mode:${m.name}` === payWith)
    : undefined;
  const paymentMethod = (
    customMode ? (customMode.data.account === 'CASH' ? 'CASH' : 'UPI') : payWith
  ) as 'CASH' | 'UPI' | 'BANK' | 'NONE';
  const postable = isPostableStatus(svc.workflow, opStatus);
  const willPost = canPost && post && postable;
  const providers = masters.providersFor(svc.code);

  const body = {
    serviceCode: svc.code,
    customServiceId: svc.customServiceId,
    customerId,
    walkInName: customer.kind === 'walkin' && customer.name.trim() ? customer.name.trim() : null,
    txnDate,
    opStatus,
    principalPaise: principalPaise ?? 0,
    customerFeePaise: feePaise ?? 0,
    expectedCommissionPaise: commissionPaise ?? 0,
    paymentMethod,
    paymentMode: customMode?.name ?? null,
    provider: provider || null,
    amountCollectedPaise: collectedPaise ?? 0,
    principalMethod,
    externalRef: externalRef.trim() || null,
    notes: notes.trim() || null,
    followUpDate: followUpDate || null,
    details: detailsObj,
    post: willPost,
  };

  // ---- validation, step by step
  const stepOf = (key: string): StepKey => {
    if (key === 'customerId' || key === 'walkInName') return 'customer';
    if (key.startsWith('details.')) {
      const f = key.slice(8);
      if (isDmt && BENEFICIARY_KEYS.includes(f)) return 'beneficiary';
      if (isDmt && f === 'transferMode') return 'amount';
      return 'details';
    }
    if (AMOUNT_KEYS.includes(key)) return 'amount';
    return 'details';
  };
  const validate = () => {
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
    return fe;
  };
  const goNext = () => {
    errs.clear();
    const fe = Object.fromEntries(Object.entries(validate()).filter(([k]) => stepOf(k) === step));
    if (Object.keys(fe).length) {
      errs.setFields(fe);
      return;
    }
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  };
  const goBack = () => {
    errs.clear();
    if (stepIdx === 0) onChangeService?.();
    else setStepIdx((i) => i - 1);
  };
  const jumpToErrors = (fe: Record<string, unknown>) => {
    const first = Object.keys(fe)
      .map(stepOf)
      .map((k) => steps.findIndex((s) => s.key === k))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];
    if (first !== undefined) setStepIdx(first);
  };

  // ---- preview (review step)
  const amountsValid =
    principalPaise !== null &&
    feePaise !== null &&
    commissionPaise !== null &&
    collectedPaise !== null;
  const previewBody = useDebounced(JSON.stringify(body), 300);
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
    enabled: step === 'review' && willPost && previewValid,
    retry: false,
  });

  const save = async () => {
    errs.clear();
    const fe = validate();
    if (Object.keys(fe).length) {
      errs.setFields(fe);
      jumpToErrors(fe);
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
      // Remember a new DMT beneficiary for next time (best effort; never blocks the record).
      if (
        isDmt &&
        customerId &&
        beneficiaryId === 'new' &&
        saveBeneficiary &&
        can('customers.manage')
      ) {
        const b = beneficiaryCreateSchema.safeParse({
          name: detailsObj.beneficiaryName,
          bankName: detailsObj.bankName,
          accountNumber: detailsObj.accountNumber,
          ifsc: detailsObj.ifsc || null,
        });
        if (b.success)
          await api(`/v1/customers/${customerId}/beneficiaries`, {
            method: 'POST',
            body: b.data,
          }).catch(() => undefined);
      }
      void qc.invalidateQueries({ queryKey: qk.context });
      void qc.invalidateQueries({ queryKey: ['records'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
      toast('success', `Record #${rec.recordNo} saved`);
      if (layout === 'drawer') onClose();
      router.push(`/app/records/${rec.id}?created=1`);
    } catch (err) {
      errs.fromError(err);
      setBusy(false);
      if (isApiError(err)) {
        if (err.status >= 400 && err.status < 500) idem.reset();
        jumpToErrors(err.fields ?? {});
      }
    }
  };

  // ---- render helpers
  const statuses = initialStatuses(svc.workflow);
  const showPrincipal = svc.principalLabelKey !== null && direction !== 'NONE';
  const detailFields = svc.fields.filter(
    (f) => !(isDmt && (BENEFICIARY_KEYS.includes(f.key) || f.key === 'transferMode')),
  );
  const fieldFor = (key: string) => svc.fields.find((f) => f.key === key);
  const renderDetail = (f: FieldDef) => (
    <DetailField
      key={f.key}
      field={f}
      value={details[f.key]}
      labelOverride={svc.code === 'CUSTOM' ? f.labelKey : undefined}
      onChange={(v) => {
        setDetails((d) => ({
          ...d,
          [f.key]: v,
          ...(f.key === 'senderName' ? { senderNameTouched: true } : {}),
        }));
        clearErr(`details.${f.key}`);
      }}
      error={errs.get(`details.${f.key}`)}
    />
  );
  // Warn before a refresh or tab close throws away a half-filled record.
  const dirty =
    stepIdx > 0 || customer.kind === 'customer' || !!customer.name.trim() || !!principal.trim();
  useEffect(() => {
    if (!dirty || busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);

  /** Drop a field's error as soon as it is edited, so stale messages don't linger. */
  const clearErr = (key: string) => {
    if (errs.fields[key])
      errs.setFields(Object.fromEntries(Object.entries(errs.fields).filter(([k]) => k !== key)));
  };
  const isLast = stepIdx === steps.length - 1;
  const err = errs.formError;
  const fieldErrs = Object.keys(errs.fields).length > 0;

  const footer = (
    <>
      {stepIdx > 0 || onChangeService ? (
        <Button
          variant="ghost"
          className="mr-auto"
          icon={<ArrowLeft aria-hidden className="size-4" />}
          onClick={goBack}
        >
          {stepIdx === 0 ? 'Change service' : t('common.back')}
        </Button>
      ) : (
        <Button variant="ghost" className="mr-auto" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      )}
      {isLast ? (
        <Button onClick={save} loading={busy} icon={<Check aria-hidden className="size-4" />}>
          {willPost ? t('newRecord.saveAndPost') : t('newRecord.save')}
        </Button>
      ) : (
        <Button onClick={goNext}>
          Continue <ArrowRight aria-hidden className="size-4" />
        </Button>
      )}
    </>
  );

  return (
    <Frame
      layout={layout}
      title={t('record.new', { service: svc.name })}
      description={`Step ${stepIdx + 1} of ${steps.length} · ${steps[stepIdx]!.label}`}
      icon={<ServiceIcon code={svc.code} size="lg" />}
      steps={
        <StepBar
          steps={steps.map((s) => s.label)}
          current={stepIdx}
          onStep={(i) => (errs.clear(), setStepIdx(i))}
        />
      }
      footer={footer}
      onClose={onClose}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (isLast) void save();
          else goNext();
        }}
        className="animate-rise"
        key={step}
      >
        {/* ------------------------------------------------ customer */}
        {step === 'customer' ? (
          <div className="flex flex-col gap-4">
            <StepIntro
              icon={UserRound}
              title={isDmt ? 'Who is sending the money?' : 'Who is this for?'}
              text={
                isDmt
                  ? 'Find the customer or add them. Their KYC status shows here.'
                  : 'Find a saved customer, add a new one, or type a walk-in name.'
              }
            />
            <CustomerPicker
              value={customer}
              onChange={setCustomer}
              error={errs.get('customerId') ?? errs.get('walkInName')}
            />
            {customerId && cust.data ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-muted/40 px-3.5 py-3">
                <KycBadge kyc={cust.data.kyc} />
                {cust.data.outstandingDuePaise > 0 ? (
                  <span className="text-xs font-semibold text-warning">
                    Pending dues <Money paise={cust.data.outstandingDuePaise} />
                  </span>
                ) : null}
                {can('customers.manage') && can('customers.view_sensitive') ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    icon={<ShieldCheck aria-hidden className="size-4" />}
                    onClick={() => setKycOpen(true)}
                  >
                    {cust.data.kyc?.status === 'VERIFIED' ? 'View KYC' : 'Do KYC'}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {isDmt && customerId && cust.data && cust.data.kyc?.status !== 'VERIFIED' ? (
              <Alert tone="warning">
                Money transfer usually needs the sender&apos;s KYC. You can still continue.
              </Alert>
            ) : null}
            {kycOpen && customerId ? (
              <KycDrawer
                customerId={customerId}
                customerName={customer.kind === 'customer' ? customer.name : ''}
                onClose={() => {
                  setKycOpen(false);
                  void cust.refetch();
                }}
              />
            ) : null}
          </div>
        ) : null}

        {/* ------------------------------------------------ details / sender */}
        {step === 'details' ? (
          <div className="flex flex-col gap-4">
            <StepIntro
              icon={isDmt ? UserRound : Sparkles}
              title={isDmt ? 'Sender details' : 'Service details'}
              text={
                isDmt
                  ? 'Filled from the customer — check and correct if needed.'
                  : 'What was done on the portal or device.'
              }
            />
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
                    required
                    max={today}
                    aria-describedby={p.describedBy}
                    aria-invalid={p.invalid || undefined}
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('common.status')} required error={errs.get('opStatus')}>
                {(p) => (
                  <Select
                    id={p.id}
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
              {detailFields.map(renderDetail)}
              {providers.length ? (
                <Field
                  label="Provider / portal"
                  optionalLabel={t('common.optional')}
                  error={errs.get('provider')}
                >
                  {(p) => (
                    <Select
                      id={p.id}
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                    >
                      <option value="">Not set</option>
                      {providers.map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : null}
              <Field
                label={t('record.externalRef')}
                optionalLabel={t('common.optional')}
                error={errs.get('externalRef')}
              >
                {(p) => (
                  <Input
                    id={p.id}
                    maxLength={60}
                    value={externalRef}
                    onChange={(e) => setExternalRef(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('record.followUpDate')}
                optionalLabel={t('common.optional')}
                error={errs.get('followUpDate')}
              >
                {(p) => (
                  <Input
                    id={p.id}
                    type="date"
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
                    rows={2}
                    maxLength={1000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>
        ) : null}

        {/* ------------------------------------------------ DMT beneficiary */}
        {step === 'beneficiary' ? (
          <div className="flex flex-col gap-4">
            <StepIntro
              icon={Landmark}
              title="Who receives the money?"
              text="Pick a saved beneficiary or add a new one."
            />
            {customerId ? (
              <div role="radiogroup" aria-label="Beneficiary" className="grid gap-2 sm:grid-cols-2">
                {activeBens.map((b) => (
                  <BenCard
                    key={b.id}
                    on={beneficiaryId === b.id}
                    onClick={() => pickBeneficiary(b)}
                  >
                    <span className="block font-semibold">{b.name}</span>
                    <span className="block text-xs text-fg-muted">
                      {b.bankName} · {b.accountNumber}
                      {b.ifsc ? ` · ${b.ifsc}` : ''}
                    </span>
                  </BenCard>
                ))}
                <BenCard on={beneficiaryId === 'new'} onClick={() => pickBeneficiary('new')} dashed>
                  <span className="flex items-center gap-2 font-semibold text-brand">
                    <Plus aria-hidden className="size-4" /> New beneficiary
                  </span>
                  <span className="block text-xs text-fg-muted">Enter bank details</span>
                </BenCard>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">
                Walk-in sender — enter the beneficiary below. Pick a saved customer to reuse
                beneficiaries next time.
              </p>
            )}
            {beneficiaryId === 'new' || !customerId ? (
              <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
                {BENEFICIARY_KEYS.map((k) => fieldFor(k))
                  .filter((f): f is FieldDef => !!f)
                  .map(renderDetail)}
                {customerId && can('customers.manage') ? (
                  <div className="sm:col-span-2">
                    <Checkbox
                      checked={saveBeneficiary}
                      onChange={setSaveBeneficiary}
                      label="Save this beneficiary for the customer"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            {BENEFICIARY_KEYS.some((k) => errs.get(`details.${k}`)) && beneficiaryId !== 'new' ? (
              <Alert tone="danger">Choose a beneficiary or add a new one.</Alert>
            ) : null}
          </div>
        ) : null}

        {/* ------------------------------------------------ amount / transfer */}
        {step === 'amount' ? (
          <div className="flex flex-col gap-4">
            <StepIntro
              icon={isDmt ? ArrowUpRight : Sparkles}
              title={isDmt ? 'Transfer amount' : 'Amount & payment'}
              text={
                direction === 'PAYOUT'
                  ? t('newRecord.payoutHelp')
                  : direction === 'COLLECT'
                    ? t('newRecord.collectHelp')
                    : t('newRecord.noneHelp')
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {isDmt && fieldFor('transferMode') ? renderDetail(fieldFor('transferMode')!) : null}
              {showPrincipal ? (
                <Field
                  label={tk(svc.principalLabelKey!)}
                  error={errs.get('principalPaise')}
                  required
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
                help={preset && !feeTouched ? `From fee preset “${preset.preset.name}”` : undefined}
              >
                {(p) => (
                  <MoneyInput
                    id={p.id}
                    name="fee"
                    describedBy={p.describedBy}
                    invalid={p.invalid}
                    value={fee}
                    onChange={(v) => {
                      setFeeTouched(true);
                      setFee(v);
                    }}
                  />
                )}
              </Field>
              <Field
                label={t('record.expectedCommission')}
                optionalLabel={t('common.optional')}
                error={errs.get('expectedCommissionPaise')}
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
            </div>

            <div className="flex items-center justify-between rounded-xl bg-brand-bg px-4 py-3">
              <span className="text-sm font-semibold">{t('newRecord.customerOwes')}</span>
              <span className="font-display text-xl font-extrabold">
                {receivable !== null ? <Money paise={receivable} /> : '—'}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('record.amountCollected')} error={errs.get('amountCollectedPaise')}>
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
              <Field
                label={t('record.paymentMethod')}
                error={errs.get('paymentMethod') ?? errs.get('paymentMode')}
              >
                {(p) => (
                  <Select
                    id={p.id}
                    aria-invalid={p.invalid || undefined}
                    value={payWith}
                    onChange={(e) => setPayWith(e.target.value)}
                  >
                    {(['CASH', 'UPI', 'BANK', 'NONE'] as const).map((m) => (
                      <option key={m} value={m}>
                        {tk(`method.${m}`)}
                      </option>
                    ))}
                    {masters
                      .active('PAYMENT_MODE')
                      .filter((m) => m.data.account !== 'FLOAT')
                      .map((m) => (
                        <option key={m.id} value={`mode:${m.name}`}>
                          {m.name}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
            </div>
            {receivable !== null && collectedPaise !== null && receivable - collectedPaise > 0 ? (
              <p className="text-sm font-semibold text-warning" data-testid="due-hint">
                {t('newRecord.willBeDue')} <Money paise={receivable - collectedPaise} />
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ------------------------------------------------ review */}
        {step === 'review' ? (
          <div className="flex flex-col gap-4">
            <StepIntro icon={Check} title="Check and save" text={t('record.manualNotice')} />
            <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border text-sm">
              <ReviewRow label={t('record.customer')} onEdit={() => setStepIdx(0)}>
                {customer.kind === 'customer' ? customer.name : customer.name || t('common.walkIn')}
                {cust.data ? <KycBadge kyc={cust.data.kyc} className="ml-2" /> : null}
              </ReviewRow>
              {isDmt ? (
                <ReviewRow
                  label="Beneficiary"
                  onEdit={() => setStepIdx(steps.findIndex((s) => s.key === 'beneficiary'))}
                >
                  {String(detailsObj.beneficiaryName ?? '—')} · {String(detailsObj.bankName ?? '')}{' '}
                  {String(detailsObj.accountNumber ?? '')}
                </ReviewRow>
              ) : null}
              <ReviewRow label={t('common.status')} onEdit={() => setStepIdx(1)}>
                {tk(`status.${opStatus}`)} · {txnDate}
                {provider ? ` · ${provider}` : ''}
              </ReviewRow>
              {showPrincipal ? (
                <ReviewRow
                  label={tk(svc.principalLabelKey!)}
                  onEdit={() => setStepIdx(steps.findIndex((s) => s.key === 'amount'))}
                >
                  <Money paise={principalPaise ?? 0} /> · {tk(`method.${principalMethod}`)}
                </ReviewRow>
              ) : null}
              <ReviewRow
                label={t('record.customerFee')}
                onEdit={() => setStepIdx(steps.findIndex((s) => s.key === 'amount'))}
              >
                <Money paise={feePaise ?? 0} />
              </ReviewRow>
              <ReviewRow
                label={t('record.amountCollected')}
                onEdit={() => setStepIdx(steps.findIndex((s) => s.key === 'amount'))}
              >
                <Money paise={collectedPaise ?? 0} /> ·{' '}
                {customMode?.name ?? tk(`method.${paymentMethod}`)}
              </ReviewRow>
            </dl>

            <div className="rounded-xl border border-border p-4">
              {canPost ? (
                <Checkbox
                  checked={post && postable}
                  disabled={!postable}
                  onChange={setPost}
                  label={<span className="font-semibold">{t('record.post')}</span>}
                  description={postable ? t('record.postHelp') : t('newRecord.notPostable')}
                />
              ) : (
                <p className="flex items-start gap-2 text-sm text-fg-muted">
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
            </div>
          </div>
        ) : null}

        {err && isApiError(err, 'QUOTA_EXCEEDED') ? (
          <div className="mt-4">
            <UpgradeNotice error={err} />
          </div>
        ) : null}
        {err && !isApiError(err, 'QUOTA_EXCEEDED') && !fieldErrs ? (
          <Alert tone="danger" className="mt-4">
            {errs.formMessage}
          </Alert>
        ) : null}
        {/* lets Enter submit the step */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Frame>
  );
}

function StepIntro({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Check;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-muted text-fg-muted">
        <Icon aria-hidden className="size-4" />
      </span>
      <div>
        <h2 className="font-display text-base font-bold">{title}</h2>
        <p className="text-[13px] text-fg-muted">{text}</p>
      </div>
    </div>
  );
}

function BenCard({
  on,
  onClick,
  dashed,
  children,
}: {
  on: boolean;
  onClick: () => void;
  dashed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'relative rounded-xl border p-3 text-left transition',
        dashed && !on && 'border-dashed',
        on ? 'border-brand bg-brand-bg ring-1 ring-brand' : 'border-border hover:border-brand/40',
      )}
    >
      {on ? (
        <span className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full bg-brand text-on-brand">
          <Check aria-hidden className="size-3" strokeWidth={3} />
        </span>
      ) : null}
      {children}
    </button>
  );
}

function ReviewRow({
  label,
  children,
  onEdit,
}: {
  label: string;
  children: ReactNode;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <dt className="w-32 shrink-0 text-fg-muted">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium">{children}</dd>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-semibold text-brand hover:underline"
        >
          Edit
        </button>
      ) : null}
    </div>
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
