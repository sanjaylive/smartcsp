'use client';

/*
 * New record — one page, filled top to bottom, with a live summary beside it.
 *
 *   Customer → Service details → (Beneficiary, for money transfers) → Amount & payment → More info
 *
 * Counter staff enter dozens of these a day, so there are no steps to click through: every
 * section is visible, each one ticks itself off when it is complete, and the summary panel
 * (sticky on desktop, a bottom bar on phones) always shows what the customer owes plus the
 * Save button. Shown as its own page at /app/records/new so a stray click elsewhere can't close
 * a half-filled record.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Check,
  ChevronDown,
  Clock,
  Landmark,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  beneficiaryCreateSchema,
  buildDetailsSchema,
  customFieldsToFieldDefs,
  formatDate,
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
import { BankIcon, BeneficiaryForm } from '@/components/beneficiary-form';
import { bankByName, bankForIfsc } from '@/lib/banks';
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
  IntegrationsOverview,
  PostingPreview,
  ProviderOperationJson,
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
import { DetailField, initialDetailValues, toDetails, type DetailValues } from './record-fields';
import { CustomerPicker, type CustomerChoice } from './customer-picker';
import { MoneyInput, paiseToInput, rupeesOrZero } from './money-input';
import { ServiceIcon, useServiceLabel } from './service';
import { UpgradeNotice } from './query-state';
import { KycBadge, KycDrawer } from './customer-kyc';
import { useToast } from './ui/toast';
import { Dialog } from './ui/dialog';
import { CollectPanel } from './payment-collect';
import {
  BillLive,
  LiveModeSwitch,
  LiveResultDialog,
  RechargeLive,
  type LiveState,
} from './live-pay2all';
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

/* ----------------------------------------------------------------------------- page chrome */

function PageTop({
  icon,
  title,
  description,
  backHref,
  backLabel,
  actions,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  backHref: string;
  backLabel: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {backLabel}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {description ? <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p> : null}
        </div>
        {actions}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------- wizard */

export function RecordWizard({
  initialCode,
  initialCustomId,
  onClose,
}: {
  initialCode: ServiceCode | null;
  initialCustomId: string | null;
  onClose: () => void;
}) {
  const { t, tk } = useI18n();
  const router = useRouter();
  const { ctx, can } = usePermissions();
  const label = useServiceLabel();
  const [pick, setPick] = useState<{ code: ServiceCode; custom: string | null } | null>(
    initialCode && getService(initialCode) ? { code: initialCode, custom: initialCustomId } : null,
  );
  if (!ctx) return null;

  const changeService = () => {
    setPick(null);
    if (initialCode) router.replace('/app/records/new');
  };

  const blocked = (body: ReactNode) => (
    <div className="mx-auto max-w-3xl">
      <PageTop
        icon={<NewIcon />}
        title={t('nav.newRecord')}
        backHref="/app/records"
        backLabel={t('nav.records')}
      />
      {body}
    </div>
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
        <Alert
          tone="warning"
          title={t('newRecord.unavailable')}
          action={
            <Button size="sm" variant="outline" onClick={changeService}>
              Choose another service
            </Button>
          }
        >
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
          svc={svc}
          onClose={onClose}
          onChangeService={changeService}
        />
      );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageTop
        icon={<NewIcon />}
        title={t('nav.newRecord')}
        description={t('newRecord.pickService')}
        backHref="/app/records"
        backLabel={t('nav.records')}
      />
      <ServiceGrid ctx={ctx} onPick={(code, custom) => setPick({ code, custom })} />
    </div>
  );
}

function NewIcon() {
  return (
    <span className="grid size-11 place-items-center rounded-xl bg-brand text-on-brand">
      <Plus aria-hidden className="size-5" />
    </span>
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
  const all = [
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
  ];
  const term = q.trim().toLowerCase();
  const items = all.filter((i) => !term || `${i.name} ${i.sub}`.toLowerCase().includes(term));

  if (!creatable.length && !customOn)
    return <Alert tone="warning">{t('newRecord.noServices')}</Alert>;
  return (
    <Card className="p-4 sm:p-5">
      {all.length > 6 ? (
        <div className="relative mb-4">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            aria-label="Search services"
            placeholder="Search services…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
      ) : null}
      {items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => onPick(i.code, i.custom)}
                className="group flex h-full w-full items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left transition hover:border-brand hover:bg-brand-bg/40 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-focus/30 focus-visible:outline-none"
              >
                <ServiceIcon code={i.code} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{i.name}</span>
                  <span className="line-clamp-2 block text-xs text-fg-muted">{i.sub}</span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-fg-muted transition group-hover:translate-x-0.5 group-hover:text-brand"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-fg-muted">No service matches “{q}”.</p>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------------------- the form */

type SectionKey = 'customer' | 'details' | 'beneficiary' | 'amount' | 'extra';
const BENEFICIARY_KEYS = ['accountNumber', 'ifsc', 'bankName', 'beneficiaryName'];
const AMOUNT_KEYS = [
  'principalPaise',
  'customerFeePaise',
  'expectedCommissionPaise',
  'amountCollectedPaise',
  'paymentMethod',
  'principalMethod',
  'paymentMode',
];
const EXTRA_KEYS = ['externalRef', 'notes', 'followUpDate'];
const METHOD_ICON: Record<string, LucideIcon> = {
  CASH: Banknote,
  UPI: Smartphone,
  BANK: Landmark,
  NONE: Clock,
};

function RecordSteps({
  svc,
  onClose,
  onChangeService,
}: {
  svc: Resolved;
  onClose: () => void;
  onChangeService: () => void;
}) {
  const { t, tk } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { can, ctx } = usePermissions();
  const today = useToday();
  const idem = useIdempotencyKey();
  const errs = useFormErrors();
  const masters = useMasters();
  const formRef = useRef<HTMLFormElement>(null);
  const isDmt = svc.code === 'DMT';

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
  const [addingBen, setAddingBen] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState<string | null>(null);

  // ---- Live (Pay2All): offered when the owner set this service to Live in Integrations.
  const LIVE_UI = ['RECHARGE', 'BILL_PAYMENT'];
  const liveCapable =
    LIVE_UI.includes(svc.code) &&
    !!ctx?.services.find((s) => s.code === svc.code)?.providerExecution.available;
  const [isLive, setIsLive] = useState(liveCapable);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);
  const [result, setResult] = useState<ProviderOperationJson | null>(null);
  const [checking, setChecking] = useState(false);
  const integ = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api<IntegrationsOverview>('/v1/integrations'),
    enabled: liveCapable && can('integrations.view'),
    staleTime: 60_000,
  });
  const liveMode = integ.data?.providers[0]?.mode ?? 'LIVE';
  const onLive = useCallback((st: LiveState) => {
    setLiveState(st);
    setLiveError(null);
    setDetails((d) => ({ ...d, ...st.details }));
    if (st.amountPaise) setPrincipal(paiseToInput(st.amountPaise));
  }, []);

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
  const activeBens = useMemo(() => (bens.data?.items ?? []).filter((b) => b.active), [bens.data]);

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

  // A different sender means a different beneficiary list — choose again.
  useEffect(() => {
    if (isDmt) setBeneficiaryId(null);
  }, [isDmt, customerId]);

  // Default to the most recently used saved beneficiary, or the "new" form when there are none.
  useEffect(() => {
    if (!isDmt || beneficiaryId !== null) return;
    if (!customerId) return setBeneficiaryId('new');
    if (bens.isLoading) return;
    setBeneficiaryId(activeBens[0]?.id ?? 'new');
  }, [isDmt, activeBens, beneficiaryId, customerId, bens.isLoading]);

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
  const duePaise =
    receivable !== null && collectedPaise !== null ? Math.max(0, receivable - collectedPaise) : 0;

  const paymentModes = masters.active('PAYMENT_MODE').filter((m) => m.data.account !== 'FLOAT');
  const customMode = payWith.startsWith('mode:')
    ? paymentModes.find((m) => `mode:${m.name}` === payWith)
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
    paymentAccountId:
      (paymentMethod === 'UPI' || paymentMethod === 'BANK') && collectedPaise
        ? paymentAccountId
        : null,
    provider: provider || null,
    amountCollectedPaise: collectedPaise ?? 0,
    principalMethod,
    externalRef: externalRef.trim() || null,
    notes: notes.trim() || null,
    followUpDate: followUpDate || null,
    details: detailsObj,
    post: isLive ? false : willPost,
  };

  // ---- validation
  const sectionOf = (key: string): SectionKey => {
    if (key === 'customerId' || key === 'walkInName') return 'customer';
    if (key.startsWith('details.')) {
      const f = key.slice(8);
      if (isDmt && BENEFICIARY_KEYS.includes(f)) return 'beneficiary';
      if (isDmt && f === 'transferMode') return 'amount';
      return 'details';
    }
    if (AMOUNT_KEYS.includes(key)) return 'amount';
    if (EXTRA_KEYS.includes(key)) return 'extra';
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
  // Live check, used only to tick sections off as they become complete.
  const liveIssues = new Set(Object.keys(validate()).map(sectionOf));
  const showPrincipal = svc.principalLabelKey !== null && direction !== 'NONE';
  const complete: Record<SectionKey, boolean> = {
    customer: !liveIssues.has('customer') && (!!customerId || !!customer.name.trim()),
    details: !liveIssues.has('details'),
    beneficiary: !liveIssues.has('beneficiary') && !!String(details.accountNumber ?? '').trim(),
    amount:
      !liveIssues.has('amount') && (showPrincipal ? !!principalPaise : true) && receivable !== null,
    extra: !liveIssues.has('extra') && !!(externalRef.trim() || notes.trim() || followUpDate),
  };

  /** Scroll the first highlighted field into view and focus it. */
  const revealFirstError = () =>
    window.setTimeout(() => {
      const el = formRef.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"], [data-section-error="true"]',
      );
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof el.focus === 'function') el.focus({ preventScroll: true });
    }, 60);

  // ---- posting preview (live, while "post to cashbook" is on)
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
    enabled: willPost && previewValid,
    retry: false,
  });

  const save = async () => {
    if (busy) return;
    errs.clear();
    if (isLive && !liveState?.ready) {
      setLiveError(liveState?.problem ?? 'Fill in the Live details first');
      setShowErrors(true);
      revealFirstError();
      return;
    }
    const fe = validate();
    if (Object.keys(fe).length) {
      errs.setFields(fe);
      setShowErrors(true);
      revealFirstError();
      return;
    }
    if (isLive) {
      setConfirmLive(true);
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
      if (isDmt && customerId && beneficiaryId === 'new' && can('customers.manage')) {
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
      router.push(`/app/records/${rec.id}?created=1`);
    } catch (err) {
      errs.fromError(err);
      setBusy(false);
      setShowErrors(true);
      if (isApiError(err)) {
        if (err.status >= 400 && err.status < 500) idem.reset();
        if (err.fields && Object.keys(err.fields).length) revealFirstError();
      }
    }
  };

  /** Sends a Live operation to Pay2All (after the operator confirmed the summary). */
  const sendLive = async () => {
    setConfirmLive(false);
    setBusy(true);
    try {
      const { post: _post, opStatus: _st, ...rest } = body;
      const op = await api<ProviderOperationJson>('/v1/provider-operations', {
        method: 'POST',
        body: { ...rest, confirmed: true, live: liveState?.live },
        idempotencyKey: idem.key(),
      });
      idem.reset();
      void qc.invalidateQueries({ queryKey: qk.context });
      void qc.invalidateQueries({ queryKey: ['records'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      setResult(op);
    } catch (err) {
      errs.fromError(err);
      setShowErrors(true);
      if (isApiError(err) && err.status >= 400 && err.status < 500) idem.reset();
    } finally {
      setBusy(false);
    }
  };
  const checkLive = async () => {
    if (!result) return;
    setChecking(true);
    try {
      setResult(await api<ProviderOperationJson>(`/v1/provider-operations/${result.id}`));
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Could not check the status');
    } finally {
      setChecking(false);
    }
  };

  // Save the typed beneficiary to the customer now and select it.
  const addBeneficiary = async () => {
    if (!customerId) return;
    const r = beneficiaryCreateSchema.safeParse({
      name: detailsObj.beneficiaryName ?? '',
      bankName: detailsObj.bankName ?? '',
      accountNumber: detailsObj.accountNumber ?? '',
      ifsc: detailsObj.ifsc || null,
    });
    const rename: Record<string, string> = { name: 'beneficiaryName' };
    if (!r.success) {
      const fe = zodToFieldErrors(r.error);
      errs.setFields(
        Object.fromEntries(Object.entries(fe).map(([k, v]) => [`details.${rename[k] ?? k}`, v])),
      );
      return;
    }
    setAddingBen(true);
    try {
      const b = await api<Beneficiary>(`/v1/customers/${customerId}/beneficiaries`, {
        method: 'POST',
        body: r.data,
      });
      await qc.invalidateQueries({ queryKey: ['customers', customerId, 'beneficiaries'] });
      setBeneficiaryId(b.id);
      toast('success', `${b.name} added`);
    } catch (e) {
      if (isApiError(e) && e.fields)
        errs.setFields(
          Object.fromEntries(
            Object.entries(e.fields).map(([k, v]) => [`details.${rename[k] ?? k}`, v]),
          ),
        );
      else errs.fromError(e);
    } finally {
      setAddingBen(false);
    }
  };

  // ---- render helpers
  const statuses = initialStatuses(svc.workflow);
  const detailFields = svc.fields.filter(
    (f) => !(isDmt && (BENEFICIARY_KEYS.includes(f.key) || f.key === 'transferMode')),
  );
  const fieldFor = (key: string) => svc.fields.find((f) => f.key === key);
  /** Drop a field's error as soon as it is edited, so stale messages don't linger. */
  const clearErr = (key: string) => {
    if (errs.fields[key])
      errs.setFields(Object.fromEntries(Object.entries(errs.fields).filter(([k]) => k !== key)));
  };
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

  // Warn before a refresh, tab close or service change throws away a half-filled record.
  const dirty =
    customer.kind === 'customer' ||
    !!customer.name.trim() ||
    !!principal.trim() ||
    Object.values(detailsObj).some((v) => v !== undefined && v !== null && v !== '' && v !== false);
  useEffect(() => {
    if (!dirty || busy || result) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy, result]);
  const changeService = () => {
    if (dirty && !window.confirm('Discard this record and choose another service?')) return;
    onChangeService();
  };

  const err = errs.formError;
  const fieldErrCount = Object.keys(errs.fields).length;
  const saveLabel = isLive
    ? svc.code === 'BILL_PAYMENT'
      ? 'Pay bill now'
      : 'Recharge now'
    : willPost
      ? t('newRecord.saveAndPost')
      : t('newRecord.save');
  let n = 0;
  const num = () => ++n;

  const customerLabel =
    customer.kind === 'customer' ? customer.name : customer.name.trim() || t('common.walkIn');

  /* -------------------------------------------------------------- summary (right column) */
  const summary = (
    <aside aria-label="Record summary" className="flex flex-col gap-4 lg:sticky lg:top-20">
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">Summary</p>
          <p className="mt-1 text-sm font-bold">{svc.name}</p>
          <p className="truncate text-xs text-fg-muted">
            {customerLabel} · {txnDate ? formatDate(txnDate) : '—'} ·{' '}
            {isLive ? 'Live' : tk(`status.${opStatus}`)}
          </p>
        </div>

        <dl className="flex flex-col gap-2 px-4 py-3 text-sm">
          {isDmt && detailsObj.beneficiaryName ? (
            <SumRow label="Beneficiary">
              <span className="block truncate">{String(detailsObj.beneficiaryName)}</span>
            </SumRow>
          ) : null}
          {showPrincipal ? (
            <SumRow label={tk(svc.principalLabelKey!)}>
              <Money paise={principalPaise ?? 0} />
            </SumRow>
          ) : null}
          <SumRow label="Your fee">
            <Money paise={feePaise ?? 0} />
          </SumRow>
          {commissionPaise ? (
            <SumRow label="Expected commission" muted>
              <Money paise={commissionPaise} />
            </SumRow>
          ) : null}
        </dl>

        <div className="mx-4 flex items-baseline justify-between border-t border-dashed border-border py-3">
          <span className="text-sm font-semibold">{t('newRecord.customerOwes')}</span>
          <span className="font-display text-2xl font-extrabold">
            {receivable !== null ? <Money paise={receivable} /> : '—'}
          </span>
        </div>
        <dl className="flex flex-col gap-2 px-4 pb-3 text-sm">
          <SumRow label={`Collected · ${customMode?.name ?? tk(`method.${paymentMethod}`)}`}>
            <Money paise={collectedPaise ?? 0} />
          </SumRow>
          {duePaise > 0 ? (
            <SumRow label="Due later" tone="warning">
              <Money paise={duePaise} />
            </SumRow>
          ) : null}
        </dl>

        <div className="border-t border-border bg-surface-muted/40 px-4 py-3">
          {isLive ? (
            <p className="flex items-start gap-2 text-[13px] text-fg-muted">
              <Zap aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
              Sent to Pay2All and paid from your Pay2All wallet. The record updates itself with the
              result.
            </p>
          ) : canPost ? (
            <Checkbox
              checked={post && postable}
              disabled={!postable}
              onChange={setPost}
              label={<span className="font-semibold">{t('record.post')}</span>}
              description={postable ? t('record.postHelp') : t('newRecord.notPostable')}
            />
          ) : (
            <p className="flex items-start gap-2 text-[13px] text-fg-muted">
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t('newRecord.noPostPermission')}
            </p>
          )}
          {willPost && !isLive ? (
            <div className="mt-3" aria-live="polite" data-testid="posting-preview">
              {!previewValid ? (
                <p className="text-[13px] text-fg-muted">{t('newRecord.previewIncomplete')}</p>
              ) : preview.isFetching && !preview.data ? (
                <p className="text-[13px] text-fg-muted">{t('common.loading')}</p>
              ) : preview.isError ? (
                <p className="text-[13px] text-danger">
                  {isApiError(preview.error) ? preview.error.message : t('common.error')}
                </p>
              ) : preview.data ? (
                <PreviewView
                  p={preview.data}
                  principalCash={
                    direction === 'PAYOUT' && principalMethod === 'CASH' ? (principalPaise ?? 0) : 0
                  }
                  cashCollected={paymentMethod === 'CASH' ? (collectedPaise ?? 0) : 0}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="hidden flex-col gap-2 border-t border-border p-4 lg:flex">
          {showErrors && fieldErrCount ? (
            <p role="alert" className="text-[13px] font-medium text-danger">
              Please fix{' '}
              {fieldErrCount === 1
                ? 'the highlighted field'
                : `${fieldErrCount} highlighted fields`}
              .
            </p>
          ) : null}
          <Button
            size="lg"
            onClick={() => void save()}
            loading={busy}
            icon={<Check aria-hidden className="size-4" />}
          >
            {saveLabel}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <p className="text-center text-[11px] text-fg-muted">
            Tip: press <kbd className="rounded border border-border px-1 font-sans">Ctrl</kbd> +{' '}
            <kbd className="rounded border border-border px-1 font-sans">Enter</kbd> to save
          </p>
        </div>
      </Card>
    </aside>
  );

  return (
    <div className="mx-auto max-w-6xl pb-20 lg:pb-0">
      <PageTop
        icon={<ServiceIcon code={svc.code} size="lg" />}
        title={t('record.new', { service: svc.name })}
        description={t('record.manualNotice')}
        backHref="/app/records"
        backLabel={t('nav.records')}
        actions={
          <Button variant="outline" size="sm" onClick={changeService}>
            Change service
          </Button>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_370px]">
        <form
          ref={formRef}
          noValidate
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void save();
            }
          }}
          className="flex min-w-0 flex-col gap-4"
        >
          {err && isApiError(err, 'QUOTA_EXCEEDED') ? <UpgradeNotice error={err} /> : null}
          {err && !isApiError(err, 'QUOTA_EXCEEDED') && !fieldErrCount ? (
            <Alert tone="danger">{errs.formMessage}</Alert>
          ) : null}

          {/* ------------------------------------------------ customer */}
          <Section
            n={num()}
            done={complete.customer}
            title={isDmt ? 'Sender (customer)' : t('record.customer')}
            description={
              isDmt
                ? 'Find the customer sending money, or add them. KYC status shows here.'
                : 'Find a saved customer, add a new one, or type a walk-in name.'
            }
          >
            <div className="flex flex-col gap-3">
              <CustomerPicker
                value={customer}
                onChange={setCustomer}
                error={errs.get('customerId') ?? errs.get('walkInName')}
              />
              {customerId && cust.data ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-muted/60 px-3.5 py-2.5">
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
          </Section>

          {/* ------------------------------------------------ details / sender */}
          <Section
            n={num()}
            done={isLive ? !!liveState?.ready : complete.details}
            title={isDmt ? 'Sender details' : t('newRecord.serviceDetails')}
            description={
              isDmt
                ? 'Filled from the customer — check and correct if needed.'
                : isLive
                  ? 'Sent to Pay2All when you save. The result comes back in seconds.'
                  : 'What was done on the portal or device.'
            }
          >
            <div className="flex flex-col gap-4">
              {liveCapable ? (
                <LiveModeSwitch
                  live={isLive}
                  mode={liveMode}
                  onChange={(v) => {
                    setIsLive(v);
                    setLiveError(null);
                    if (!v) setDetails(initialDetailValues(svc.fields));
                  }}
                />
              ) : null}
              {isLive && liveMode === 'UAT' ? (
                <Alert tone="warning">
                  Pay2All test mode (UAT): no real recharge, no wallet debit.
                </Alert>
              ) : null}
              {isLive ? (
                <>
                  {svc.code === 'RECHARGE' ? (
                    <RechargeLive onChange={onLive} amountPaise={principalPaise ?? 0} />
                  ) : (
                    <BillLive onChange={onLive} />
                  )}
                  {liveError ? (
                    <Alert tone="danger">
                      <span data-section-error="true" tabIndex={-1}>
                        {liveError}
                      </span>
                    </Alert>
                  ) : null}
                </>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={
                    svc.workflow === 'APPLICATION'
                      ? t('record.applicationDate')
                      : t('record.txnDate')
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
                      disabled={isLive}
                      aria-describedby={p.describedBy}
                      aria-invalid={p.invalid || undefined}
                      value={txnDate}
                      onChange={(e) => setTxnDate(e.target.value)}
                    />
                  )}
                </Field>
                {!isLive ? (
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
                ) : null}
                {!isLive ? detailFields.map(renderDetail) : null}
                {providers.length && !isLive ? (
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
              </div>
            </div>
          </Section>

          {/* ------------------------------------------------ DMT beneficiary */}
          {isDmt ? (
            <Section
              n={num()}
              done={complete.beneficiary}
              title="Beneficiary"
              description="Who receives the money. Pick a saved beneficiary or enter bank details."
            >
              <div className="flex flex-col gap-4">
                {customerId && activeBens.length ? (
                  <div
                    role="radiogroup"
                    aria-label="Beneficiary"
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    {activeBens.map((b) => (
                      <BenCard
                        key={b.id}
                        on={beneficiaryId === b.id}
                        onClick={() => pickBeneficiary(b)}
                      >
                        <span className="flex items-center gap-3 pr-6">
                          <BankIcon bank={bankForIfsc(b.ifsc ?? '') ?? bankByName(b.bankName)} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{b.name}</span>
                            <span className="block truncate text-xs text-fg-muted">
                              {b.bankName} · <span className="money">{b.accountNumber}</span>
                            </span>
                            {b.ifsc ? (
                              <span className="block text-[11px] text-fg-muted">{b.ifsc}</span>
                            ) : null}
                          </span>
                        </span>
                      </BenCard>
                    ))}
                    <BenCard
                      on={beneficiaryId === 'new'}
                      onClick={() => pickBeneficiary('new')}
                      dashed
                    >
                      <span className="flex items-center gap-2 font-semibold text-brand">
                        <Plus aria-hidden className="size-4" /> New beneficiary
                      </span>
                      <span className="block text-xs text-fg-muted">Enter bank details</span>
                    </BenCard>
                  </div>
                ) : !customerId ? (
                  <p className="text-[13px] text-fg-muted">
                    Walk-in sender — enter the beneficiary below. Pick a saved customer to reuse
                    beneficiaries next time.
                  </p>
                ) : null}
                {beneficiaryId === 'new' || !customerId ? (
                  <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
                    <BeneficiaryForm
                      value={{
                        accountNumber: String(details.accountNumber ?? ''),
                        ifsc: String(details.ifsc ?? ''),
                        bankName: String(details.bankName ?? ''),
                        beneficiaryName: String(details.beneficiaryName ?? ''),
                      }}
                      onChange={(patch) => {
                        setDetails((d) => ({ ...d, ...patch }));
                        for (const k of Object.keys(patch)) clearErr(`details.${k}`);
                      }}
                      error={(k) => errs.get(`details.${k}`) ?? undefined}
                    />
                    {customerId && can('customers.manage') ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                        <p className="text-xs text-fg-muted">
                          Saved to this customer automatically when you save the record.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void addBeneficiary()}
                          loading={addingBen}
                          icon={<Plus aria-hidden className="size-4" />}
                        >
                          Save beneficiary now
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {BENEFICIARY_KEYS.some((k) => errs.get(`details.${k}`)) &&
                beneficiaryId !== 'new' ? (
                  <Alert tone="danger">
                    <span data-section-error="true" tabIndex={-1}>
                      Choose a beneficiary or add a new one.
                    </span>
                  </Alert>
                ) : null}
              </div>
            </Section>
          ) : null}

          {/* ------------------------------------------------ amount & payment */}
          <Section
            n={num()}
            done={complete.amount}
            title={isDmt ? 'Transfer & payment' : t('newRecord.amounts')}
            description={
              direction === 'PAYOUT'
                ? t('newRecord.payoutHelp')
                : direction === 'COLLECT'
                  ? t('newRecord.collectHelp')
                  : t('newRecord.noneHelp')
            }
          >
            <div className="flex flex-col gap-5">
              {isDmt && fieldFor('transferMode') ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {renderDetail(fieldFor('transferMode')!)}
                </div>
              ) : null}

              {showPrincipal ? (
                <div className="grid gap-4 sm:grid-cols-2">
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
                  <ChoiceChips
                    label={
                      direction === 'PAYOUT'
                        ? t('newRecord.paidOutVia')
                        : t('newRecord.principalVia')
                    }
                    value={principalMethod}
                    onChange={(v) => setPrincipalMethod(v as 'CASH' | 'UPI' | 'BANK')}
                    error={errs.get('principalMethod')}
                    options={(['CASH', 'UPI', 'BANK'] as const).map((m) => ({
                      value: m,
                      label: tk(`method.${m}`),
                      icon: METHOD_ICON[m],
                    }))}
                  />
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('record.customerFee')}
                  error={errs.get('customerFeePaise')}
                  help={
                    preset && !feeTouched
                      ? `From fee preset “${preset.preset.name}”`
                      : t('newRecord.feeHelp')
                  }
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
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand-bg/60 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Wallet aria-hidden className="size-4 text-brand" />
                  {t('newRecord.customerOwes')}
                </span>
                <span className="font-display text-xl font-extrabold">
                  {receivable !== null ? <Money paise={receivable} /> : '—'}
                </span>
              </div>

              <ChoiceChips
                label={t('record.paymentMethod')}
                value={payWith}
                onChange={(v) => {
                  // "Not collected" means nothing was taken now; switching back refills the amount.
                  if (v === 'NONE') {
                    setCollectedTouched(true);
                    setCollected('');
                  } else if (payWith === 'NONE') setCollectedTouched(false);
                  setPayWith(v);
                  clearErr('paymentMethod');
                  clearErr('amountCollectedPaise');
                }}
                error={errs.get('paymentMethod') ?? errs.get('paymentMode')}
                options={[
                  ...(['CASH', 'UPI', 'BANK', 'NONE'] as const).map((m) => ({
                    value: m as string,
                    label: tk(`method.${m}`),
                    icon: METHOD_ICON[m],
                  })),
                  ...paymentModes.map((m) => ({
                    value: `mode:${m.name}`,
                    label: m.name,
                    icon: Wallet,
                  })),
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
              {duePaise > 0 ? (
                <p
                  className="flex items-center gap-2 rounded-lg bg-warning-bg px-3 py-2 text-sm font-semibold text-warning"
                  data-testid="due-hint"
                >
                  <Clock aria-hidden className="size-4 shrink-0" />
                  {t('newRecord.willBeDue')} <Money paise={duePaise} />
                </p>
              ) : null}
              {(paymentMethod === 'UPI' || paymentMethod === 'BANK') &&
              (collectedPaise ?? 0) > 0 ? (
                <CollectPanel
                  method={paymentMethod}
                  amountPaise={collectedPaise ?? 0}
                  note={`${svc.name} – ${customerLabel}`}
                  accountId={paymentAccountId}
                  onAccount={setPaymentAccountId}
                  canManage={can('settings.manage')}
                />
              ) : null}
            </div>
          </Section>

          {/* ------------------------------------------------ more info */}
          <Section
            n={num()}
            done={complete.extra}
            optional={t('common.optional')}
            title="More information"
            description="Reference number, follow-up reminder and notes."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('record.externalRef')}
                optionalLabel={t('common.optional')}
                error={errs.get('externalRef')}
              >
                {(p) => (
                  <Input
                    id={p.id}
                    maxLength={60}
                    aria-invalid={p.invalid || undefined}
                    aria-describedby={p.describedBy}
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
                    aria-invalid={p.invalid || undefined}
                    aria-describedby={p.describedBy}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </Section>
        </form>

        {summary}
      </div>

      {confirmLive ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setConfirmLive(false)}
          title={svc.code === 'BILL_PAYMENT' ? 'Pay this bill now?' : 'Send this recharge now?'}
          description={
            liveMode === 'UAT'
              ? 'Pay2All test mode — no real money moves.'
              : liveMode === 'SIMULATOR'
                ? 'Simulator — no real money moves.'
                : 'This is a real transaction. The amount is debited from your Pay2All wallet.'
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmLive(false)}>
                Go back
              </Button>
              <Button
                onClick={() => void sendLive()}
                loading={busy}
                icon={<Zap aria-hidden className="size-4" />}
              >
                Confirm and send
              </Button>
            </>
          }
        >
          <dl className="flex flex-col gap-2 text-sm">
            {svc.code === 'RECHARGE' ? (
              <>
                <SumRow label="Number">{String(detailsObj.subscriberNumber ?? '')}</SumRow>
                <SumRow label="Operator">
                  {tk(`option.operator.${String(detailsObj.operator ?? 'OTHER')}`)}
                </SumRow>
              </>
            ) : (
              <>
                <SumRow label="Biller">{String(detailsObj.billerName ?? '')}</SumRow>
                <SumRow label="Consumer">{String(detailsObj.consumerId ?? '')}</SumRow>
              </>
            )}
            <SumRow label={tk(svc.principalLabelKey ?? 'record.principal.generic')}>
              <Money paise={principalPaise ?? 0} />
            </SumRow>
            <SumRow label="Customer pays you">
              <Money paise={receivable ?? 0} />
            </SumRow>
          </dl>
        </Dialog>
      ) : null}
      {result ? (
        <LiveResultDialog
          op={result}
          refreshing={checking}
          onRefresh={can('integrations.view') ? () => void checkLive() : undefined}
          onClose={() => router.push(`/app/records/${result.record.id}?created=1`)}
        />
      ) : null}

      {/* Phones: total + Save stay reachable above the bottom navigation. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-border bg-surface px-4 py-2.5 lg:hidden print:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-fg-muted uppercase">
            {t('newRecord.customerOwes')}
          </p>
          <p className="font-display text-lg leading-tight font-extrabold">
            {receivable !== null ? <Money paise={receivable} /> : '—'}
          </p>
        </div>
        <Button
          onClick={() => void save()}
          loading={busy}
          icon={<Check aria-hidden className="size-4" />}
        >
          {isLive
            ? svc.code === 'BILL_PAYMENT'
              ? 'Pay bill'
              : 'Recharge'
            : willPost
              ? 'Save & post'
              : 'Save'}
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------- building blocks */

function Section({
  n,
  title,
  description,
  done,
  optional,
  children,
}: {
  n: number;
  title: string;
  description?: string;
  done?: boolean;
  optional?: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold transition-colors',
            done ? 'bg-success text-white dark:text-bg' : 'bg-brand-bg text-brand',
          )}
        >
          {done ? <Check className="size-4" strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
            {title}
            {optional ? (
              <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold text-fg-muted">
                {optional}
              </span>
            ) : null}
            {done ? <span className="sr-only">(complete)</span> : null}
          </h2>
          {description ? <p className="text-[13px] text-fg-muted">{description}</p> : null}
        </div>
      </header>
      <div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </Card>
  );
}

/** Small set of mutually exclusive options as tappable chips (a radio group). */
function ChoiceChips({
  label,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; icon?: LucideIcon }[];
  onChange: (v: string) => void;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-sm font-semibold">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        aria-invalid={error ? true : undefined}
        className="flex flex-wrap gap-2"
      >
        {options.map((o) => {
          const on = o.value === value;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cn(
                'inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border px-3 text-sm font-semibold transition focus-visible:ring-3 focus-visible:ring-focus/30 focus-visible:outline-none',
                on
                  ? 'border-brand bg-brand-bg text-brand-strong dark:text-fg'
                  : 'border-border bg-surface text-fg hover:border-brand/40',
              )}
            >
              {Icon ? <Icon aria-hidden className="size-4" /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
      {error ? <p className="text-[13px] font-medium text-danger">{error}</p> : null}
    </div>
  );
}

function SumRow({
  label,
  children,
  muted,
  tone,
}: {
  label: string;
  children: ReactNode;
  muted?: boolean;
  tone?: 'warning';
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3',
        muted && 'text-fg-muted',
        tone === 'warning' && 'font-semibold text-warning',
      )}
    >
      <dt className={cn('min-w-0 truncate', !tone && 'text-fg-muted')}>{label}</dt>
      <dd className="money min-w-0 text-right font-semibold">{children}</dd>
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
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-danger-bg px-2.5 py-2">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-danger">
            <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
            {t('record.netCashToCustomer')}
          </p>
          <p className="money text-base font-extrabold" data-testid="cash-to-customer">
            <Money paise={principalCash} />
          </p>
        </div>
        <div className="rounded-lg bg-success-bg px-2.5 py-2">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-success">
            <ArrowDownLeft aria-hidden className="size-3.5 shrink-0" />
            {t('record.netCashFromCustomer')}
          </p>
          <p className="money text-base font-extrabold" data-testid="cash-from-customer">
            <Money paise={cashCollected} />
          </p>
        </div>
      </div>
      <p className="text-[13px]">
        {t('newRecord.netCash')}{' '}
        <strong
          className={cn(
            p.cashEffectPaise < 0 ? 'text-danger' : p.cashEffectPaise > 0 ? 'text-success' : '',
          )}
        >
          <Money paise={p.cashEffectPaise} signed />
        </strong>
      </p>
      <details className="group rounded-lg border border-border bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[13px] font-semibold">
          {t('newRecord.entries')}
          <ChevronDown aria-hidden className="size-4 transition group-open:rotate-180" />
        </summary>
        <div className={cn(tableCls.wrap, 'px-3 pb-2')}>
          <table className="w-full text-[13px]">
            <caption className="sr-only">{t('newRecord.entries')}</caption>
            <thead>
              <tr className="text-left text-[11px] text-fg-muted">
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
                    {l.memo ? (
                      <span className="block text-[11px] text-fg-muted">{l.memo}</span>
                    ) : null}
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
          <p className="pt-1 text-[11px] text-fg-muted">{t('newRecord.principalNotIncome')}</p>
        </div>
      </details>
    </div>
  );
}
