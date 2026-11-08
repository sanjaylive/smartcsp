'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Clock,
  Download,
  FileImage,
  Landmark,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  beneficiaryCreateSchema,
  customerKycSchema,
  KYC_ID_TYPES,
  KYC_STATUSES,
} from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, useFormErrors, usePermissions, zodToFieldErrors } from '@/lib/hooks';
import { openSignedUrl } from '@/lib/download';
import type { Beneficiary, CustomerKyc, CustomerKycDetail, KycStatus } from '@/lib/types';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from './ui';
import { Drawer } from './ui/dialog';
import { useToast } from './ui/toast';
import { cn } from '@/lib/cn';

export const ID_TYPE_LABEL: Record<string, string> = {
  AADHAAR: 'Aadhaar',
  PAN: 'PAN card',
  VOTER_ID: 'Voter ID',
  DRIVING_LICENCE: 'Driving licence',
  PASSPORT: 'Passport',
  RATION_CARD: 'Ration card',
  OTHER: 'Other ID',
};

const STATUS: Record<
  KycStatus,
  { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger'; icon: typeof ShieldCheck }
> = {
  NONE: { label: 'KYC not done', tone: 'neutral', icon: ShieldAlert },
  PENDING: { label: 'KYC pending', tone: 'warning', icon: Clock },
  VERIFIED: { label: 'KYC verified', tone: 'success', icon: BadgeCheck },
  REJECTED: { label: 'KYC rejected', tone: 'danger', icon: XCircle },
};

export function KycBadge({
  kyc,
  className,
}: {
  kyc?: Pick<CustomerKyc, 'status' | 'idType' | 'idLast4'> | null;
  className?: string;
}) {
  const s = STATUS[kyc?.status ?? 'NONE'];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} icon={<Icon aria-hidden className="size-3.5" />} className={className}>
      {s.label}
      {kyc?.status === 'VERIFIED' && kyc.idType ? (
        <span className="font-normal">
          {' '}
          · {ID_TYPE_LABEL[kyc.idType] ?? kyc.idType}
          {kyc.idLast4 ? ` ••${kyc.idLast4}` : ''}
        </span>
      ) : null}
    </Badge>
  );
}

export const kycKey = (id: string) => ['customers', id, 'kyc'] as const;

/** View and update a customer's KYC: status, masked ID and ID photos. */
export function KycDrawer({
  customerId,
  customerName,
  onClose,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const errs = useFormErrors();
  const canEdit = can('customers.manage') && can('customers.view_sensitive');
  const canUpload = canEdit && can('attachments.upload');
  const fileRef = useRef<HTMLInputElement>(null);
  const q = useQuery({
    queryKey: kycKey(customerId),
    queryFn: () => api<CustomerKycDetail>(`/v1/customers/${customerId}/kyc`),
  });
  const [form, setForm] = useState<{
    status: KycStatus;
    idType: string;
    idLast4: string;
    remarks: string;
  } | null>(null);
  const k = q.data;
  const f =
    form ??
    (k
      ? {
          status: k.status,
          idType: k.idType ?? '',
          idLast4: k.idLast4 ?? '',
          remarks: k.remarks ?? '',
        }
      : null);
  const set = (patch: Partial<NonNullable<typeof f>>) => f && setForm({ ...f, ...patch });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    if (!k || !f) return;
    errs.clear();
    const body = {
      version: k.version,
      status: f.status,
      idType: f.idType || null,
      idLast4: f.idLast4.trim() || null,
      remarks: f.remarks.trim() || null,
    };
    const r = customerKycSchema.safeParse(body);
    if (!r.success) return errs.setFields(zodToFieldErrors(r.error));
    setBusy(true);
    try {
      await api(`/v1/customers/${customerId}/kyc`, { method: 'PATCH', body });
      toast('success', 'KYC updated');
      void qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    } catch (e) {
      errs.fromError(e);
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('ownerType', 'CUSTOMER_KYC');
      fd.set('ownerId', customerId);
      await api('/v1/attachments', { method: 'POST', formData: fd });
      toast('success', t('attachments.uploaded'));
      void qc.invalidateQueries({ queryKey: kycKey(customerId) });
    } catch (e) {
      toast('error', errorMessage(t, e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Customer KYC"
      description={customerName}
      icon={
        <span className="grid size-10 place-items-center rounded-xl bg-brand-bg text-brand">
          <ShieldCheck aria-hidden className="size-5" />
        </span>
      }
      footer={
        canEdit ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} loading={busy} disabled={!k}>
              {t('common.save')}
            </Button>
          </>
        ) : undefined
      }
    >
      {q.isError ? (
        <Alert tone="danger">{errorMessage(t, q.error)}</Alert>
      ) : !f || !k ? (
        <p className="text-sm text-fg-muted">{t('common.loading')}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <fieldset disabled={!canEdit}>
            <legend className="mb-2 text-sm font-semibold">Status</legend>
            <div className="grid grid-cols-2 gap-2">
              {KYC_STATUSES.map((s) => {
                const meta = STATUS[s];
                const Icon = meta.icon;
                const on = f.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ status: s })}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition',
                      on
                        ? 'border-brand bg-brand-bg ring-1 ring-brand'
                        : 'border-border hover:border-brand/40',
                    )}
                  >
                    <Icon aria-hidden className="size-4 shrink-0" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {f.status !== 'NONE' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ID type" required={f.status === 'VERIFIED'} error={errs.get('idType')}>
                {(p) => (
                  <Select
                    id={p.id}
                    value={f.idType}
                    disabled={!canEdit}
                    onChange={(e) => set({ idType: e.target.value })}
                  >
                    <option value="">Choose…</option>
                    {KYC_ID_TYPES.map((x) => (
                      <option key={x} value={x}>
                        {ID_TYPE_LABEL[x]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                label="Last 4 characters of ID"
                required={f.status === 'VERIFIED'}
                help="Never type the full number."
                error={errs.get('idLast4')}
              >
                {(p) => (
                  <Input
                    id={p.id}
                    aria-describedby={p.describedBy}
                    aria-invalid={p.invalid || undefined}
                    maxLength={4}
                    autoComplete="off"
                    className="money uppercase tracking-[0.3em]"
                    value={f.idLast4}
                    disabled={!canEdit}
                    onChange={(e) =>
                      set({ idLast4: e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4) })
                    }
                  />
                )}
              </Field>
              <Field
                label="Remarks"
                optionalLabel={t('common.optional')}
                className="sm:col-span-2"
                error={errs.get('remarks')}
              >
                {(p) => (
                  <Textarea
                    id={p.id}
                    rows={2}
                    maxLength={300}
                    value={f.remarks}
                    disabled={!canEdit}
                    onChange={(e) => set({ remarks: e.target.value })}
                  />
                )}
              </Field>
            </div>
          ) : null}

          <section aria-labelledby="kyc-docs">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id="kyc-docs" className="text-sm font-semibold">
                ID documents
              </h3>
              {canUpload ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    className="sr-only"
                    onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    loading={uploading}
                    icon={<Upload aria-hidden className="size-4" />}
                    onClick={() => fileRef.current?.click()}
                  >
                    Upload photo
                  </Button>
                </>
              ) : null}
            </div>
            <Alert tone="warning">
              For Aadhaar, upload a <strong>masked Aadhaar</strong> (only the last 4 digits
              visible). Photos are private: only staff allowed to see sensitive customer data can
              open them.
            </Alert>
            {k.documents.length ? (
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {k.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                    <FileImage aria-hidden className="size-5 text-fg-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{d.fileName}</span>
                      <span className="block text-xs text-fg-muted">
                        {Math.ceil(d.sizeBytes / 1024)} KB ·{' '}
                        {d.scanStatus === 'PENDING'
                          ? t('attachments.scanning')
                          : d.scanStatus === 'INFECTED'
                            ? t('attachments.blocked')
                            : t('attachments.ready')}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('attachments.download', { name: d.fileName })}
                      disabled={d.scanStatus === 'INFECTED'}
                      onClick={() =>
                        openSignedUrl(`/v1/attachments/${d.id}/url`).catch((e) =>
                          toast('error', errorMessage(t, e)),
                        )
                      }
                    >
                      <Download aria-hidden className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-fg-muted">No documents uploaded.</p>
            )}
          </section>

          {errs.formMessage && !Object.keys(errs.fields).length ? (
            <Alert tone="danger">{errs.formMessage}</Alert>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}

/** Sidebar card on the customer page: KYC status with a button to open the KYC drawer. */
export function KycCard({
  customer,
}: {
  customer: { id: string; name: string; kyc?: CustomerKyc };
}) {
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const canSee = can('customers.view_sensitive');
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
          <ShieldCheck aria-hidden className="size-4" /> KYC
        </p>
        {canSee ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {customer.kyc?.status === 'VERIFIED' ? 'View' : 'Do KYC'}
          </Button>
        ) : null}
      </div>
      <div className="mt-2">
        <KycBadge kyc={customer.kyc} />
      </div>
      {customer.kyc?.verifiedAt ? (
        <p className="mt-2 text-xs text-fg-muted">
          Verified on {new Date(customer.kyc.verifiedAt).toLocaleDateString('en-IN')}
        </p>
      ) : null}
      {open ? (
        <KycDrawer
          customerId={customer.id}
          customerName={customer.name}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Saved DMT beneficiaries for a customer, with add and turn-off. */
export function BeneficiariesCard({ customerId }: { customerId: string }) {
  const { t } = useI18n();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['customers', customerId, 'beneficiaries'];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<{ items: Beneficiary[] }>(`/v1/customers/${customerId}/beneficiaries`),
  });
  const [adding, setAdding] = useState(false);
  const manage = can('customers.manage');
  const toggle = async (b: Beneficiary) => {
    try {
      await api(`/v1/customers/${customerId}/beneficiaries/${b.id}`, {
        method: 'PATCH',
        body: { version: b.version, active: !b.active },
      });
      void qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast('error', errorMessage(t, e));
    }
  };
  const items = q.data?.items ?? [];
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-[15px] font-bold">
          <Landmark aria-hidden className="size-4 text-fg-muted" /> Beneficiaries
        </p>
        {manage ? (
          <Button
            size="sm"
            variant="outline"
            icon={<Plus aria-hidden className="size-4" />}
            onClick={() => setAdding(true)}
          >
            Add
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-fg-muted">
          No saved beneficiaries. They are added when you record a money transfer.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((b) => (
            <li
              key={b.id}
              className={cn('flex items-center gap-3 px-4 py-2.5', !b.active && 'opacity-55')}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{b.name}</span>
                <span className="block truncate text-xs text-fg-muted">
                  {b.bankName} · {b.accountNumber}
                  {b.ifsc ? ` · ${b.ifsc}` : ''}
                </span>
              </span>
              {manage ? (
                <Button size="sm" variant="ghost" onClick={() => void toggle(b)}>
                  {b.active ? 'Turn off' : 'Turn on'}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <BeneficiaryDrawer customerId={customerId} onClose={() => setAdding(false)} />
      ) : null}
    </div>
  );
}

function BeneficiaryDrawer({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const errs = useFormErrors();
  const [f, setF] = useState({ name: '', bankName: '', accountNumber: '', ifsc: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    errs.clear();
    const body = { ...f, ifsc: f.ifsc.trim() || null };
    const r = beneficiaryCreateSchema.safeParse(body);
    if (!r.success) return errs.setFields(zodToFieldErrors(r.error));
    setBusy(true);
    try {
      await api(`/v1/customers/${customerId}/beneficiaries`, { method: 'POST', body: r.data });
      void qc.invalidateQueries({ queryKey: ['customers', customerId, 'beneficiaries'] });
      onClose();
    } catch (e) {
      errs.fromError(e);
      setBusy(false);
    }
  };
  const input = (
    k: keyof typeof f,
    label: string,
    extra: Record<string, unknown> = {},
    required = true,
  ) => (
    <Field
      label={label}
      required={required}
      optionalLabel={required ? undefined : t('common.optional')}
      error={errs.get(k)}
    >
      {(p) => (
        <Input
          id={p.id}
          aria-describedby={p.describedBy}
          aria-invalid={p.invalid || undefined}
          value={f[k]}
          onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
          {...extra}
        />
      )}
    </Field>
  );
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add beneficiary"
      icon={
        <span className="grid size-10 place-items-center rounded-xl bg-brand-bg text-brand">
          <Landmark aria-hidden className="size-5" />
        </span>
      }
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
        {input('name', 'Beneficiary name', { maxLength: 80 })}
        {input('bankName', 'Bank name', { maxLength: 80 })}
        {input('accountNumber', 'Account number', {
          maxLength: 18,
          inputMode: 'numeric',
          autoComplete: 'off',
          className: 'money',
        })}
        {input('ifsc', 'IFSC', { maxLength: 11, className: 'uppercase' }, false)}
        {errs.formMessage && !Object.keys(errs.fields).length ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
      </div>
    </Drawer>
  );
}
