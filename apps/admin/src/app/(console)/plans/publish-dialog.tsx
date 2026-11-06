'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { parseRupeesToPaise, planVersionCreateSchema, type Entitlements } from '@csp2all/shared';
import { Modal } from '@/components/dialog';
import { useToast } from '@/components/toast';
import { Button, Callout, Checkbox, Field, FormError, Input, Textarea, cx } from '@/components/ui';
import { isApiError, post } from '@/lib/api';
import {
  BOOLEAN_ENTITLEMENTS,
  ENTITLEMENT_LABELS,
  entitlementValue,
  formatINR,
  NULLABLE_ENTITLEMENTS,
  pct,
} from '@/lib/format';
import type { ExistingSubscribersPolicy, Plan } from '@/lib/types';

const POLICIES: { value: ExistingSubscribersPolicy; title: string; body: string }[] = [
  {
    value: 'KEEP_CURRENT_VERSION',
    title: 'Keep their current version (grandfather)',
    body: 'Existing subscribers stay on the version they signed up for — same price and limits — including at renewal. Only new subscriptions and plan changes get this version.',
  },
  {
    value: 'MIGRATE_AT_RENEWAL',
    title: 'Move them at their next renewal',
    body: 'Existing subscribers keep their current terms until the paid period ends, then renew on this version’s price and limits. Nothing changes mid-period.',
  },
  {
    value: 'MIGRATE_NOW',
    title: 'Move them now',
    body: 'Every existing subscriber of this plan switches to this version immediately, including the new limits. Prices apply from their next payment. Use for corrections or improvements only.',
  },
];

const ENT_KEYS = Object.keys(ENTITLEMENT_LABELS) as (keyof Entitlements)[];

function paiseToInput(p: number): string {
  return (p / 100).toFixed(2).replace(/\.00$/, '');
}

export function PublishVersionDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const current = plan.versions.find((v) => v.id === plan.currentVersionId) ?? plan.versions[0];
  const subscribers = plan.versions.reduce((a, v) => a + v.subscribers, 0);

  const [name, setName] = useState(current?.name ?? plan.code);
  const [description, setDescription] = useState(current?.description ?? '');
  const [monthly, setMonthly] = useState(current ? paiseToInput(current.monthlyPricePaise) : '0');
  const [annual, setAnnual] = useState(current ? paiseToInput(current.annualPricePaise) : '0');
  const [tax, setTax] = useState(current ? String(current.taxRateBps / 100) : '18');
  const [taxInclusive, setTaxInclusive] = useState(current?.taxInclusive ?? false);
  const [trialDays, setTrialDays] = useState(String(current?.trialDays ?? 0));
  const [graceDays, setGraceDays] = useState(String(current?.graceDays ?? 7));
  const [ents, setEnts] = useState<Record<string, string | boolean | null>>(() => {
    const e: Record<string, string | boolean | null> = {};
    for (const k of ENT_KEYS) {
      const v = current?.entitlements[k];
      e[k] =
        typeof v === 'boolean'
          ? v
          : v === null || v === undefined
            ? NULLABLE_ENTITLEMENTS.includes(k)
              ? null
              : '0'
            : String(v);
    }
    return e;
  });
  const [policy, setPolicy] = useState<ExistingSubscribersPolicy | null>(null);
  const [confirmMigrate, setConfirmMigrate] = useState(false);

  const body = useMemo(() => {
    const entitlements: Record<string, unknown> = {};
    for (const k of ENT_KEYS) {
      const v = ents[k];
      entitlements[k] =
        typeof v === 'boolean' || v === null ? v : /^\d+$/.test(v.trim()) ? Number(v) : NaN;
    }
    return {
      name: name.trim(),
      description: description.trim() || null,
      monthlyPricePaise: parseRupeesToPaise(monthly) ?? -1,
      annualPricePaise: parseRupeesToPaise(annual) ?? -1,
      currency: 'INR' as const,
      taxRateBps: parseRupeesToPaise(tax) ?? -1, // percent with ≤2 decimals → basis points
      taxInclusive,
      trialDays: Number(trialDays),
      graceDays: Number(graceDays),
      entitlements,
      existingSubscribers: policy,
    };
  }, [name, description, monthly, annual, tax, taxInclusive, trialDays, graceDays, ents, policy]);

  const parsed = planVersionCreateSchema.safeParse(body);
  const localErrors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) out[i.path.join('.')] ??= i.message;
    return out;
  }, [parsed]);

  const m = useMutation({
    mutationFn: () =>
      post<{ version: number; migratedSubscribers: number }>(
        `/v1/admin/plans/${plan.code}/versions`,
        parsed.data,
      ),
    onSuccess: (r) => {
      toast.success(
        `Published ${plan.code} v${r.version}.${r.migratedSubscribers ? ` ${r.migratedSubscribers} subscribers moved.` : ''}`,
      );
      void qc.invalidateQueries({ queryKey: ['plans'] });
      void qc.invalidateQueries({ queryKey: ['tenant'] });
      onClose();
    },
  });

  const [touched, setTouched] = useState(false);
  const err = (f: string) =>
    (isApiError(m.error) ? m.error.field(f) : undefined) ?? (touched ? localErrors[f] : undefined);
  const priceHint = (input: string) => {
    const p = parseRupeesToPaise(input);
    return p === null ? 'Enter rupees, e.g. 299 or 299.50' : formatINR(p);
  };

  const changes: string[] = [];
  if (current && parsed.success) {
    const d = parsed.data;
    if (d.name !== current.name) changes.push(`Name: ${current.name} → ${d.name}`);
    if (d.monthlyPricePaise !== current.monthlyPricePaise)
      changes.push(
        `Monthly: ${formatINR(current.monthlyPricePaise)} → ${formatINR(d.monthlyPricePaise)}`,
      );
    if (d.annualPricePaise !== current.annualPricePaise)
      changes.push(
        `Annual: ${formatINR(current.annualPricePaise)} → ${formatINR(d.annualPricePaise)}`,
      );
    if (d.taxRateBps !== current.taxRateBps)
      changes.push(`GST: ${pct(current.taxRateBps)} → ${pct(d.taxRateBps)}`);
    if (d.taxInclusive !== current.taxInclusive)
      changes.push(`Tax ${d.taxInclusive ? 'now inclusive' : 'now extra'}`);
    if (d.trialDays !== current.trialDays)
      changes.push(`Trial: ${current.trialDays} → ${d.trialDays} days`);
    if (d.graceDays !== current.graceDays)
      changes.push(`Grace: ${current.graceDays} → ${d.graceDays} days`);
    for (const k of ENT_KEYS)
      if (d.entitlements[k] !== current.entitlements[k])
        changes.push(
          `${ENTITLEMENT_LABELS[k]}: ${entitlementValue(k, current.entitlements[k])} → ${entitlementValue(k, d.entitlements[k])}`,
        );
  }

  const canSubmit =
    parsed.success && (policy !== 'MIGRATE_NOW' || confirmMigrate || subscribers === 0);

  return (
    <Modal
      open
      wide
      onOpenChange={(v) => !v && onClose()}
      title={`Publish new version of ${plan.code}`}
      description={`Prefilled from the current version (v${current?.version ?? 0}). Publishing creates v${(plan.versions[0]?.version ?? 0) + 1}; older versions are kept.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={policy === 'MIGRATE_NOW' ? 'warning' : 'primary'}
            loading={m.isPending}
            disabled={touched && !canSubmit}
            onClick={() => {
              setTouched(true);
              if (canSubmit) m.mutate();
            }}
          >
            Publish v{(plan.versions[0]?.version ?? 0) + 1}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (canSubmit) m.mutate();
        }}
        noValidate
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Display name" required error={err('name')}>
            {(p) => (
              <Input
                {...p}
                name="plan-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
              />
            )}
          </Field>
          <Field label="Description" error={err('description')}>
            {(p) => (
              <Textarea
                {...p}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                className="min-h-9"
                rows={1}
              />
            )}
          </Field>
          <Field
            label="Monthly price (₹)"
            required
            hint={priceHint(monthly)}
            error={err('monthlyPricePaise')}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Annual price (₹)"
            required
            hint={priceHint(annual)}
            error={err('annualPricePaise')}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={annual}
                onChange={(e) => setAnnual(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="GST rate (%)"
            required
            hint="Up to 2 decimals, e.g. 18"
            error={err('taxRateBps')}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
            )}
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox
              checked={taxInclusive}
              onChange={setTaxInclusive}
              label="Prices include GST"
              description="Otherwise GST is added on top at checkout."
            />
          </div>
          <Field label="Trial days" required hint="0–90" error={err('trialDays')}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                max={90}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
              />
            )}
          </Field>
          <Field label="Grace days after expiry" required hint="0–60" error={err('graceDays')}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                max={60}
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
              />
            )}
          </Field>
        </div>

        <fieldset className="rounded-md border border-line p-3">
          <legend className="px-1 text-[13px] font-semibold">Entitlements</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {ENT_KEYS.map((k) => {
              const v = ents[k];
              if (BOOLEAN_ENTITLEMENTS.includes(k))
                return (
                  <Checkbox
                    key={k}
                    checked={v === true}
                    onChange={(b) => setEnts({ ...ents, [k]: b })}
                    label={ENTITLEMENT_LABELS[k]}
                  />
                );
              const nullable = NULLABLE_ENTITLEMENTS.includes(k);
              return (
                <div key={k} className="flex items-end gap-3">
                  <Field
                    label={ENTITLEMENT_LABELS[k]}
                    className="flex-1"
                    error={err(`entitlements.${k}`)}
                  >
                    {(p) => (
                      <Input
                        {...p}
                        inputMode="numeric"
                        disabled={v === null}
                        value={v === null ? '' : String(v)}
                        placeholder={v === null ? 'Unlimited' : undefined}
                        onChange={(e) =>
                          setEnts({ ...ents, [k]: e.target.value.replace(/[^\d]/g, '') })
                        }
                      />
                    )}
                  </Field>
                  {nullable && (
                    <div className="pb-2">
                      <Checkbox
                        checked={v === null}
                        onChange={(b) =>
                          setEnts({
                            ...ents,
                            [k]: b ? null : String(current?.entitlements[k] ?? 1),
                          })
                        }
                        label="Unlimited"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2" aria-describedby="policy-help">
          <legend className="text-[13px] font-semibold">
            What happens to existing subscribers? <span className="text-danger">*</span>
          </legend>
          <p id="policy-help" className="text-xs text-fg-muted">
            {subscribers} shop{subscribers === 1 ? ' is' : 's are'} currently subscribed to{' '}
            {plan.code} (any version). New sign-ups and plan changes always get the new version.
          </p>
          {POLICIES.map((p) => (
            <label
              key={p.value}
              className={cx(
                'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2',
                policy === p.value
                  ? 'border-brand bg-brand-bg/40'
                  : 'border-line hover:bg-muted/60',
              )}
            >
              <input
                type="radio"
                name="existingSubscribers"
                value={p.value}
                className="mt-1 accent-[var(--brand)]"
                checked={policy === p.value}
                onChange={() => setPolicy(p.value)}
              />
              <span>
                <span className="text-sm font-medium">{p.title}</span>
                <span className="block text-xs text-fg-muted">{p.body}</span>
              </span>
            </label>
          ))}
          {touched && !policy && (
            <p className="text-xs font-medium text-danger">
              Choose how existing subscribers are handled.
            </p>
          )}
        </fieldset>

        {policy === 'MIGRATE_NOW' && subscribers > 0 && (
          <Callout
            tone="warning"
            title={`This immediately changes limits for ${subscribers} shop${subscribers === 1 ? '' : 's'}`}
          >
            <Checkbox
              checked={confirmMigrate}
              onChange={setConfirmMigrate}
              label="I understand existing subscribers move to the new version now."
            />
          </Callout>
        )}

        {current && (
          <div className="rounded-md bg-muted px-3 py-2 text-[13px]">
            <p className="font-medium">Changes from v{current.version}</p>
            {changes.length === 0 ? (
              <p className="text-fg-muted">No changes yet — the new version would be identical.</p>
            ) : (
              <ul className="list-disc pl-5">
                {changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <FormError error={m.error} />
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
