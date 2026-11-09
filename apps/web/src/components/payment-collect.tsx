'use client';

/*
 * Payment helpers shown while collecting money from a customer:
 *   UPI  → the shop's UPI QR, with the amount already filled in (any UPI app can scan it),
 *          or the shop's uploaded QR image when it has no UPI ID on file.
 *   Bank → the shop's bank accounts to pick from, with details the customer can copy.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { Check, Copy, Landmark, Plus, QrCode, Smartphone } from 'lucide-react';
import { upiPaymentUri } from '@csp2all/shared';
import { BankIcon } from '@/components/beneficiary-form';
import { bankByName, bankForIfsc } from '@/lib/banks';
import {
  UPI_APP_COLOR,
  UPI_APP_LABEL,
  useAttachmentUrl,
  usePaymentAccounts,
} from '@/lib/payment-accounts';
import type { PaymentAccount } from '@/lib/types';
import { Money } from './ui';
import { cn } from '@/lib/cn';

/** QR code for any text (here: a upi://pay link), rendered locally — nothing leaves the browser. */
export function QrSvg({
  value,
  size = 200,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { margin: 1, errorCorrectionLevel: 'M', width: size * 2 })
      .then((s) => live && setSrc(s))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [value, size]);
  return (
    <div
      className={cn('grid place-items-center bg-white', className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Payment QR code" width={size} height={size} />
      ) : null}
    </div>
  );
}

export function CopyText({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-brand hover:bg-brand-bg"
      aria-label={`Copy ${label ?? text}`}
    >
      {done ? (
        <Check aria-hidden className="size-3.5" />
      ) : (
        <Copy aria-hidden className="size-3.5" />
      )}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

export function UpiAppDot({ app }: { app: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ background: UPI_APP_COLOR[app ?? 'OTHER'] ?? UPI_APP_COLOR.OTHER }}
    />
  );
}

/** Uploaded QR image (static: the customer types the amount). */
export function UploadedQr({ attachmentId, size = 200 }: { attachmentId: string; size?: number }) {
  const url = useAttachmentUrl(attachmentId);
  return (
    <div
      className="grid place-items-center overflow-hidden rounded-lg bg-white"
      style={{ width: size, height: size }}
    >
      {url.data ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url.data.url} alt="Shop UPI QR code" className="h-full w-full object-contain" />
      ) : (
        <span className="text-xs text-fg-muted">
          {url.isError ? 'QR image unavailable' : 'Loading QR…'}
        </span>
      )}
    </div>
  );
}

function AccountChoice({
  accounts,
  value,
  onChange,
  render,
  label,
}: {
  accounts: PaymentAccount[];
  value: string | null;
  onChange: (id: string) => void;
  render: (a: PaymentAccount) => React.ReactNode;
  label: string;
}) {
  if (accounts.length < 2) return null;
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {accounts.map((a) => {
        const on = a.id === value;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(a.id)}
            className={cn(
              'inline-flex min-h-9 items-center gap-2 rounded-[10px] border px-3 text-sm font-semibold transition',
              on
                ? 'border-brand bg-brand-bg text-brand-strong dark:text-fg'
                : 'border-border bg-surface hover:border-brand/40',
            )}
          >
            {render(a)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The receiving-account panel under "Collected via". Picks the default account automatically and
 * reports the choice through `onAccount` (it is saved on the record).
 */
export function CollectPanel({
  method,
  amountPaise,
  note,
  accountId,
  onAccount,
  canManage,
}: {
  method: 'UPI' | 'BANK';
  amountPaise: number;
  note?: string;
  accountId: string | null;
  onAccount: (id: string | null) => void;
  canManage: boolean;
}) {
  const { upi, bank, query } = usePaymentAccounts();
  const list = method === 'UPI' ? upi : bank;
  const current = list.find((a) => a.id === accountId) ?? null;

  // Keep the selection valid: default account first, else the first one.
  useEffect(() => {
    if (query.isLoading) return;
    if (current) return;
    const next = list.find((a) => a.isDefault) ?? list[0] ?? null;
    if ((next?.id ?? null) !== accountId) onAccount(next?.id ?? null);
  }, [query.isLoading, current, list, accountId, onAccount]);

  if (query.isLoading) return <div className="h-24 animate-pulse rounded-xl bg-surface-muted" />;

  if (!list.length)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm">
        {method === 'UPI' ? (
          <QrCode aria-hidden className="size-5 text-fg-muted" />
        ) : (
          <Landmark aria-hidden className="size-5 text-fg-muted" />
        )}
        <span className="min-w-0 flex-1 text-fg-muted">
          {method === 'UPI'
            ? 'Add your UPI ID or QR to show customers a scan-to-pay code here.'
            : 'Add your shop’s bank account to show customers where to transfer.'}
        </span>
        {canManage ? (
          <Link
            href="/app/settings/payments"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
          >
            <Plus aria-hidden className="size-4" />
            {method === 'UPI' ? 'Add UPI' : 'Add bank account'}
          </Link>
        ) : null}
      </div>
    );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/40 p-3 sm:p-4">
      <AccountChoice
        accounts={list}
        value={current?.id ?? null}
        onChange={onAccount}
        label={method === 'UPI' ? 'UPI account' : 'Bank account'}
        render={(a) =>
          method === 'UPI' ? (
            <>
              <UpiAppDot app={a.upiApp} />
              {a.label}
            </>
          ) : (
            <>
              <BankIcon
                bank={bankForIfsc(a.ifsc ?? '') ?? bankByName(a.bankName ?? '')}
                size="sm"
              />
              {a.label}
            </>
          )
        }
      />
      {current && method === 'UPI' ? (
        <UpiCard account={current} amountPaise={amountPaise} note={note} />
      ) : null}
      {current && method === 'BANK' ? (
        <BankCard account={current} amountPaise={amountPaise} />
      ) : null}
    </div>
  );
}

function UpiCard({
  account,
  amountPaise,
  note,
}: {
  account: PaymentAccount;
  amountPaise: number;
  note?: string;
}) {
  const [useImage, setUseImage] = useState(!account.upiId);
  useEffect(() => setUseImage(!account.upiId), [account.id, account.upiId]);
  const uri = account.upiId
    ? upiPaymentUri({
        upiId: account.upiId,
        payeeName: account.payeeName ?? account.label,
        amountPaise,
        note,
      })
    : null;
  return (
    <div
      className="flex flex-col items-center gap-4 sm:flex-row sm:items-start"
      data-testid="upi-qr"
    >
      <div className="shrink-0 rounded-xl border border-border bg-white p-1.5">
        {useImage && account.qrAttachmentId ? (
          <UploadedQr attachmentId={account.qrAttachmentId} size={176} />
        ) : uri ? (
          <QrSvg value={uri} size={176} />
        ) : (
          <div className="grid size-44 place-items-center text-center text-xs text-fg-muted">
            No UPI ID or QR image
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <UpiAppDot app={account.upiApp} />
          {account.label === UPI_APP_LABEL[account.upiApp ?? 'OTHER']
            ? account.label
            : `${UPI_APP_LABEL[account.upiApp ?? 'OTHER']} · ${account.label}`}
        </p>
        {account.upiId ? (
          <p className="flex flex-wrap items-center gap-1 text-fg-muted">
            <Smartphone aria-hidden className="size-4" />
            <span className="money font-medium text-fg">{account.upiId}</span>
            <CopyText text={account.upiId} label="UPI ID" />
          </p>
        ) : null}
        <p className="text-fg-muted">
          Amount:{' '}
          <strong className="text-lg text-fg">
            <Money paise={amountPaise} />
          </strong>
        </p>
        <p className="text-xs text-fg-muted">
          {useImage
            ? 'Customer scans your QR and enters the amount shown above.'
            : 'Customer scans with any UPI app — the amount is filled in automatically.'}
        </p>
        {account.upiId && account.qrAttachmentId ? (
          <button
            type="button"
            className="w-fit text-xs font-semibold text-brand hover:underline"
            onClick={() => setUseImage((v) => !v)}
          >
            {useImage ? 'Show QR with amount' : 'Show my printed QR instead'}
          </button>
        ) : null}
        <p className="text-xs font-medium text-warning">
          Check the payment in your UPI app before saving — this screen can’t see it arrive.
        </p>
      </div>
    </div>
  );
}

function BankCard({ account, amountPaise }: { account: PaymentAccount; amountPaise: number }) {
  const bank = bankForIfsc(account.ifsc ?? '') ?? bankByName(account.bankName ?? '');
  const rows: [string, string, boolean][] = [
    ['Account name', account.holderName ?? '', false],
    ['Account number', account.accountNumber ?? '', true],
    ['IFSC', account.ifsc ?? '', true],
    ['Bank', account.bankName ?? '', false],
  ];
  return (
    <div className="flex flex-col gap-3" data-testid="bank-details">
      <div className="flex items-center gap-3">
        <BankIcon bank={bank} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{account.label}</p>
          <p className="text-xs text-fg-muted">
            {account.accountType === 'SAVINGS' ? 'Savings' : 'Current'} account · transfer{' '}
            <Money paise={amountPaise} />
          </p>
        </div>
      </div>
      <dl className="grid gap-x-4 gap-y-1.5 rounded-lg bg-surface p-3 text-sm sm:grid-cols-2">
        {rows.map(([k, v, copy]) => (
          <div key={k} className="flex min-w-0 items-center justify-between gap-2">
            <dt className="text-fg-muted">{k}</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <span className={cn('truncate font-semibold', copy && 'money')}>{v}</span>
              {copy && v ? <CopyText text={v} label={k} /> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** "PhonePe counter · shop@ybl" — which of the shop's accounts a payment went into. */
export function PaidInto({ id }: { id: string }) {
  const { all } = usePaymentAccounts();
  const a = all.find((x) => x.id === id);
  if (!a) return <span className="text-fg-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {a.kind === 'UPI' ? (
        <UpiAppDot app={a.upiApp} />
      ) : (
        <Landmark aria-hidden className="size-4" />
      )}
      <span className="font-semibold">{a.label}</span>
      <span className="money text-fg-muted">
        {a.kind === 'UPI'
          ? (a.upiId ?? 'QR')
          : `${a.bankName ?? ''} ••••${(a.accountNumber ?? '').slice(-4)}`}
      </span>
    </span>
  );
}
