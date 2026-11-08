'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, Mail, MessageSquare, Printer, Send, Share2 } from 'lucide-react';
import { formatDateTime, formatINR } from '@csp2all/shared';
import { api, isApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, useFormErrors } from '@/lib/hooks';
import { Alert, Button, Field, Input } from '@/components/ui';
import { Drawer } from '@/components/ui/dialog';
import { QueryState } from '@/components/query-state';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

interface Receipt {
  shop: {
    name: string;
    address: string | null;
    place: string | null;
    phone: string | null;
    footer: string | null;
    brandColor: string | null;
  };
  receiptNo: string;
  recordId: string;
  issuedAt: string;
  txnDate: string;
  service: string;
  status: string;
  customer: { name: string; phone: string | null };
  details: { label: string; value: string }[];
  amounts: {
    principalLabel: string | null;
    principalPaise: number;
    feePaise: number;
    totalPaise: number;
    paidPaise: number;
    duePaise: number;
  };
  paidVia: string | null;
  reference: string | null;
  provider: string | null;
  text: string;
  canEmailCustomer: boolean;
  canMessageCustomer: boolean;
  customerPhone: string | null;
}

type Paper = 'full' | '80' | '58';
const PAPERS: { key: Paper; label: string }[] = [
  { key: 'full', label: 'A5 / full page' },
  { key: '80', label: 'Thermal 80mm' },
  { key: '58', label: 'Thermal 58mm' },
];

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({
    queryKey: ['records', 'receipt', id],
    queryFn: () => api<Receipt>(`/v1/records/${id}/receipt`),
  });
  return <QueryState query={q}>{(r) => <ReceiptView r={r} />}</QueryState>;
}

function ReceiptView({ r }: { r: Receipt }) {
  const { t } = useI18n();
  const toast = useToast();
  const [paper, setPaper] = useState<Paper>('full');
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && 'share' in navigator), []);
  // Remember the shop's paper size (e.g. their thermal printer) between receipts.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('csp_receipt_paper') as Paper | null;
      if (saved && PAPERS.some((p) => p.key === saved)) setPaper(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const choosePaper = (p: Paper) => {
    setPaper(p);
    try {
      localStorage.setItem('csp_receipt_paper', p);
    } catch {
      /* storage unavailable */
    }
  };

  const plain = r.text.replace(/\*/g, '');
  const waHref = `https://wa.me/${r.customerPhone ? `91${r.customerPhone}` : ''}?text=${encodeURIComponent(r.text)}`;

  const sendWhatsApp = async () => {
    setSending(true);
    try {
      const res = await api<{ to: string }>(`/v1/records/${r.recordId}/receipt/send`, {
        method: 'POST',
        body: { channel: 'whatsapp' },
      });
      toast('success', `Receipt sent to ${res.to}`);
    } catch (e) {
      toast(
        'error',
        isApiError(e, 'MESSAGING_NOT_CONFIGURED')
          ? 'Automatic WhatsApp is not connected. Use “WhatsApp” to send from your phone.'
          : errorMessage(t, e),
      );
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('error', 'Could not copy — select the text and copy it instead.');
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: `Receipt ${r.receiptNo}`, text: plain });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <>
      {/* thermal printers need the page size set to the roll width */}
      <style>{`@media print { @page { size: ${paper === 'full' ? 'A5' : `${paper}mm auto`}; margin: ${paper === 'full' ? '12mm' : '2mm'}; } }`}</style>

      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={`/app/records/${r.recordId}`}
          className="mr-auto inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to record
        </Link>
        <div
          role="radiogroup"
          aria-label="Paper size"
          className="inline-flex rounded-lg border border-border bg-surface p-0.5"
        >
          {PAPERS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={paper === p.key}
              onClick={() => choosePaper(p.key)}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-semibold transition',
                paper === p.key ? 'bg-brand-bg text-brand' : 'text-fg-muted hover:text-fg',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px] print:block">
        {/* the receipt itself */}
        <div className="flex justify-center rounded-2xl bg-surface-muted/60 p-4 sm:p-8 print:bg-transparent print:p-0">
          <ReceiptPaper r={r} paper={paper} />
        </div>

        {/* actions */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-20 print:hidden">
          <div className="card flex flex-col gap-2 p-4">
            <p className="mb-1 text-sm font-bold">Give the receipt</p>
            <Button
              size="lg"
              icon={<Printer aria-hidden className="size-4" />}
              onClick={() => window.print()}
            >
              Print
            </Button>
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-[#25D366] px-5 text-[15px] font-semibold text-[#0b3d22] transition hover:brightness-95"
            >
              <MessageSquare aria-hidden className="size-4" /> WhatsApp
            </a>
            <Button
              variant="outline"
              icon={<Mail aria-hidden className="size-4" />}
              onClick={() => setEmailOpen(true)}
            >
              Email
            </Button>
            {canShare ? (
              <Button
                variant="outline"
                icon={<Share2 aria-hidden className="size-4" />}
                onClick={() => void share()}
              >
                Share…
              </Button>
            ) : null}
            <Button
              variant="ghost"
              icon={
                copied ? (
                  <Check aria-hidden className="size-4" />
                ) : (
                  <Copy aria-hidden className="size-4" />
                )
              }
              onClick={() => void copy()}
            >
              {copied ? 'Copied' : 'Copy text'}
            </Button>
          </div>

          {r.canMessageCustomer ? (
            <div className="card p-4">
              <p className="text-sm font-bold">Send automatically</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                From your shop&apos;s WhatsApp/SMS number (needs SMS21 connected in Integrations).
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3 w-full"
                loading={sending}
                icon={<Send aria-hidden className="size-4" />}
                onClick={() => void sendWhatsApp()}
              >
                Send to {r.customer.phone ?? 'customer'}
              </Button>
            </div>
          ) : null}

          <p className="px-1 text-xs text-fg-muted">
            {r.customerPhone
              ? 'WhatsApp opens a chat with the customer with the receipt ready to send.'
              : 'WhatsApp opens with the receipt ready — pick the customer in WhatsApp.'}
          </p>
        </aside>
      </div>

      {emailOpen ? <EmailDrawer r={r} onClose={() => setEmailOpen(false)} /> : null}
    </>
  );
}

function ReceiptPaper({ r, paper }: { r: Receipt; paper: Paper }) {
  const a = r.amounts;
  const thermal = paper !== 'full';
  const Row = ({ l, v, strong }: { l: string; v: string; strong?: boolean }) => (
    <div className={cn('flex justify-between gap-3', strong && 'font-bold')}>
      <span className={cn(!strong && 'text-[#6f6558]')}>{l}</span>
      <span className="text-right">{v}</span>
    </div>
  );
  return (
    <article
      aria-label={`Receipt ${r.receiptNo}`}
      className={cn(
        'bg-white text-[#22201d] shadow-[0_8px_30px_-10px_rgba(0,0,0,0.25)] print:shadow-none',
        thermal
          ? cn(
              'font-mono',
              paper === '80' ? 'w-[80mm] text-[12px]' : 'w-[58mm] text-[10.5px]',
              'px-3 py-4',
            )
          : 'w-full max-w-[148mm] rounded-xl text-sm',
      )}
    >
      {/* header */}
      <header
        className={cn(thermal ? 'text-center' : 'rounded-t-xl px-6 py-5 text-white')}
        style={
          thermal
            ? undefined
            : {
                background: /^#[0-9a-f]{6}$/i.test(r.shop.brandColor ?? '')
                  ? r.shop.brandColor!
                  : '#b53927',
              }
        }
      >
        <p
          className={cn('font-bold', thermal ? 'text-[1.25em] uppercase' : 'font-display text-xl')}
        >
          {r.shop.name}
        </p>
        {r.shop.address || r.shop.place ? (
          <p className={cn(thermal ? '' : 'text-xs opacity-90')}>
            {[r.shop.address, r.shop.place].filter(Boolean).join(', ')}
          </p>
        ) : null}
        {r.shop.phone ? (
          <p className={cn(thermal ? '' : 'text-xs opacity-90')}>Ph: {r.shop.phone}</p>
        ) : null}
      </header>

      <div className={cn(thermal ? 'mt-3' : 'px-6 py-5')}>
        <div
          className={cn(
            'flex items-baseline justify-between',
            thermal ? 'border-y border-dashed border-black/40 py-1.5' : 'mb-4',
          )}
        >
          <span className={cn('font-bold', !thermal && 'text-base')}>RECEIPT</span>
          <span className="font-semibold">{r.receiptNo}</span>
        </div>

        <div className={cn('flex flex-col', thermal ? 'mt-2 gap-0.5' : 'gap-1.5')}>
          <Row l="Date" v={formatDateTime(r.issuedAt)} />
          <Row l="Customer" v={r.customer.name} />
          {r.customer.phone ? <Row l="Mobile" v={r.customer.phone} /> : null}
          <Row l="Service" v={r.service} />
          <Row l="Status" v={r.status} />
          {r.details.map((d) => (
            <Row key={d.label} l={d.label} v={d.value} />
          ))}
          {r.provider ? <Row l="Portal" v={r.provider} /> : null}
          {r.reference ? <Row l="Reference" v={r.reference} /> : null}
        </div>

        <div
          className={cn(
            'my-3 border-t border-dashed',
            thermal ? 'border-black/40' : 'border-[#e8e0d5]',
          )}
        />

        <div className={cn('flex flex-col', thermal ? 'gap-0.5' : 'gap-1.5')}>
          {a.principalLabel && a.principalPaise ? (
            <Row l={a.principalLabel} v={formatINR(a.principalPaise)} />
          ) : null}
          <Row l="Service charge" v={formatINR(a.feePaise)} />
          <div
            className={cn(
              thermal
                ? 'border-t border-dashed border-black/40 pt-1'
                : 'mt-1 rounded-lg bg-[#faf8f3] px-3 py-2',
            )}
          >
            <Row l="Total" v={formatINR(a.totalPaise)} strong />
            <Row l={`Paid${r.paidVia ? ` (${r.paidVia})` : ''}`} v={formatINR(a.paidPaise)} />
            {a.duePaise > 0 ? <Row l="Balance due" v={formatINR(a.duePaise)} strong /> : null}
          </div>
        </div>

        <p className={cn('text-center', thermal ? 'mt-3' : 'mt-5 font-semibold')}>
          {r.shop.footer || 'Thank you for visiting!'}
        </p>
        <p
          className={cn(
            'mt-2 text-center text-[#6f6558]',
            thermal ? 'text-[0.85em]' : 'text-[11px]',
          )}
        >
          Shop record of the service provided. Not a bank or government receipt.
        </p>
      </div>
    </article>
  );
}

function EmailDrawer({ r, onClose }: { r: Receipt; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errs = useFormErrors();
  const [useSaved, setUseSaved] = useState(r.canEmailCustomer);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    errs.clear();
    if (!useSaved && !/^\S+@\S+\.\S+$/.test(to.trim()))
      return errs.setFields({ to: ['Enter a valid email address'] });
    setBusy(true);
    try {
      const res = await api<{ to: string }>(`/v1/records/${r.recordId}/receipt/send`, {
        method: 'POST',
        body: { channel: 'email', to: useSaved ? null : to.trim() },
      });
      toast('success', `Receipt emailed to ${res.to}`);
      onClose();
    } catch (e) {
      errs.fromError(e);
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Email receipt"
      description={`${r.receiptNo} · ${r.customer.name}`}
      icon={
        <span className="grid size-10 place-items-center rounded-xl bg-brand-bg text-brand">
          <Mail aria-hidden className="size-5" />
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={send} loading={busy} icon={<Send aria-hidden className="size-4" />}>
            Send
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {r.canEmailCustomer ? (
          <div role="radiogroup" aria-label="Send to" className="grid gap-2">
            {[
              [true, 'Customer’s saved email'],
              [false, 'Another email address'],
            ].map(([v, label]) => (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={useSaved === v}
                onClick={() => setUseSaved(v as boolean)}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition',
                  useSaved === v
                    ? 'border-brand bg-brand-bg ring-1 ring-brand'
                    : 'border-border hover:border-brand/40',
                )}
              >
                {label as string}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">
            This customer has no saved email. Enter one below.
          </p>
        )}
        {!useSaved ? (
          <Field label="Email address" required error={errs.get('to')}>
            {(p) => (
              <Input
                id={p.id}
                type="email"
                inputMode="email"
                autoComplete="email"
                aria-describedby={p.describedBy}
                aria-invalid={p.invalid || undefined}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        {errs.formMessage && !Object.keys(errs.fields).length ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
      </div>
    </Drawer>
  );
}
