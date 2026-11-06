'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { customerCreateSchema, customerUpdateSchema, FOLLOW_UP_PREFS } from '@csp2all/shared';
import { api, isApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useFormErrors, usePermissions, zodToFieldErrors } from '@/lib/hooks';
import type { Customer } from '@/lib/types';
import { Alert, Button, Field, Input, Select, Textarea } from './ui';
import { Dialog } from './ui/dialog';
import { useDebounced } from './customer-picker';

/** Create or edit a customer. Edit sends `version`; contact fields need `customers.view_sensitive`. */
export function CustomerDialog({
  open,
  onClose,
  onSaved,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (c: Customer) => void;
  existing?: Customer | null;
}) {
  const { t, tk } = useI18n();
  const { can } = usePermissions();
  const canContact = !existing || can('customers.view_sensitive');
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing && canContact ? (existing.phone ?? '') : '');
  const [email, setEmail] = useState(existing && canContact ? (existing.email ?? '') : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [pref, setPref] = useState(existing?.followUpPreference ?? 'NONE');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const errs = useFormErrors();
  const dn = useDebounced(name, 400);
  const dp = useDebounced(phone, 400);
  const dups = useQuery({
    queryKey: ['customers', 'dups', dn, dp],
    queryFn: () =>
      api<{ items: Customer[] }>('/v1/customers/duplicates', { query: { name: dn, phone: dp } }),
    enabled: open && !existing && (dn.trim().length >= 3 || /^\d{10}$/.test(dp)),
  });

  const save = async () => {
    errs.clear();
    const base = { name, notes: notes.trim() || null, followUpPreference: pref };
    const contact = canContact ? { phone: phone || null, email: email.trim() || null } : {};
    const body = existing
      ? { version: existing.version, ...base, ...contact }
      : { ...base, ...contact };
    const r = (existing ? customerUpdateSchema : customerCreateSchema).safeParse(body);
    if (!r.success) {
      errs.setFields(zodToFieldErrors(r.error));
      return;
    }
    setBusy(true);
    try {
      const c = existing
        ? await api<Customer>(`/v1/customers/${existing.id}`, { method: 'PATCH', body })
        : await api<Customer>('/v1/customers', { method: 'POST', body });
      onSaved(c);
    } catch (e) {
      if (isApiError(e, 'VERSION_CONFLICT')) setConflict(true);
      errs.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? t('customers.edit') : t('customer.new')}
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
        <Field label={t('customer.name')} required error={errs.get('name')}>
          {(p) => (
            <Input
              id={p.id}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid || undefined}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        {canContact ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('customer.phone')}
              optionalLabel={t('common.optional')}
              error={errs.get('phone')}
            >
              {(p) => (
                <Input
                  id={p.id}
                  aria-describedby={p.describedBy}
                  aria-invalid={p.invalid || undefined}
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>
            <Field
              label={t('customer.email')}
              optionalLabel={t('common.optional')}
              error={errs.get('email')}
            >
              {(p) => (
                <Input
                  id={p.id}
                  type="email"
                  aria-describedby={p.describedBy}
                  aria-invalid={p.invalid || undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">{t('customers.contactLocked')}</p>
        )}
        <Field label={t('customer.followUpPreference')}>
          {(p) => (
            <Select id={p.id} value={pref} onChange={(e) => setPref(e.target.value)}>
              {FOLLOW_UP_PREFS.map((f) => (
                <option key={f} value={f}>
                  {tk(`followUpPref.${f}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t('common.notes')}
          optionalLabel={t('common.optional')}
          help={t('newRecord.notesHelp')}
          error={errs.get('notes')}
        >
          {(p) => (
            <Textarea
              id={p.id}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid || undefined}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        {dups.data?.items.length ? (
          <Alert tone="warning" title={t('customer.duplicates')}>
            <p className="text-sm">{t('customers.dupHelp')}</p>
            <ul className="mt-1 flex flex-col gap-1" data-testid="duplicate-suggestions">
              {dups.data.items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/app/customers/${c.id}`}
                    className="font-semibold text-brand hover:underline"
                  >
                    {c.name}
                  </Link>{' '}
                  <span className="money text-sm text-fg-muted">{c.phone ?? ''}</span>
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {conflict ? <Alert tone="warning">{t('error.VERSION_CONFLICT')}</Alert> : null}
        {errs.formMessage && !Object.keys(errs.fields).length && !conflict ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
