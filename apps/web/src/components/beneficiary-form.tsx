'use client';

/*
 * DMT beneficiary entry, in the order a CSP operator reads it off the passbook:
 * account number → IFSC (picks the bank) → bank → holder name (with an optional Verify).
 * Verify uses the shop's connected provider; without one it stays disabled and the name is typed.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Check, ChevronsUpDown, Landmark, Search, ShieldCheck } from 'lucide-react';
import { api, isApiError } from '@/lib/api';
import { BANKS, bankByName, bankForIfsc, bankTone, type Bank } from '@/lib/banks';
import { usePermissions } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { Field, Input } from '@/components/ui';

export interface BeneficiaryValues {
  accountNumber: string;
  ifsc: string;
  bankName: string;
  beneficiaryName: string;
}

const ACCOUNT_RE = /^\d{9,18}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function BankIcon({ bank, size = 'md' }: { bank?: Bank | null; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'size-7 text-[9px]' : 'size-9 text-[10px]';
  if (!bank)
    return (
      <span
        aria-hidden
        className={cn(
          'grid shrink-0 place-items-center rounded-lg bg-surface-muted text-fg-muted',
          dims,
        )}
      >
        <Landmark className="size-4" />
      </span>
    );
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-lg leading-none font-black tracking-tight',
        dims,
        bankTone(bank.code),
      )}
    >
      {bank.short.length > 4 ? bank.short.slice(0, 4) : bank.short}
    </span>
  );
}

export function useAccountVerify() {
  const { can } = usePermissions();
  return useQuery({
    queryKey: ['beneficiary-verify-status'],
    queryFn: () =>
      api<{ available: boolean; mode: string | null; reason: string | null }>(
        '/v1/beneficiaries/verify',
      ),
    enabled: can('records.create'),
    staleTime: 5 * 60_000,
  });
}

export function BankPicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (name: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const listId = useId();
  const selected = bankByName(value);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? BANKS.filter(
          (b) =>
            b.name.toLowerCase().includes(s) ||
            b.short.toLowerCase().includes(s) ||
            b.code.toLowerCase().startsWith(s),
        )
      : BANKS;
  }, [q]);
  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setQ('');
  };
  const typed = q.trim();
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex min-h-12 w-full items-center gap-3 rounded-[10px] border border-border bg-surface px-2.5 text-left text-sm transition hover:border-brand/50 focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none',
            invalid && 'border-danger',
          )}
        >
          <BankIcon bank={selected} />
          <span className={cn('min-w-0 flex-1 truncate', !value && 'text-fg-muted')}>
            {value || 'Select bank'}
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-fg-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] flex max-h-[min(30rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-72 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3">
            <Search aria-hidden className="size-4 text-fg-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search bank or IFSC code"
              aria-label="Search bank"
              className="min-h-11 w-full bg-transparent text-sm outline-none"
            />
          </div>
          {!q ? (
            <div className="grid shrink-0 grid-cols-4 gap-1.5 border-b border-border p-2.5">
              {BANKS.filter((b) => b.popular)
                .slice(0, 8)
                .map((b) => (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => pick(b.name)}
                    title={b.name}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg p-1.5 text-[11px] font-semibold text-fg-muted hover:bg-surface-muted',
                      selected?.code === b.code && 'bg-brand-bg text-brand',
                    )}
                  >
                    <BankIcon bank={b} />
                    <span className="truncate">{b.short}</span>
                  </button>
                ))}
            </div>
          ) : null}
          <ul
            id={listId}
            role="listbox"
            aria-label="Banks"
            className="min-h-24 flex-1 overflow-y-auto p-1"
          >
            {list.map((b) => (
              <li key={b.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected?.code === b.code}
                  onClick={() => pick(b.name)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-surface-muted"
                >
                  <BankIcon bank={b} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  <span className="text-[11px] text-fg-muted">{b.code}</span>
                  {selected?.code === b.code ? (
                    <Check aria-hidden className="size-4 text-brand" />
                  ) : null}
                </button>
              </li>
            ))}
            {typed.length >= 3 &&
            !list.some((b) => b.name.toLowerCase() === typed.toLowerCase()) ? (
              <li>
                <button
                  type="button"
                  onClick={() => pick(typed)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-semibold text-brand hover:bg-surface-muted"
                >
                  <BankIcon size="sm" />
                  Use “{typed}”
                </button>
              </li>
            ) : null}
            {list.length === 0 && typed.length < 3 ? (
              <li className="px-3 py-4 text-center text-sm text-fg-muted">No bank found</li>
            ) : null}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function BeneficiaryForm({
  value,
  onChange,
  error,
  ifscRequired = false,
}: {
  value: BeneficiaryValues;
  onChange: (patch: Partial<BeneficiaryValues>) => void;
  /** Error message for a field key, if any. */
  error: (key: keyof BeneficiaryValues) => string | undefined;
  ifscRequired?: boolean;
}) {
  const status = useAccountVerify();
  const available = !!status.data?.available;
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const acct = value.accountNumber.replace(/\D/g, '');
  const ifsc = value.ifsc.toUpperCase();
  const canVerify = available && ACCOUNT_RE.test(acct) && IFSC_RE.test(ifsc);

  // A changed account or IFSC invalidates an earlier verification.
  useEffect(() => {
    setVerified(null);
    setVerifyMsg(null);
  }, [acct, ifsc]);

  // The IFSC prefix names the bank — fill it in unless the operator already chose one.
  useEffect(() => {
    const b = bankForIfsc(ifsc);
    if (b && (!value.bankName || bankByName(value.bankName))) {
      if (value.bankName !== b.name) onChange({ bankName: b.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ifsc]);

  const verify = async () => {
    setVerifying(true);
    setVerifyMsg(null);
    try {
      const r = await api<{ verified: true; name: string } | { verified: false; message: string }>(
        '/v1/beneficiaries/verify',
        { method: 'POST', body: { accountNumber: acct, ifsc } },
      );
      if (r.verified) {
        setVerified(r.name);
        onChange({ beneficiaryName: r.name });
        setVerifyMsg({ tone: 'ok', text: 'Name verified with the bank' });
      } else setVerifyMsg({ tone: 'bad', text: r.message });
    } catch (e) {
      setVerifyMsg({
        tone: 'bad',
        text: isApiError(e) ? e.message : 'Could not verify. Enter the name manually.',
      });
    } finally {
      setVerifying(false);
    }
  };

  const isVerified = !!verified && verified === value.beneficiaryName;
  const verifyHint = !available
    ? 'Verification needs a connected Pay2All account — enter the name as on the passbook.'
    : !canVerify
      ? 'Enter the account number and IFSC to verify the name.'
      : undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Account number" required error={error('accountNumber')}>
        {(p) => (
          <Input
            id={p.id}
            aria-describedby={p.describedBy}
            aria-invalid={p.invalid || undefined}
            inputMode="numeric"
            autoComplete="off"
            maxLength={18}
            placeholder="e.g. 50100234567890"
            className="money tracking-wide"
            value={value.accountNumber}
            onChange={(e) => onChange({ accountNumber: e.target.value.replace(/\D/g, '') })}
          />
        )}
      </Field>
      <Field
        label="IFSC code"
        required={ifscRequired}
        optionalLabel={ifscRequired ? undefined : 'optional'}
        error={error('ifsc')}
        help={bankForIfsc(ifsc) && ifsc.length === 11 ? bankForIfsc(ifsc)!.name : undefined}
      >
        {(p) => (
          <Input
            id={p.id}
            aria-describedby={p.describedBy}
            aria-invalid={p.invalid || undefined}
            autoComplete="off"
            maxLength={11}
            placeholder="e.g. SBIN0001234"
            className="money uppercase"
            value={value.ifsc}
            onChange={(e) =>
              onChange({ ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
            }
          />
        )}
      </Field>
      <Field label="Bank" required error={error('bankName')} className="sm:col-span-2">
        {(p) => (
          <BankPicker
            id={p.id}
            describedBy={p.describedBy}
            invalid={p.invalid}
            value={value.bankName}
            onChange={(bankName) => onChange({ bankName })}
          />
        )}
      </Field>
      <Field
        label="Beneficiary name"
        required
        error={error('beneficiaryName')}
        className="sm:col-span-2"
        badge={
          isVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-bold text-success">
              <BadgeCheck aria-hidden className="size-3.5" /> Verified
            </span>
          ) : null
        }
        help={
          verifyMsg ? (
            <span className={verifyMsg.tone === 'ok' ? 'text-success' : 'text-danger'}>
              {verifyMsg.text}
            </span>
          ) : (
            verifyHint
          )
        }
      >
        {(p) => (
          <div className="relative">
            <Input
              id={p.id}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid || undefined}
              maxLength={80}
              autoComplete="off"
              placeholder="Name as per bank records"
              className={cn('pr-24', isVerified && 'border-success/60')}
              value={value.beneficiaryName}
              onChange={(e) => onChange({ beneficiaryName: e.target.value })}
            />
            <button
              type="button"
              onClick={() => void verify()}
              disabled={!canVerify || verifying}
              title={verifyHint}
              className={cn(
                'absolute top-1/2 right-1.5 inline-flex h-7 -translate-y-1/2 items-center gap-1 rounded-md px-2.5 text-xs font-bold transition',
                'disabled:cursor-not-allowed disabled:opacity-45',
                isVerified
                  ? 'bg-success-bg text-success'
                  : 'bg-brand-bg text-brand hover:brightness-95',
              )}
            >
              {verifying ? (
                <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <ShieldCheck aria-hidden className="size-3.5" />
              )}
              {isVerified ? 'Verified' : 'Verify'}
            </button>
          </div>
        )}
      </Field>
    </div>
  );
}
