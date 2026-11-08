'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Switch from '@radix-ui/react-switch';
import { Building2, CreditCard, Pencil, Plus, Receipt, Tags, Trash2 } from 'lucide-react';
import { formatINR, masterCreateSchema, SERVICE_CODES, type ServiceCode } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, useFormErrors, usePermissions, zodToFieldErrors } from '@/lib/hooks';
import { mastersKey, useMasters } from '@/lib/masters';
import type { FeeSlab, MasterKind, ShopMaster } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
} from '@/components/ui';
import { Drawer } from '@/components/ui/dialog';
import { QueryState } from '@/components/query-state';
import { MoneyInput, paiseToInput, rupeesOrZero } from '@/components/money-input';
import { ServiceIcon, useServiceLabel } from '@/components/service';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

const TABS: Array<{
  kind: MasterKind;
  label: string;
  icon: typeof Tags;
  help: string;
  add: string;
}> = [
  {
    kind: 'EXPENSE_CATEGORY',
    label: 'Expense categories',
    icon: Tags,
    help: 'Your own categories, shown next to the built-in ones (Rent, Electricity, Salary…) when you add an expense.',
    add: 'Add category',
  },
  {
    kind: 'PAYMENT_MODE',
    label: 'Payment modes',
    icon: CreditCard,
    help: 'Names like PhonePe, Paytm or Card swipe. Each one is tied to where the money lands — cash in hand, bank or provider float — so your cashbook stays correct.',
    add: 'Add payment mode',
  },
  {
    kind: 'FEE_PRESET',
    label: 'Fee presets',
    icon: Receipt,
    help: 'Your customer fee by amount, per service. The fee fills in automatically on new records — staff can still change it.',
    add: 'Add fee preset',
  },
  {
    kind: 'PROVIDER',
    label: 'Providers & portals',
    icon: Building2,
    help: 'The portals you work on (SBI Kiosk, PayNearby, Spice Money, CSC…). Tag each record with one to see volume per portal.',
    add: 'Add provider',
  },
];

const ACCOUNT_LABEL = {
  CASH: 'Cash in hand',
  BANK: 'Bank / UPI',
  FLOAT: 'Provider float',
} as const;

export default function MastersPage() {
  const { can } = usePermissions();
  const m = useMasters();
  const label = useServiceLabel();
  const [tab, setTab] = useState<MasterKind>('EXPENSE_CATEGORY');
  const [editing, setEditing] = useState<ShopMaster | 'new' | null>(null);
  const current = TABS.find((x) => x.kind === tab)!;
  const manage = can('settings.manage');

  return (
    <>
      <PageHeader
        title="Masters"
        description="Lists that make record entry faster and reports clearer for your counter."
        actions={
          manage ? (
            <Button
              icon={<Plus aria-hidden className="size-4" />}
              onClick={() => setEditing('new')}
            >
              {current.add}
            </Button>
          ) : null
        }
      />

      <div
        role="tablist"
        aria-label="Lists"
        className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1"
      >
        {TABS.map((x) => {
          const count = m.all.filter((i) => i.kind === x.kind).length;
          const Icon = x.icon;
          return (
            <button
              key={x.kind}
              role="tab"
              type="button"
              aria-selected={tab === x.kind}
              onClick={() => setTab(x.kind)}
              className={cn(
                'flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition',
                tab === x.kind
                  ? 'bg-brand-bg text-brand'
                  : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
              )}
            >
              <Icon aria-hidden className="size-4" />
              {x.label}
              <span className="money rounded-full bg-surface-muted px-1.5 text-xs text-fg-muted">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <QueryState query={m.query} rows={4}>
        {() => {
          const rows = m.all.filter((i) => i.kind === tab);
          return (
            <Card>
              <p className="border-b border-border px-4 py-2.5 text-[13px] text-fg-muted">
                {current.help}
              </p>
              {rows.length === 0 ? (
                <EmptyState
                  icon={<current.icon aria-hidden className="size-6" />}
                  title="Nothing here yet"
                  description={manage ? `Use “${current.add}” to create the first one.` : undefined}
                  action={
                    manage ? (
                      <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
                        {current.add}
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <ul className="divide-y divide-border">
                  {rows.map((r) => (
                    <MasterRow
                      key={r.id}
                      row={r}
                      manage={manage}
                      onEdit={() => setEditing(r)}
                      detail={<RowDetail row={r} label={label} />}
                    />
                  ))}
                </ul>
              )}
            </Card>
          );
        }}
      </QueryState>

      {editing ? (
        <MasterDrawer
          kind={editing === 'new' ? tab : editing.kind}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function RowDetail({ row, label }: { row: ShopMaster; label: (c: string) => string }) {
  if (row.kind === 'PAYMENT_MODE' && row.data.account)
    return <Badge tone="info">Goes to {ACCOUNT_LABEL[row.data.account]}</Badge>;
  if (row.kind === 'PROVIDER')
    return (
      <span className="text-xs text-fg-muted">
        {row.data.services?.length
          ? row.data.services.map((c) => label(c)).join(', ')
          : 'All services'}
      </span>
    );
  if (row.kind === 'FEE_PRESET' && row.data.serviceCode && row.data.slabs)
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
        <ServiceIcon code={row.data.serviceCode} size="sm" />
        {label(row.data.serviceCode)} ·{' '}
        {row.data.slabs
          .map((s, i, all) => {
            const from = i === 0 ? 0 : (all[i - 1]!.upToPaise ?? 0);
            const range =
              s.upToPaise === null ? `above ${formatINR(from)}` : `up to ${formatINR(s.upToPaise)}`;
            return `${range}: ${formatINR(s.feePaise)}`;
          })
          .join(' · ')}
      </span>
    );
  return null;
}

function MasterRow({
  row,
  manage,
  onEdit,
  detail,
}: {
  row: ShopMaster;
  manage: boolean;
  onEdit: () => void;
  detail: React.ReactNode;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const toggle = useMutation({
    mutationFn: (active: boolean) =>
      api(`/v1/masters/${row.id}`, { method: 'PATCH', body: { version: row.version, active } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mastersKey }),
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const id = `active-${row.id}`;
  return (
    <li className={cn('flex items-center gap-3 px-4 py-2.5', !row.active && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {row.name}
          {!row.active ? (
            <span className="ml-2 text-xs font-normal text-fg-muted">(off)</span>
          ) : null}
        </p>
        <div className="mt-0.5">{detail}</div>
      </div>
      {manage ? (
        <>
          <label htmlFor={id} className="sr-only">
            {row.active ? `Turn off ${row.name}` : `Turn on ${row.name}`}
          </label>
          <Switch.Root
            id={id}
            checked={row.active}
            disabled={toggle.isPending}
            onCheckedChange={(v) => toggle.mutate(v)}
            className={cn(
              'relative h-6 w-10 shrink-0 rounded-full transition disabled:opacity-50',
              row.active ? 'bg-brand' : 'bg-border',
            )}
          >
            <Switch.Thumb
              className={cn(
                'block size-5 translate-x-0.5 rounded-full bg-white shadow transition',
                row.active && 'translate-x-[18px]',
              )}
            />
          </Switch.Root>
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil aria-hidden className="size-4" />}
            onClick={onEdit}
          >
            <span className="sr-only sm:not-sr-only">Edit</span>
          </Button>
        </>
      ) : null}
    </li>
  );
}

/* ----------------------------------------------------------------------------- add / edit drawer */

type SlabDraft = { upTo: string; fee: string };

function MasterDrawer({
  kind,
  existing,
  onClose,
}: {
  kind: MasterKind;
  existing: ShopMaster | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const label = useServiceLabel();
  const errs = useFormErrors();
  const tabInfo = TABS.find((x) => x.kind === kind)!;

  const [name, setName] = useState(existing?.name ?? '');
  const [account, setAccount] = useState<'CASH' | 'BANK' | 'FLOAT'>(
    existing?.data.account ?? 'BANK',
  );
  const [services, setServices] = useState<ServiceCode[]>(existing?.data.services ?? []);
  const [serviceCode, setServiceCode] = useState<ServiceCode>(existing?.data.serviceCode ?? 'AEPS');
  const [slabs, setSlabs] = useState<SlabDraft[]>(
    existing?.data.slabs?.map((s) => ({
      upTo: s.upToPaise === null ? '' : paiseToInput(s.upToPaise),
      fee: paiseToInput(s.feePaise),
    })) ?? [
      { upTo: '2000', fee: '10' },
      { upTo: '', fee: '20' },
    ],
  );
  const [busy, setBusy] = useState(false);

  const buildData = () => {
    if (kind === 'PAYMENT_MODE') return { account };
    if (kind === 'PROVIDER') return { services };
    if (kind === 'FEE_PRESET')
      return {
        serviceCode,
        slabs: slabs.map((s, i): FeeSlab => ({
          upToPaise:
            i === slabs.length - 1 && s.upTo.trim() === '' ? null : rupeesOrZero(s.upTo) || 0,
          feePaise: rupeesOrZero(s.fee) ?? -1,
        })),
      };
    return {};
  };

  const save = async () => {
    errs.clear();
    const data = buildData();
    const parsed = masterCreateSchema.safeParse({ kind, name, data });
    if (!parsed.success) {
      errs.setFields(zodToFieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      if (existing)
        await api(`/v1/masters/${existing.id}`, {
          method: 'PATCH',
          body: { version: existing.version, name: parsed.data.name, data: parsed.data.data },
        });
      else await api('/v1/masters', { method: 'POST', body: parsed.data });
      await qc.invalidateQueries({ queryKey: mastersKey });
      toast('success', existing ? 'Saved' : `${parsed.data.name} added`);
      onClose();
    } catch (e) {
      errs.fromError(e);
      setBusy(false);
    }
  };

  const slabErr = errs.get('data.slabs') ?? errs.get('data');

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `Edit ${existing.name}` : tabInfo.add}
      description={tabInfo.help}
      size={kind === 'FEE_PRESET' ? 'lg' : 'md'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required error={errs.get('name')}>
          {(p) => (
            <Input
              id={p.id}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid || undefined}
              value={name}
              maxLength={40}
              autoFocus
              placeholder={
                kind === 'PAYMENT_MODE'
                  ? 'e.g. PhonePe'
                  : kind === 'PROVIDER'
                    ? 'e.g. PayNearby'
                    : kind === 'FEE_PRESET'
                      ? 'e.g. AEPS standard'
                      : 'e.g. Printer ink'
              }
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>

        {kind === 'PAYMENT_MODE' ? (
          <Field
            label="Money goes to"
            required
            help="Pick where this payment actually lands, so balances stay right."
            error={errs.get('data.account')}
          >
            {(p) => (
              <Select
                id={p.id}
                value={account}
                onChange={(e) => setAccount(e.target.value as typeof account)}
              >
                <option value="CASH">Cash in hand</option>
                <option value="BANK">Bank / UPI</option>
                <option value="FLOAT">Provider float (expenses only)</option>
              </Select>
            )}
          </Field>
        ) : null}

        {kind === 'PROVIDER' ? (
          <fieldset>
            <legend className="text-sm font-semibold">Used for</legend>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              Leave all unticked to offer it for every service.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SERVICE_CODES.filter((c) => c !== 'CUSTOM').map((c) => {
                const on = services.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setServices((s) => (on ? s.filter((x) => x !== c) : [...s, c]))}
                    className={cn(
                      'flex min-h-10 items-center gap-2 rounded-lg border px-2.5 text-left text-sm transition',
                      on
                        ? 'border-brand bg-brand-bg font-semibold'
                        : 'border-border hover:border-brand/40',
                    )}
                  >
                    <ServiceIcon code={c} size="sm" />
                    <span className="truncate">{label(c)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {kind === 'FEE_PRESET' ? (
          <>
            <Field label="Service" required error={errs.get('data.serviceCode')}>
              {(p) => (
                <Select
                  id={p.id}
                  value={serviceCode}
                  onChange={(e) => setServiceCode(e.target.value as ServiceCode)}
                >
                  {SERVICE_CODES.filter((c) => c !== 'CUSTOM').map((c) => (
                    <option key={c} value={c}>
                      {label(c)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <fieldset>
              <legend className="text-sm font-semibold">Fee slabs</legend>
              <p className="mt-0.5 text-[13px] text-fg-muted">
                For each slab, the customer fee when the amount is up to the limit. Leave the last
                limit empty for “anything above”.
              </p>
              <div className="mt-3 overflow-hidden rounded-xl border border-border">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 bg-surface-muted/60 px-3 py-2 text-xs font-semibold text-fg-muted uppercase">
                  <span>Amount up to</span>
                  <span>Customer fee</span>
                  <span className="w-9" />
                </div>
                {slabs.map((s, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 border-t border-border px-3 py-2"
                  >
                    <MoneyInput
                      id={`slab-up-${i}`}
                      value={s.upTo}
                      placeholder={i === slabs.length - 1 ? 'No limit' : '0'}
                      onChange={(v) =>
                        setSlabs((all) => all.map((x, j) => (j === i ? { ...x, upTo: v } : x)))
                      }
                    />
                    <MoneyInput
                      id={`slab-fee-${i}`}
                      value={s.fee}
                      onChange={(v) =>
                        setSlabs((all) => all.map((x, j) => (j === i ? { ...x, fee: v } : x)))
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Remove slab ${i + 1}`}
                      disabled={slabs.length === 1}
                      onClick={() => setSlabs((all) => all.filter((_, j) => j !== i))}
                      className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-danger disabled:opacity-30"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                icon={<Plus aria-hidden className="size-4" />}
                disabled={slabs.length >= 12}
                onClick={() =>
                  setSlabs((all) => [
                    ...all.slice(0, -1),
                    { upTo: '', fee: '' },
                    all[all.length - 1]!,
                  ])
                }
              >
                Add slab
              </Button>
              {slabErr ? (
                <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
                  {slabErr}
                </p>
              ) : null}
            </fieldset>
          </>
        ) : null}

        {errs.formMessage && !Object.keys(errs.fields).length ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
      </div>
    </Drawer>
  );
}
