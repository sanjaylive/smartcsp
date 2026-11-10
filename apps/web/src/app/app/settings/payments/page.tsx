'use client';

/*
 * Settings → Payment accounts: where the shop receives customer payments.
 *   UPI   – UPI ID (we draw a QR with the amount filled in) and/or an uploaded QR image
 *           from PhonePe, Paytm, Google Pay, BHIM, BharatPe…
 *   Bank  – current / savings accounts shown to customers paying by bank transfer.
 * The default account of each kind is pre-selected on new records.
 */

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  ImageUp,
  Landmark,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { paymentAccountCreateSchema, upiPaymentUri, UPI_APPS } from '@csp2all/shared';
import { api, isApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, useFormErrors, usePermissions, zodToFieldErrors } from '@/lib/hooks';
import {
  maskAccount,
  paymentAccountsKey,
  UPI_APP_LABEL,
  usePaymentAccounts,
} from '@/lib/payment-accounts';
import { bankByName, bankForIfsc } from '@/lib/banks';
import type { PaymentAccount } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
} from '@/components/ui';
import { Drawer } from '@/components/ui/dialog';
import { QueryState } from '@/components/query-state';
import { BankIcon, BankPicker, useAccountVerify } from '@/components/beneficiary-form';
import { CopyText, QrSvg, UpiAppDot, UploadedQr } from '@/components/payment-collect';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

type Editing = { kind: 'UPI' | 'BANK'; account: PaymentAccount | null };

export default function PaymentAccountsPage() {
  const { can } = usePermissions();
  const manage = can('settings.manage');
  const { query, all } = usePaymentAccounts();
  const [editing, setEditing] = useState<Editing | null>(null);
  const upi = all.filter((a) => a.kind === 'UPI');
  const bank = all.filter((a) => a.kind === 'BANK');

  return (
    <>
      <PageHeader
        title="Payment accounts"
        description="Your UPI IDs, QR codes and bank accounts. When a customer pays by UPI or bank, the new-record screen shows these so they can pay you directly."
      />
      {!manage ? (
        <Alert tone="info" className="mb-4">
          Only the owner or a manager can change payment accounts.
        </Alert>
      ) : null}
      <QueryState query={query}>
        {() => (
          <div className="flex flex-col gap-8">
            <AccountSection
              icon={QrCode}
              title="UPI & QR codes"
              help="Add your UPI ID to show a QR with the amount already filled in. You can also upload the QR sticker from PhonePe, Paytm, Google Pay or BharatPe."
              addLabel="Add UPI"
              empty="No UPI account yet"
              onAdd={manage ? () => setEditing({ kind: 'UPI', account: null }) : undefined}
            >
              {upi.map((a) => (
                <UpiTile
                  key={a.id}
                  a={a}
                  manage={manage}
                  onEdit={() => setEditing({ kind: 'UPI', account: a })}
                />
              ))}
            </AccountSection>
            <AccountSection
              icon={Landmark}
              title="Bank accounts"
              help="Shown to customers who pay by bank transfer (IMPS / NEFT). Pick which account received the money on each record."
              addLabel="Add bank account"
              empty="No bank account yet"
              onAdd={manage ? () => setEditing({ kind: 'BANK', account: null }) : undefined}
            >
              {bank.map((a) => (
                <BankTile
                  key={a.id}
                  a={a}
                  manage={manage}
                  onEdit={() => setEditing({ kind: 'BANK', account: a })}
                />
              ))}
            </AccountSection>
          </div>
        )}
      </QueryState>
      {editing ? <AccountDrawer editing={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function AccountSection({
  icon: Icon,
  title,
  help,
  addLabel,
  empty,
  onAdd,
  children,
}: {
  icon: typeof QrCode;
  title: string;
  help: string;
  addLabel: string;
  empty: string;
  onAdd?: () => void;
  children: React.ReactNode[];
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-brand-bg text-brand">
            <Icon aria-hidden className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold">{title}</h2>
            <p className="max-w-2xl text-[13px] text-fg-muted">{help}</p>
          </div>
        </div>
        {onAdd ? (
          <Button size="sm" icon={<Plus aria-hidden className="size-4" />} onClick={onAdd}>
            {addLabel}
          </Button>
        ) : null}
      </div>
      {children.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
      ) : (
        <Card className="p-2">
          <EmptyState
            title={empty}
            description={onAdd ? 'Add one to start collecting digitally.' : undefined}
            action={
              onAdd ? (
                <Button
                  variant="outline"
                  icon={<Plus aria-hidden className="size-4" />}
                  onClick={onAdd}
                >
                  {addLabel}
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------------------- tiles */

function useAccountMutations(a: PaymentAccount) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const done = () => qc.invalidateQueries({ queryKey: paymentAccountsKey });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/v1/payment-accounts/${a.id}`, {
        method: 'PATCH',
        body: { version: a.version, ...body },
      }),
    onSuccess: () => void done(),
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const remove = useMutation({
    mutationFn: () =>
      api<{ deleted: boolean }>(`/v1/payment-accounts/${a.id}`, { method: 'DELETE' }),
    onSuccess: (r) => {
      void done();
      toast(
        'success',
        r.deleted ? `${a.label} deleted` : `${a.label} switched off (used on records)`,
      );
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  return { patch, remove };
}

function TileMenu({
  a,
  onEdit,
  extra,
}: {
  a: PaymentAccount;
  onEdit: () => void;
  extra?: React.ReactNode;
}) {
  const { patch, remove } = useAccountMutations(a);
  const item =
    'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-muted';
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${a.label}`}
          className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          <DM.Item className={item} onSelect={onEdit}>
            <Pencil aria-hidden className="size-4" /> Edit
          </DM.Item>
          {extra}
          {a.active && !a.isDefault ? (
            <DM.Item className={item} onSelect={() => patch.mutate({ isDefault: true })}>
              <Star aria-hidden className="size-4" /> Make default
            </DM.Item>
          ) : null}
          <DM.Item className={item} onSelect={() => patch.mutate({ active: !a.active })}>
            <ShieldCheck aria-hidden className="size-4" /> {a.active ? 'Switch off' : 'Switch on'}
          </DM.Item>
          <DM.Separator className="my-1 h-px bg-border" />
          <DM.Item
            className={cn(item, 'text-danger')}
            onSelect={() => {
              if (
                window.confirm(
                  `Delete ${a.label}? Accounts used on records are switched off instead.`,
                )
              )
                remove.mutate();
            }}
          >
            <Trash2 aria-hidden className="size-4" /> Delete
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function TileShell({
  a,
  children,
  menu,
}: {
  a: PaymentAccount;
  children: React.ReactNode;
  menu?: React.ReactNode;
}) {
  return (
    <Card className={cn('flex flex-col gap-3 p-4', !a.active && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h3 className="truncate font-bold">{a.label}</h3>
          {a.isDefault ? (
            <Badge tone="success" icon={<BadgeCheck aria-hidden className="size-3.5" />}>
              Default
            </Badge>
          ) : null}
          {!a.active ? <Badge tone="neutral">Off</Badge> : null}
        </div>
        {menu}
      </div>
      {children}
    </Card>
  );
}

function UpiTile({
  a,
  manage,
  onEdit,
}: {
  a: PaymentAccount;
  manage: boolean;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => uploadQr(a.id, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: paymentAccountsKey });
      toast('success', 'QR image uploaded');
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  return (
    <TileShell
      a={a}
      menu={
        manage ? (
          <TileMenu
            a={a}
            onEdit={onEdit}
            extra={
              <DM.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-muted"
                onSelect={() => fileRef.current?.click()}
              >
                <ImageUp aria-hidden className="size-4" />
                {a.qrAttachmentId ? 'Replace QR image' : 'Upload QR image'}
              </DM.Item>
            }
          />
        ) : null
      }
    >
      <div className="flex items-center gap-4">
        <div className="shrink-0 rounded-lg border border-border bg-white p-1">
          {a.qrAttachmentId ? (
            <UploadedQr attachmentId={a.qrAttachmentId} size={88} />
          ) : a.upiId ? (
            <QrSvg value={upiPaymentUri({ upiId: a.upiId, payeeName: a.payeeName })} size={88} />
          ) : (
            <div className="grid size-[88px] place-items-center text-[11px] text-fg-muted">
              No QR
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="flex items-center gap-1.5 font-semibold">
            <UpiAppDot app={a.upiApp} />
            {UPI_APP_LABEL[a.upiApp ?? 'OTHER']}
          </span>
          {a.upiId ? (
            <span className="flex flex-wrap items-center gap-1">
              <span className="money truncate">{a.upiId}</span>
              <CopyText text={a.upiId} label="UPI ID" />
            </span>
          ) : (
            <span className="text-fg-muted">QR image only</span>
          )}
          {a.payeeName ? (
            <span className="truncate text-xs text-fg-muted">{a.payeeName}</span>
          ) : null}
        </div>
      </div>
      {manage && !a.qrAttachmentId ? (
        <Button
          size="sm"
          variant="outline"
          loading={upload.isPending}
          icon={<ImageUp aria-hidden className="size-4" />}
          onClick={() => fileRef.current?.click()}
        >
          Upload QR image (optional)
        </Button>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate(f);
          e.target.value = '';
        }}
      />
    </TileShell>
  );
}

function BankTile({
  a,
  manage,
  onEdit,
}: {
  a: PaymentAccount;
  manage: boolean;
  onEdit: () => void;
}) {
  const bank = bankForIfsc(a.ifsc ?? '') ?? bankByName(a.bankName ?? '');
  return (
    <TileShell a={a} menu={manage ? <TileMenu a={a} onEdit={onEdit} /> : null}>
      <div className="flex items-center gap-3">
        <BankIcon bank={bank} />
        <div className="min-w-0 text-sm">
          <p className="truncate font-semibold">{a.bankName}</p>
          <p className="text-xs text-fg-muted">
            {a.accountType === 'SAVINGS' ? 'Savings' : 'Current'} · {a.holderName}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 rounded-lg bg-surface-muted/60 p-2.5 text-sm">
        <div>
          <dt className="text-[11px] text-fg-muted uppercase">Account</dt>
          <dd className="money font-semibold">{maskAccount(a.accountNumber)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-fg-muted uppercase">IFSC</dt>
          <dd className="money font-semibold">{a.ifsc}</dd>
        </div>
      </dl>
    </TileShell>
  );
}

async function uploadQr(accountId: string, file: File) {
  const fd = new FormData();
  fd.set('ownerType', 'PAYMENT_QR');
  fd.set('ownerId', accountId);
  fd.set('file', file);
  await api('/v1/attachments', { method: 'POST', formData: fd });
}

/* ----------------------------------------------------------------------------- add / edit */

function AccountDrawer({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const errs = useFormErrors();
  const verify = useAccountVerify();
  const a = editing.account;
  const kind = editing.kind;
  const [label, setLabel] = useState(a?.label ?? '');
  const [upiApp, setUpiApp] = useState(a?.upiApp ?? 'PHONEPE');
  const [upiId, setUpiId] = useState(a?.upiId ?? '');
  const [payeeName, setPayeeName] = useState(a?.payeeName ?? '');
  const [holderName, setHolderName] = useState(a?.holderName ?? '');
  const [bankName, setBankName] = useState(a?.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(a?.accountNumber ?? '');
  const [ifsc, setIfsc] = useState(a?.ifsc ?? '');
  const [accountType, setAccountType] = useState(a?.accountType ?? 'CURRENT');
  const [isDefault, setIsDefault] = useState(a?.isDefault ?? false);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);

  const body =
    kind === 'UPI'
      ? {
          kind,
          label: label || UPI_APP_LABEL[upiApp] || 'UPI',
          upiId: upiId.trim() || null,
          payeeName: payeeName.trim() || null,
          upiApp,
          isDefault,
        }
      : { kind, label, holderName, bankName, accountNumber, ifsc, accountType, isDefault };

  const save = useMutation({
    mutationFn: async () => {
      errs.clear();
      if (kind === 'UPI' && !upiId.trim() && !qrFile && !a?.qrAttachmentId)
        throw Object.assign(new Error('Enter a UPI ID or upload a QR image'), {
          fields: { upiId: ['Enter a UPI ID or upload a QR image'] },
        });
      const parsed = paymentAccountCreateSchema.safeParse(body);
      if (!parsed.success) {
        errs.setFields(zodToFieldErrors(parsed.error));
        throw new Error('invalid');
      }
      const { kind: _k, ...rest } = parsed.data;
      const saved = a
        ? await api<PaymentAccount>(`/v1/payment-accounts/${a.id}`, {
            method: 'PATCH',
            body: { version: a.version, ...rest },
          })
        : await api<PaymentAccount>('/v1/payment-accounts', { method: 'POST', body: parsed.data });
      if (qrFile) await uploadQr(saved.id, qrFile);
      return saved;
    },
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: paymentAccountsKey });
      toast('success', `${s.label} saved`);
      onClose();
    },
    onError: (e) => {
      if ((e as { fields?: Record<string, string[]> }).fields)
        errs.setFields((e as unknown as { fields: Record<string, string[]> }).fields);
      else if (isApiError(e)) errs.fromError(e);
      else if ((e as Error).message !== 'invalid') toast('error', errorMessage(t, e));
    },
  });

  const runVerify = async () => {
    setVerifying(true);
    setVerifiedName(null);
    try {
      const r = await api<{ verified: boolean; name?: string; message?: string }>(
        '/v1/beneficiaries/verify',
        { method: 'POST', body: { accountNumber, ifsc } },
      );
      if (r.verified && r.name) {
        setVerifiedName(r.name);
        if (!holderName.trim()) setHolderName(r.name);
      } else toast('error', r.message ?? 'Account not found');
    } catch (e) {
      toast('error', errorMessage(t, e));
    } finally {
      setVerifying(false);
    }
  };

  const previewUri =
    kind === 'UPI' && /^[\w.\-]+@[a-z][a-z0-9]+$/i.test(upiId.trim())
      ? upiPaymentUri({ upiId: upiId.trim(), payeeName: payeeName || label })
      : null;

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${a ? 'Edit' : 'Add'} ${kind === 'UPI' ? 'UPI account' : 'bank account'}`}
      description={
        kind === 'UPI'
          ? 'Customers scan this to pay you. Money goes straight to your UPI app.'
          : 'Customers paying by bank transfer will see these details.'
      }
      icon={
        <span className="grid size-10 place-items-center rounded-xl bg-brand-bg text-brand">
          {kind === 'UPI' ? (
            <QrCode aria-hidden className="size-5" />
          ) : (
            <Landmark aria-hidden className="size-5" />
          )}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {errs.formError && !Object.keys(errs.fields).length ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
        {kind === 'UPI' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">UPI app</span>
              <div role="radiogroup" aria-label="UPI app" className="flex flex-wrap gap-2">
                {UPI_APPS.map((app) => (
                  <button
                    key={app}
                    type="button"
                    role="radio"
                    aria-checked={upiApp === app}
                    onClick={() => setUpiApp(app)}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-2 rounded-[10px] border px-3 text-sm font-semibold transition',
                      upiApp === app
                        ? 'border-brand bg-brand-bg text-brand-strong dark:text-fg'
                        : 'border-border hover:border-brand/40',
                    )}
                  >
                    <UpiAppDot app={app} />
                    {UPI_APP_LABEL[app]}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label="UPI ID"
              help="Shown on your QR sticker, e.g. 9876543210@ybl or myshop@paytm"
              error={errs.get('upiId')}
            >
              {(p) => (
                <Input
                  id={p.id}
                  aria-describedby={p.describedBy}
                  aria-invalid={p.invalid || undefined}
                  autoCapitalize="none"
                  placeholder="myshop@ybl"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name customers see"
                optionalLabel="optional"
                error={errs.get('payeeName')}
              >
                {(p) => (
                  <Input
                    id={p.id}
                    placeholder="My Shop"
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Account nickname" error={errs.get('label')} help="e.g. PhonePe counter">
                {(p) => (
                  <Input
                    id={p.id}
                    aria-invalid={p.invalid || undefined}
                    placeholder={UPI_APP_LABEL[upiApp]}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-4 sm:flex-row sm:items-center">
              <div className="shrink-0 rounded-lg border border-border bg-white p-1">
                {qrFile ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={URL.createObjectURL(qrFile)}
                    alt="Selected QR"
                    className="size-24 object-contain"
                  />
                ) : a?.qrAttachmentId ? (
                  <UploadedQr attachmentId={a.qrAttachmentId} size={96} />
                ) : previewUri ? (
                  <QrSvg value={previewUri} size={96} />
                ) : (
                  <div className="grid size-24 place-items-center text-[11px] text-fg-muted">
                    QR
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                <p className="font-semibold">QR sticker image (optional)</p>
                <p className="text-[13px] text-fg-muted">
                  Upload a photo or screenshot of your PhonePe / Paytm / GPay QR. With a UPI ID we
                  can also draw a QR that fills in the amount.
                </p>
                <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-muted">
                  <ImageUp aria-hidden className="size-4" />
                  {qrFile ? qrFile.name : a?.qrAttachmentId ? 'Replace image' : 'Choose image'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    onChange={(e) => setQrFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>
          </>
        ) : (
          <>
            <Field label="Bank" required error={errs.get('bankName')}>
              {(p) => (
                <BankPicker
                  id={p.id}
                  value={bankName}
                  onChange={setBankName}
                  invalid={p.invalid}
                  describedBy={p.describedBy}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account number" required error={errs.get('accountNumber')}>
                {(p) => (
                  <Input
                    id={p.id}
                    inputMode="numeric"
                    className="money"
                    aria-invalid={p.invalid || undefined}
                    value={accountNumber}
                    onChange={(e) => {
                      setAccountNumber(e.target.value.replace(/[^\d\s-]/g, ''));
                      setVerifiedName(null);
                    }}
                  />
                )}
              </Field>
              <Field label="IFSC" required error={errs.get('ifsc')}>
                {(p) => (
                  <Input
                    id={p.id}
                    className="money uppercase"
                    maxLength={11}
                    aria-invalid={p.invalid || undefined}
                    placeholder="SBIN0001234"
                    value={ifsc}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setIfsc(v);
                      const b = bankForIfsc(v);
                      if (b && !bankName) setBankName(b.name);
                      setVerifiedName(null);
                    }}
                  />
                )}
              </Field>
            </div>
            <Field
              label="Account holder name"
              required
              error={errs.get('holderName')}
              badge={
                verifiedName ? (
                  <Badge tone="success" icon={<BadgeCheck aria-hidden className="size-3.5" />}>
                    Verified: {verifiedName}
                  </Badge>
                ) : null
              }
            >
              {(p) => (
                <div className="flex gap-2">
                  <Input
                    id={p.id}
                    aria-invalid={p.invalid || undefined}
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                  />
                  {verify.data?.available ? (
                    <Button
                      variant="outline"
                      loading={verifying}
                      disabled={
                        !/^\d{9,18}$/.test(accountNumber.replace(/\D/g, '')) || ifsc.length !== 11
                      }
                      onClick={() => void runVerify()}
                    >
                      Verify
                    </Button>
                  ) : null}
                </div>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Account type</span>
                <div role="radiogroup" aria-label="Account type" className="flex gap-2">
                  {(['CURRENT', 'SAVINGS'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={accountType === t}
                      onClick={() => setAccountType(t)}
                      className={cn(
                        'min-h-10 flex-1 rounded-[10px] border px-3 text-sm font-semibold',
                        accountType === t
                          ? 'border-brand bg-brand-bg text-brand-strong dark:text-fg'
                          : 'border-border hover:border-brand/40',
                      )}
                    >
                      {t === 'CURRENT' ? 'Current' : 'Savings'}
                    </button>
                  ))}
                </div>
              </div>
              <Field
                label="Account nickname"
                required
                error={errs.get('label')}
                help="e.g. SBI current"
              >
                {(p) => (
                  <Input
                    id={p.id}
                    aria-invalid={p.invalid || undefined}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </>
        )}
        <div className="rounded-xl bg-surface-muted/60 p-3">
          <Checkbox
            checked={isDefault}
            onChange={setIsDefault}
            label={<span className="font-semibold">Use as default</span>}
            description={`Pre-selected when a customer pays by ${kind === 'UPI' ? 'UPI' : 'bank transfer'}.`}
          />
        </div>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Drawer>
  );
}
