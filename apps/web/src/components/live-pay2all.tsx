'use client';

/*
 * Live (Pay2All) entry for the new-record page.
 *   Recharge      number → operator auto-detected (editable) → amount or pick a plan
 *   Bill payment  category → biller → biller's own inputs → fetch bill → amount filled in
 * The parent saves the record through POST /v1/provider-operations with the `live` ids below.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  FileSearch,
  ListFilter,
  Loader2,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react';
import { api, isApiError } from '@/lib/api';
import type { ProviderOperationJson } from '@/lib/types';
import { Alert, Button, Field, Input, Money, Select } from './ui';
import { Dialog, Drawer } from './ui/dialog';
import { cn } from '@/lib/cn';
import { OperatorTiles } from './operator-badge';

/* ----------------------------------------------------------------------------- types */

export interface LiveInput {
  providerId?: number;
  billerId?: string;
  referenceId?: string | null;
  params?: Record<string, string>;
  mobile?: string | null;
}

/** What the live section hands back to the record form. */
export interface LiveState {
  live: LiveInput;
  /** Record detail fields derived from the Pay2All choices. */
  details: Record<string, string>;
  /** Amount to pre-fill (plan price / bill amount), in paise. */
  amountPaise?: number;
  /** Customer mobile, also used as the record's walk-in contact. */
  ready: boolean;
  problem?: string;
}

interface P2AProvider {
  provider_id: number;
  name: string;
  code?: string;
}
interface P2AService {
  service_id: number;
  service: string;
  code?: string;
  providers: P2AProvider[];
}

/* ----------------------------------------------------------------------------- helpers */

const OPERATOR_ENUM: Array<[RegExp, string]> = [
  [/airtel.*(dth|digital)/i, 'AIRTEL_DTH'],
  [/tata\s*(play|sky)/i, 'TATA_PLAY'],
  [/dish/i, 'DISH_TV'],
  [/sun/i, 'SUN_DIRECT'],
  [/d2h|videocon/i, 'D2H'],
  [/airtel/i, 'AIRTEL'],
  [/jio/i, 'JIO'],
  [/\bvi\b|vodafone|idea/i, 'VI'],
  [/bsnl|mtnl/i, 'BSNL'],
];
const operatorEnum = (name: string) => OPERATOR_ENUM.find(([re]) => re.test(name))?.[1] ?? 'OTHER';

const BILL_ENUM: Array<[RegExp, string]> = [
  [/electric|power/i, 'ELECTRICITY'],
  [/water/i, 'WATER'],
  [/gas|lpg|piped/i, 'GAS'],
  [/broadband|landline|internet/i, 'BROADBAND'],
  [/postpaid|mobile/i, 'POSTPAID'],
  [/insurance|lic/i, 'INSURANCE'],
  [/loan|emi/i, 'LOAN_EMI'],
];
const billEnum = (name: string) => BILL_ENUM.find(([re]) => re.test(name))?.[1] ?? 'OTHER';

/** "2026-11-30", "30-11-2026", "30/11/2026" → ISO date, else undefined. */
function toIsoDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = v.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return undefined;
}

const rupeesToPaise = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined;
};

function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-1.5 text-[13px] font-medium text-danger">
      <CircleAlert aria-hidden className="size-4" />
      {isApiError(error) ? error.message : 'Pay2All is not reachable right now'}
    </p>
  );
}

/* ----------------------------------------------------------------------------- recharge */

export function RechargeLive({
  onChange,
  amountPaise,
}: {
  onChange: (s: LiveState) => void;
  amountPaise: number;
}) {
  const [kind, setKind] = useState<'PREPAID' | 'DTH'>('PREPAID');
  const [number, setNumber] = useState('');
  const [providerId, setProviderId] = useState<number | null>(null);
  const [circle, setCircle] = useState<{ id?: string; name?: string }>({});
  const [plansOpen, setPlansOpen] = useState(false);

  const providers = useQuery({
    queryKey: ['p2a', 'providers'],
    queryFn: () => api<{ services?: P2AService[] } | P2AService[]>('/v1/pay2all/providers'),
    staleTime: 6 * 3600_000,
  });
  const operators = useMemo(() => {
    const services: P2AService[] = Array.isArray(providers.data)
      ? providers.data
      : (providers.data?.services ?? []);
    const want = kind === 'DTH' ? /dth/i : /prepaid|mobile/i;
    const svc = services.filter(
      (s) => want.test(`${s.service} ${s.code ?? ''}`) && !/postpaid/i.test(s.service),
    );
    return (svc.length ? svc : services).flatMap((s) => s.providers ?? []);
  }, [providers.data, kind]);
  const op = operators.find((o) => o.provider_id === providerId) ?? null;

  const validNumber = kind === 'PREPAID' ? /^[6-9]\d{9}$/.test(number) : /^\d{6,16}$/.test(number);
  const lookup = useQuery({
    queryKey: ['p2a', 'lookup', kind, number],
    queryFn: () =>
      api<{
        provider_id?: number;
        provider_name?: string;
        circle_id?: string;
        circle_name?: string;
      }>('/v1/pay2all/lookup', {
        method: 'POST',
        body: { number, type: kind === 'DTH' ? 'dth' : 'mobile' },
      }),
    enabled: validNumber && kind === 'PREPAID',
    retry: false,
    staleTime: 3600_000,
  });
  useEffect(() => {
    if (!lookup.data) return;
    if (lookup.data.provider_id) setProviderId(Number(lookup.data.provider_id));
    setCircle({
      id: lookup.data.circle_id ? String(lookup.data.circle_id) : undefined,
      name: lookup.data.circle_name,
    });
  }, [lookup.data]);

  useEffect(() => {
    const problem = !validNumber
      ? kind === 'PREPAID'
        ? 'Enter the 10-digit mobile number'
        : 'Enter the DTH subscriber ID'
      : !op
        ? 'Choose the operator'
        : undefined;
    onChange({
      live: {
        providerId: op?.provider_id,
        mobile: kind === 'PREPAID' && validNumber ? number : null,
      },
      details: {
        rechargeType: kind,
        operator: op ? operatorEnum(op.name) : '',
        subscriberNumber: number,
        circle: circle.name ?? '',
      },
      ready: !problem,
      problem,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, number, op?.provider_id, circle.name, validNumber]);

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Recharge type" className="flex gap-2">
        {(['PREPAID', 'DTH'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => {
              setKind(k);
              setProviderId(null);
              setCircle({});
            }}
            className={cn(
              'min-h-10 flex-1 rounded-[10px] border px-3 text-sm font-semibold sm:flex-none sm:px-5',
              kind === k
                ? 'border-brand bg-brand-bg text-brand-strong dark:text-fg'
                : 'border-border hover:border-brand/40',
            )}
          >
            {k === 'PREPAID' ? 'Mobile prepaid' : 'DTH'}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={kind === 'PREPAID' ? 'Mobile number' : 'Subscriber / customer ID'}
          required
          help={
            lookup.isFetching
              ? 'Finding operator…'
              : lookup.data?.provider_name
                ? `Detected: ${lookup.data.provider_name}${circle.name ? ` · ${circle.name}` : ''}`
                : undefined
          }
        >
          {(p) => (
            <Input
              id={p.id}
              inputMode="numeric"
              className="money text-base"
              maxLength={kind === 'PREPAID' ? 10 : 16}
              aria-describedby={p.describedBy}
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
      </div>
      <Field label="Operator" required>
        {(p) =>
          providers.isLoading ? (
            <p className="text-sm text-fg-muted">Loading operators…</p>
          ) : (
            <OperatorTiles
              id={p.id}
              label="Operator"
              value={providerId ? String(providerId) : ''}
              options={operators.map((o) => ({
                value: String(o.provider_id),
                label: o.name,
                mark: o.name,
              }))}
              onChange={(v) => setProviderId(Number(v))}
            />
          )
        }
      </Field>
      <ErrorLine error={providers.error ?? lookup.error} />
      {op ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            icon={<ListFilter aria-hidden className="size-4" />}
            onClick={() => setPlansOpen(true)}
          >
            Browse plans
          </Button>
          {amountPaise ? (
            <span className="text-[13px] text-fg-muted">
              Recharge amount: <Money paise={amountPaise} />
            </span>
          ) : null}
        </div>
      ) : null}
      {plansOpen && op ? (
        <PlansDrawer
          providerId={op.provider_id}
          operator={op.name}
          circleId={circle.id}
          onClose={() => setPlansOpen(false)}
          onPick={(paise) => {
            setPlansOpen(false);
            onChange({
              live: { providerId: op.provider_id, mobile: kind === 'PREPAID' ? number : null },
              details: {
                rechargeType: kind,
                operator: operatorEnum(op.name),
                subscriberNumber: number,
                circle: circle.name ?? '',
              },
              amountPaise: paise,
              ready: validNumber,
              problem: validNumber ? undefined : 'Enter the number',
            });
          }}
        />
      ) : null}
    </div>
  );
}

interface Plan {
  plan_id?: string | number;
  amount: number | string;
  validity?: string;
  description?: string;
  data?: string;
  category?: string;
}

function PlansDrawer({
  providerId,
  operator,
  circleId,
  onClose,
  onPick,
}: {
  providerId: number;
  operator: string;
  circleId?: string;
  onClose: () => void;
  onPick: (paise: number) => void;
}) {
  const [cat, setCat] = useState<string>('');
  const [q, setQ] = useState('');
  const plans = useQuery({
    queryKey: ['p2a', 'plans', providerId, circleId],
    queryFn: () =>
      api<{ plans?: Plan[]; categories?: string[] }>('/v1/pay2all/plans', {
        query: { providerId, circleId },
      }),
    staleTime: 3600_000,
  });
  const all = plans.data?.plans ?? [];
  const cats = plans.data?.categories?.length
    ? plans.data.categories
    : [...new Set(all.map((p) => p.category).filter(Boolean) as string[])];
  const list = all.filter(
    (p) =>
      (!cat || p.category === cat) &&
      (!q.trim() ||
        `${p.amount} ${p.description} ${p.data}`.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={`${operator} plans`} size="lg">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            aria-label="Search plans"
            className="pl-9"
            placeholder="Search by amount, data or validity"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {cats.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {['', ...cats].map((c) => (
              <button
                key={c || 'all'}
                type="button"
                onClick={() => setCat(c)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold',
                  cat === c ? 'border-brand bg-brand-bg text-brand-strong' : 'border-border',
                )}
              >
                {c || 'All'}
              </button>
            ))}
          </div>
        ) : null}
        {plans.isLoading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-fg-muted">
            <Loader2 aria-hidden className="size-4 animate-spin" /> Loading plans…
          </p>
        ) : null}
        <ErrorLine error={plans.error} />
        <ul className="flex flex-col gap-2">
          {list.slice(0, 200).map((p, i) => {
            const paise = rupeesToPaise(p.amount);
            return (
              <li key={`${p.plan_id ?? i}`}>
                <button
                  type="button"
                  disabled={!paise}
                  onClick={() => paise && onPick(paise)}
                  className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left transition hover:border-brand hover:bg-brand-bg/40"
                >
                  <span className="font-display min-w-16 text-lg font-extrabold">₹{p.amount}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="flex flex-wrap gap-x-3 font-semibold">
                      {p.validity ? <span>{p.validity}</span> : null}
                      {p.data ? <span className="text-brand">{p.data}</span> : null}
                    </span>
                    {p.description ? (
                      <span className="line-clamp-2 text-xs text-fg-muted">{p.description}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {!plans.isLoading && !list.length ? (
          <p className="py-6 text-center text-sm text-fg-muted">No plans found.</p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ----------------------------------------------------------------------------- bill payment */

interface BillerParam {
  paramName: string;
  dataType?: string;
  optional?: boolean;
  minLength?: number;
  maxLength?: number;
}
interface Bill {
  amount?: number | string;
  dueDate?: string;
  billDate?: string;
  customerName?: string;
  billNumber?: string;
  billPeriod?: string;
  referenceId?: string;
  message?: string;
}

export function BillLive({ onChange }: { onChange: (s: LiveState) => void }) {
  const [category, setCategory] = useState('');
  const [billerId, setBillerId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [mobile, setMobile] = useState('');
  const [bill, setBill] = useState<Bill | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<unknown>(null);

  const cats = useQuery({
    queryKey: ['p2a', 'bbps', 'categories'],
    queryFn: () => api<Array<{ name: string; billerSlug: string }>>('/v1/pay2all/bbps/categories'),
    staleTime: 12 * 3600_000,
  });
  const billers = useQuery({
    queryKey: ['p2a', 'bbps', 'billers', category],
    queryFn: () =>
      api<{ title?: string; billers?: Array<{ billerId: string; billerName: string }> }>(
        '/v1/pay2all/bbps/billers',
        { query: { category } },
      ),
    enabled: !!category,
    staleTime: 12 * 3600_000,
  });
  const biller = useQuery({
    queryKey: ['p2a', 'bbps', 'biller', billerId],
    queryFn: () =>
      api<{
        billerId: string;
        billerName: string;
        fetchRequirement?: string;
        params?: BillerParam[];
      }>(`/v1/pay2all/bbps/billers/${encodeURIComponent(billerId)}`),
    enabled: !!billerId,
    staleTime: 12 * 3600_000,
  });
  const params = biller.data?.params ?? [];
  const catName = cats.data?.find((c) => c.billerSlug === category)?.name ?? '';
  const billerName =
    biller.data?.billerName ??
    billers.data?.billers?.find((b) => b.billerId === billerId)?.billerName ??
    '';
  const missing = params.filter((p) => !p.optional && !values[p.paramName]?.trim());
  const validMobile = /^[6-9]\d{9}$/.test(mobile);
  const fetchOptional = /optional|not/i.test(biller.data?.fetchRequirement ?? '');

  const runFetch = async () => {
    setFetching(true);
    setFetchError(null);
    setBill(null);
    try {
      const b = await api<Bill>('/v1/pay2all/bbps/fetch', {
        method: 'POST',
        body: { billerId, params: values, mobile },
      });
      setBill(b);
    } catch (e) {
      setFetchError(e);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    const problem = !billerId
      ? 'Choose the biller'
      : missing.length
        ? `Enter ${missing[0]!.paramName}`
        : !validMobile
          ? 'Enter the customer mobile number'
          : !bill && !fetchOptional
            ? 'Fetch the bill first'
            : undefined;
    const firstParam = params[0] ? values[params[0].paramName] : '';
    onChange({
      live: {
        billerId: billerId || undefined,
        referenceId: bill?.referenceId ?? null,
        params: values,
        mobile: validMobile ? mobile : null,
      },
      details: {
        billCategory: billEnum(catName),
        billerName,
        consumerId: firstParam ?? '',
        ...(toIsoDate(bill?.dueDate) ? { billDueDate: toIsoDate(bill?.dueDate)! } : {}),
      },
      amountPaise: rupeesToPaise(bill?.amount),
      ready: !problem,
      problem,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billerId, JSON.stringify(values), mobile, bill, billerName, catName, params.length]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bill category" required>
          {(p) => (
            <Select
              id={p.id}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setBillerId('');
                setBill(null);
                setValues({});
              }}
            >
              <option value="">{cats.isLoading ? 'Loading…' : 'Choose category'}</option>
              {(cats.data ?? []).map((c) => (
                <option key={c.billerSlug} value={c.billerSlug}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Biller" required>
          {(p) => (
            <Select
              id={p.id}
              value={billerId}
              disabled={!category}
              onChange={(e) => {
                setBillerId(e.target.value);
                setBill(null);
                setValues({});
              }}
            >
              <option value="">
                {billers.isFetching
                  ? 'Loading billers…'
                  : category
                    ? 'Choose biller'
                    : 'Pick a category first'}
              </option>
              {(billers.data?.billers ?? []).map((b) => (
                <option key={b.billerId} value={b.billerId}>
                  {b.billerName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {params.map((prm) => (
          <Field key={prm.paramName} label={prm.paramName} required={!prm.optional}>
            {(p) => (
              <Input
                id={p.id}
                inputMode={/num/i.test(prm.dataType ?? '') ? 'numeric' : undefined}
                minLength={prm.minLength}
                maxLength={prm.maxLength ?? 64}
                value={values[prm.paramName] ?? ''}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [prm.paramName]: e.target.value }));
                  setBill(null);
                }}
              />
            )}
          </Field>
        ))}
        {billerId ? (
          <Field
            label="Customer mobile"
            required
            help="Pay2All sends the bill receipt to this number"
          >
            {(p) => (
              <Input
                id={p.id}
                inputMode="numeric"
                maxLength={10}
                className="money"
                aria-describedby={p.describedBy}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
              />
            )}
          </Field>
        ) : null}
      </div>
      <ErrorLine error={cats.error ?? billers.error ?? biller.error} />
      {billerId ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            loading={fetching}
            disabled={!!missing.length || !validMobile}
            icon={<FileSearch aria-hidden className="size-4" />}
            onClick={() => void runFetch()}
          >
            {bill ? 'Fetch again' : 'Fetch bill'}
          </Button>
          <ErrorLine error={fetchError} />
        </div>
      ) : null}
      {bill ? (
        <div className="grid gap-x-6 gap-y-2 rounded-xl border border-success/30 bg-success-bg/60 p-4 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2 font-semibold text-success sm:col-span-2">
            <CheckCircle2 aria-hidden className="size-4" /> Bill found
          </p>
          {bill.customerName ? <BillRow k="Customer" v={bill.customerName} /> : null}
          <BillRow k="Amount due" v={bill.amount !== undefined ? `₹${bill.amount}` : '—'} strong />
          {bill.dueDate ? <BillRow k="Due date" v={bill.dueDate} /> : null}
          {bill.billNumber ? <BillRow k="Bill number" v={bill.billNumber} /> : null}
          {bill.billPeriod ? <BillRow k="Bill period" v={bill.billPeriod} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function BillRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-fg-muted">{k}</span>
      <span className={cn('text-right', strong ? 'text-base font-extrabold' : 'font-semibold')}>
        {v}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------------- mode switch */

export function LiveModeSwitch({
  live,
  onChange,
  mode,
}: {
  live: boolean;
  onChange: (live: boolean) => void;
  mode: 'LIVE' | 'UAT' | 'SIMULATOR' | string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-muted/40 p-1 sm:flex-row">
      {[
        {
          on: false,
          title: 'Offline',
          text: 'Done on your portal — just record it',
        },
        {
          on: true,
          title:
            mode === 'UAT'
              ? 'Live · Pay2All test'
              : mode === 'SIMULATOR'
                ? 'Live · Simulator'
                : 'Live · Pay2All',
          text: 'Send it now from your Pay2All wallet',
        },
      ].map((o) => (
        <button
          key={String(o.on)}
          type="button"
          role="radio"
          aria-checked={live === o.on}
          onClick={() => onChange(o.on)}
          className={cn(
            'flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
            live === o.on ? 'bg-surface shadow-sm ring-1 ring-brand' : 'hover:bg-surface/60',
          )}
        >
          <span
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-lg',
              live === o.on ? 'bg-brand text-on-brand' : 'bg-surface-muted text-fg-muted',
            )}
          >
            {o.on ? (
              <Zap aria-hidden className="size-4" />
            ) : (
              <ListFilter aria-hidden className="size-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">{o.title}</span>
            <span className="block text-xs text-fg-muted">{o.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------- result */

export function LiveResultDialog({
  op,
  onClose,
  onRefresh,
  refreshing,
}: {
  op: ProviderOperationJson;
  onClose: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const ok = op.status === 'CONFIRMED';
  const failed = op.status === 'FAILED';
  const Icon = ok ? CheckCircle2 : failed ? CircleAlert : Clock;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        ok
          ? 'Successful'
          : failed
            ? 'Failed'
            : op.status === 'UNKNOWN'
              ? 'Result not known yet'
              : 'Processing'
      }
      footer={
        <>
          {!op.outcomeKnown && onRefresh ? (
            <Button
              variant="outline"
              loading={refreshing}
              icon={<RefreshCw aria-hidden className="size-4" />}
              onClick={onRefresh}
            >
              Check status
            </Button>
          ) : null}
          <Link
            href={`/app/records/${op.record.id}`}
            className="inline-flex min-h-10 items-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-on-brand"
          >
            View record #{op.record.recordNo}
          </Link>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2 text-center" data-testid="live-result">
        <span
          className={cn(
            'grid size-14 place-items-center rounded-full',
            ok
              ? 'bg-success-bg text-success'
              : failed
                ? 'bg-danger-bg text-danger'
                : 'bg-warning-bg text-warning',
          )}
        >
          <Icon aria-hidden className="size-7" />
        </span>
        <p className="font-display text-2xl font-extrabold">
          <Money paise={op.record.principalPaise} />
        </p>
        {op.providerRef ? (
          <p className="text-sm text-fg-muted">
            Pay2All ref <span className="money font-semibold text-fg">{op.providerRef}</span>
          </p>
        ) : null}
        {op.message ? (
          <Alert tone={ok ? 'success' : failed ? 'danger' : 'warning'} className="text-left">
            {op.message}
          </Alert>
        ) : null}
        {op.mode !== 'LIVE' ? (
          <p className="text-xs text-fg-muted">
            {op.mode === 'UAT'
              ? 'Pay2All test mode — no real money moved.'
              : 'Simulator — no real money moved.'}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
