'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { Entitlements } from '@csp2all/shared';
import { Modal } from '@/components/dialog';
import { useToast } from '@/components/toast';
import {
  Button,
  Callout,
  Checkbox,
  Field,
  FormError,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { get, isApiError, post } from '@/lib/api';
import {
  BOOLEAN_ENTITLEMENTS,
  ENTITLEMENT_LABELS,
  entitlementValue,
  formatINR,
  newKey,
  NULLABLE_ENTITLEMENTS,
} from '@/lib/format';
import type { Plan, TenantDetail } from '@/lib/types';

export { StartSupportDialog } from '@/components/support-dialog';

interface DialogProps {
  tenant: TenantDetail;
  onClose: () => void;
  onDone: () => void;
}

const fieldErr = (e: unknown, f: string) => (isApiError(e) ? e.field(f) : undefined);

export function ChangePlanDialog({ tenant, onClose, onDone }: DialogProps) {
  const toast = useToast();
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: () => get<{ items: Plan[] }>('/v1/admin/plans'),
  });
  const [planCode, setPlanCode] = useState(tenant.subscription?.planCode ?? '');
  const [billingCycle, setCycle] = useState<'MONTHLY' | 'ANNUAL'>(
    tenant.subscription?.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
  );
  const [effective, setEffective] = useState<'NOW' | 'PERIOD_END'>('PERIOD_END');
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () =>
      post(`/v1/admin/tenants/${tenant.tenant.id}/subscription/change`, {
        planCode,
        billingCycle,
        effective,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success(
        effective === 'NOW' ? 'Plan changed.' : 'Plan change scheduled for the end of the period.',
      );
      onDone();
      onClose();
    },
  });
  const selected = plans.data?.items.find((p) => p.code === planCode);
  const current = selected?.versions.find((v) => v.id === selected.currentVersionId);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Change plan"
      description={`${tenant.tenant.name} is on ${tenant.subscription?.planName} (${tenant.subscription?.planCode}).`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!planCode || reason.trim().length < 3}
            onClick={() => m.mutate()}
          >
            {effective === 'NOW' ? 'Change plan now' : 'Schedule change'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Plan" required error={fieldErr(m.error, 'planCode')}>
          {(p) => (
            <Select {...p} value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
              {plans.isPending && <option>Loading…</option>}
              {plans.data?.items.map((pl) => {
                const v = pl.versions.find((x) => x.id === pl.currentVersionId);
                return (
                  <option key={pl.code} value={pl.code} disabled={!pl.isActive}>
                    {v?.name ?? pl.code} ({pl.code}){pl.isActive ? '' : ' — inactive'}
                  </option>
                );
              })}
            </Select>
          )}
        </Field>
        {current && (
          <p className="text-xs text-fg-muted">
            Current version v{current.version}: {formatINR(current.monthlyPricePaise)}/month ·{' '}
            {formatINR(current.annualPricePaise)}/year (before tax).
          </p>
        )}
        <Field label="Billing cycle" required>
          {(p) => (
            <Select
              {...p}
              value={billingCycle}
              onChange={(e) => setCycle(e.target.value as 'MONTHLY' | 'ANNUAL')}
            >
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
            </Select>
          )}
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[13px] font-medium">When</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="effective"
              className="mt-1 accent-[var(--brand)]"
              checked={effective === 'PERIOD_END'}
              onChange={() => setEffective('PERIOD_END')}
            />
            <span>
              At the end of the current period
              <span className="block text-xs text-fg-muted">
                Recommended. The shop keeps what it paid for until then.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="effective"
              className="mt-1 accent-[var(--brand)]"
              checked={effective === 'NOW'}
              onChange={() => setEffective('NOW')}
            />
            <span>
              Immediately
              <span className="block text-xs text-fg-muted">
                Limits change right away. Downgrades may block new entries beyond the new limits.
              </span>
            </span>
          </label>
        </fieldset>
        <Field label="Reason (audited)" required error={fieldErr(m.error, 'reason')}>
          {(p) => (
            <Textarea
              {...p}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
          )}
        </Field>
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}

const OVERRIDE_KEYS = Object.keys(ENTITLEMENT_LABELS) as (keyof Entitlements)[];

export function OverrideDialog({ tenant, onClose, onDone }: DialogProps) {
  const toast = useToast();
  const [key, setKey] = useState<keyof Entitlements>('monthlyRecordLimit');
  const [num, setNum] = useState('');
  const [unlimited, setUnlimited] = useState(false);
  const [bool, setBool] = useState(true);
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');
  const isBool = BOOLEAN_ENTITLEMENTS.includes(key);
  const nullable = NULLABLE_ENTITLEMENTS.includes(key);

  const value = useMemo(() => {
    if (isBool) return bool;
    if (nullable && unlimited) return null;
    if (!/^\d+$/.test(num.trim())) return undefined;
    return Number(num.trim());
  }, [isBool, bool, nullable, unlimited, num]);

  const m = useMutation({
    mutationFn: () =>
      post(`/v1/admin/tenants/${tenant.tenant.id}/entitlement-overrides`, {
        key,
        value,
        reason: reason.trim(),
        expiresAt: expires ? new Date(expires).toISOString() : null,
      }),
    onSuccess: () => {
      toast.success(`${ENTITLEMENT_LABELS[key]} override added.`);
      onDone();
      onClose();
    },
  });
  const valid =
    value !== undefined &&
    reason.trim().length >= 3 &&
    (!expires || new Date(expires) > new Date());
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Add entitlement override"
      description="Overrides replace one plan limit for this shop only. Any existing override for the same entitlement is revoked."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!valid}
            onClick={() => m.mutate()}
          >
            Add override
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Entitlement" required>
          {(p) => (
            <Select
              {...p}
              value={key}
              onChange={(e) => setKey(e.target.value as keyof Entitlements)}
              name="override-key"
            >
              {OVERRIDE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {ENTITLEMENT_LABELS[k]} (now {entitlementValue(k, tenant.entitlements[k])})
                </option>
              ))}
            </Select>
          )}
        </Field>
        {isBool ? (
          <Field label="Value" required>
            {(p) => (
              <Select
                {...p}
                value={bool ? 'true' : 'false'}
                onChange={(e) => setBool(e.target.value === 'true')}
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </Select>
            )}
          </Field>
        ) : (
          <>
            <Field label="Value" required hint="Whole number." error={fieldErr(m.error, 'value')}>
              {(p) => (
                <Input
                  {...p}
                  name="override-value"
                  inputMode="numeric"
                  value={unlimited ? '' : num}
                  disabled={unlimited}
                  onChange={(e) => setNum(e.target.value.replace(/[^\d]/g, ''))}
                />
              )}
            </Field>
            {nullable && <Checkbox checked={unlimited} onChange={setUnlimited} label="Unlimited" />}
          </>
        )}
        <Field
          label="Expires (optional)"
          hint="Leave empty for a permanent override. Uses your browser’s time zone."
        >
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          )}
        </Field>
        <Field label="Reason (audited)" required error={fieldErr(m.error, 'reason')}>
          {(p) => (
            <Textarea
              {...p}
              name="override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
          )}
        </Field>
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}

export function UsageDialog({ tenant, onClose, onDone }: DialogProps) {
  const toast = useToast();
  const [periodKey, setPeriodKey] = useState(tenant.usage.periodKey);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  // One key per dialog session: double-submits and retries are applied once.
  const [idempotencyKey] = useState(() => newKey('usage'));
  const n = /^-?\d+$/.test(delta.trim()) ? Number(delta.trim()) : NaN;
  const m = useMutation({
    mutationFn: () =>
      post<{ applied: boolean }>(`/v1/admin/tenants/${tenant.tenant.id}/usage-adjustments`, {
        periodKey,
        delta: n,
        reason: reason.trim(),
        idempotencyKey,
      }),
    onSuccess: (r) => {
      toast.success(
        r?.applied === false ? 'This adjustment was already applied.' : 'Usage adjusted.',
      );
      onDone();
      onClose();
    },
  });
  const valid =
    /^\d{4}-\d{2}$/.test(periodKey) &&
    Number.isInteger(n) &&
    n !== 0 &&
    Math.abs(n) <= 100000 &&
    reason.trim().length >= 3;
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Adjust record usage"
      description="Changes the RECORDS_CREATED counter for a month — e.g. a support credit after a sync issue. Negative values give records back."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!valid}
            onClick={() => m.mutate()}
          >
            Apply adjustment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Callout tone="info">
          Current {tenant.usage.periodKey}: {tenant.usage.recordsThisPeriod} records used of{' '}
          {entitlementValue('monthlyRecordLimit', tenant.entitlements.monthlyRecordLimit)}.
        </Callout>
        <Field label="Period (YYYY-MM)" required error={fieldErr(m.error, 'periodKey')}>
          {(p) => (
            <Input
              {...p}
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              placeholder="2026-11"
              maxLength={7}
            />
          )}
        </Field>
        <Field
          label="Change in record count"
          required
          hint="For example −20 to credit 20 records back, or 5 to add usage."
          error={fieldErr(m.error, 'delta')}
        >
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={delta}
              onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))}
              placeholder="-20"
            />
          )}
        </Field>
        <Field label="Reason (audited)" required error={fieldErr(m.error, 'reason')}>
          {(p) => (
            <Textarea
              {...p}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
          )}
        </Field>
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}
