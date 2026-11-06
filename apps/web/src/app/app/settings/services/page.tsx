'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Switch from '@radix-ui/react-switch';
import { Plus, Trash2 } from 'lucide-react';
import {
  CUSTOM_FIELD_TYPES,
  customServiceCreateSchema,
  getService,
  type ServiceCode,
} from '@csp2all/shared';
import { api, isApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, qk, useFormErrors, usePermissions, zodToFieldErrors } from '@/lib/hooks';
import type { CustomService, ServiceAvailability } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  Select,
} from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { QueryState, UpgradeNotice } from '@/components/query-state';
import { MoneyInput, rupeesOrZero } from '@/components/money-input';
import { ServiceIcon, useServiceLabel } from '@/components/service';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import type { ApiError } from '@/lib/api';

export default function ServicesSettingsPage() {
  const { t, tk } = useI18n();
  const { ctx } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const label = useServiceLabel();
  const [quotaErr, setQuotaErr] = useState<ApiError | null>(null);
  const q = useQuery({
    queryKey: ['services'],
    queryFn: () => api<{ items: ServiceAvailability[] }>('/v1/services'),
  });
  const toggle = useMutation({
    mutationFn: (v: { code: ServiceCode; enabled: boolean }) =>
      api<{ items: ServiceAvailability[] }>(`/v1/services/${v.code}`, {
        method: 'PUT',
        body: { enabled: v.enabled },
      }),
    onSuccess: (res, v) => {
      setQuotaErr(null);
      qc.setQueryData(['services'], res);
      void qc.invalidateQueries({ queryKey: qk.context });
      toast(
        'success',
        v.enabled
          ? t('services.enabled', { name: label(v.code) })
          : t('services.disabled', { name: label(v.code) }),
      );
    },
    onError: (e) =>
      isApiError(e, 'QUOTA_EXCEEDED') ? setQuotaErr(e) : toast('error', errorMessage(t, e)),
  });
  const limit = ctx?.plan.entitlements.enabledServiceLimit ?? null;

  return (
    <>
      <PageHeader title={t('nav.services')} description={t('services.help')} />
      <div className="flex flex-col gap-6">
        <Alert tone="warning">{t('onboarding.services.help')}</Alert>
        {quotaErr ? <UpgradeNotice error={quotaErr} /> : null}
        <QueryState query={q}>
          {(d) => {
            const enabledCount = d.items.filter((s) => s.selected).length;
            return (
              <Card>
                <CardHeader
                  title={t('services.builtIn')}
                  description={
                    limit !== null
                      ? t('services.limit', { used: enabledCount, limit })
                      : t('services.noLimit')
                  }
                />
                <ul className="divide-y divide-border">
                  {d.items.map((s) => {
                    const id = `svc-${s.code}`;
                    return (
                      <li key={s.code} className="flex flex-wrap items-center gap-4 px-5 py-4">
                        <ServiceIcon code={s.code} />
                        <div className="min-w-0 flex-1">
                          <label htmlFor={id} className="font-semibold">
                            {label(s.code)}
                          </label>
                          <p className="text-sm text-fg-muted">
                            {tk(getService(s.code)?.descriptionKey ?? '')}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {s.selected && s.reason === null ? (
                              <Badge tone="success">{t('services.on')}</Badge>
                            ) : null}
                            {s.reason && s.reason !== 'TENANT' ? (
                              <Badge tone="warning">{tk(`service.unavailable.${s.reason}`)}</Badge>
                            ) : null}
                            {s.hasHistory ? (
                              <Badge tone="neutral">{t('services.hasHistory')}</Badge>
                            ) : null}
                          </div>
                        </div>
                        <Switch.Root
                          id={id}
                          checked={s.selected}
                          disabled={!s.platformEnabled || toggle.isPending}
                          onCheckedChange={(v) => toggle.mutate({ code: s.code, enabled: v })}
                          className={cn(
                            'relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50',
                            s.selected ? 'bg-brand' : 'bg-border',
                          )}
                        >
                          <Switch.Thumb
                            className={cn(
                              'block size-6 translate-x-0.5 rounded-full bg-white shadow transition',
                              s.selected && 'translate-x-[22px]',
                            )}
                          />
                        </Switch.Root>
                      </li>
                    );
                  })}
                </ul>
                <p className="px-5 py-3 text-[13px] text-fg-muted">{t('service.disabled')}</p>
              </Card>
            );
          }}
        </QueryState>
        <CustomServices />
      </div>
    </>
  );
}

function CustomServices() {
  const { t, tk } = useI18n();
  const { ctx } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['custom-services'],
    queryFn: () => api<{ items: CustomService[] }>('/v1/custom-services'),
  });
  const toggle = useMutation({
    mutationFn: (c: CustomService) =>
      api(`/v1/custom-services/${c.id}`, {
        method: 'PATCH',
        body: { version: c.version, active: !c.active },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['custom-services'] });
      void qc.invalidateQueries({ queryKey: qk.context });
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const customOn = ctx?.services.find((s) => s.code === 'CUSTOM')?.selected;
  return (
    <Card>
      <CardHeader
        title={t('services.custom')}
        description={t('services.customHelp', {
          limit: ctx?.plan.entitlements.customServiceLimit ?? 0,
        })}
        actions={
          customOn ? (
            <Button
              size="sm"
              icon={<Plus aria-hidden className="size-4" />}
              onClick={() => setOpen(true)}
            >
              {t('services.addCustom')}
            </Button>
          ) : null
        }
      />
      {!customOn ? (
        <p className="px-5 py-4 text-sm text-fg-muted">{t('services.customOff')}</p>
      ) : null}
      <QueryState query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState title={t('services.noCustom')} />
          ) : (
            <ul className="divide-y divide-border">
              {d.items.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <ServiceIcon code="CUSTOM" size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{c.name}</span>
                    <span className="block text-sm text-fg-muted">
                      {c.category} · {tk(`workflow.${c.workflowType}`)} · {t('services.defaultFee')}
                      : <Money paise={c.defaultFeePaise} /> ·{' '}
                      {t('services.fieldsCount', { n: c.fields.length })}
                    </span>
                  </span>
                  <Badge tone={c.active ? 'success' : 'neutral'}>
                    {c.active ? t('services.active') : t('services.inactive')}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle.mutate(c)}
                    loading={toggle.isPending && toggle.variables?.id === c.id}
                  >
                    {c.active ? t('services.deactivate') : t('services.activate')}
                  </Button>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      {open ? <CustomServiceDialog onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

interface FieldDraft {
  label: string;
  type: (typeof CUSTOM_FIELD_TYPES)[number];
  required: boolean;
  options: string;
}

function keyFromLabel(label: string, i: number) {
  const words = label
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const k = words
    .map((w, j) => (j === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  return /^[a-z]/.test(k) ? k.slice(0, 30) : `field${i + 1}`;
}

function CustomServiceDialog({ onClose }: { onClose: () => void }) {
  const { t, tk } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const errs = useFormErrors();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [workflowType, setWorkflow] = useState<'TRANSACTION' | 'APPLICATION'>('TRANSACTION');
  const [direction, setDirection] = useState<'COLLECT' | 'PAYOUT' | 'NONE'>('NONE');
  const [fee, setFee] = useState('');
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const m = useMutation({
    mutationFn: (body: unknown) => api('/v1/custom-services', { method: 'POST', body }),
    onSuccess: () => {
      toast('success', t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['custom-services'] });
      void qc.invalidateQueries({ queryKey: qk.context });
      onClose();
    },
    onError: errs.fromError,
  });
  const submit = () => {
    errs.clear();
    const feePaise = rupeesOrZero(fee);
    if (feePaise === null) return errs.setFields({ defaultFeePaise: [t('msg.money')] });
    const used = new Set<string>();
    const defs = fields.map((f, i) => {
      let key = keyFromLabel(f.label, i);
      while (used.has(key)) key = `${key}${i + 1}`.slice(0, 30);
      used.add(key);
      return {
        key,
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        ...(f.type === 'select'
          ? {
              options: f.options
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean),
            }
          : {}),
      };
    });
    const body = {
      name,
      category,
      workflowType,
      defaultFeePaise: feePaise,
      principalDirection: direction,
      fields: defs,
    };
    const r = customServiceCreateSchema.safeParse(body);
    if (!r.success) return errs.setFields(zodToFieldErrors(r.error));
    m.mutate(body);
  };
  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={t('services.addCustom')}
      description={t('services.customDialogHelp')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={m.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('services.name')} required error={errs.get('name')}>
            {(p) => (
              <Input
                id={p.id}
                aria-invalid={p.invalid || undefined}
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('services.category')} required error={errs.get('category')}>
            {(p) => (
              <Input
                id={p.id}
                aria-invalid={p.invalid || undefined}
                value={category}
                maxLength={40}
                onChange={(e) => setCategory(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('services.workflow')}>
            {(p) => (
              <Select
                id={p.id}
                value={workflowType}
                onChange={(e) => setWorkflow(e.target.value as typeof workflowType)}
              >
                <option value="TRANSACTION">{tk('workflow.TRANSACTION')}</option>
                <option value="APPLICATION">{tk('workflow.APPLICATION')}</option>
              </Select>
            )}
          </Field>
          <Field label={t('services.direction')} help={t('services.directionHelp')}>
            {(p) => (
              <Select
                id={p.id}
                value={direction}
                onChange={(e) => setDirection(e.target.value as typeof direction)}
              >
                {(['NONE', 'COLLECT', 'PAYOUT'] as const).map((d) => (
                  <option key={d} value={d}>
                    {tk(`direction.${d}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('services.defaultFee')} error={errs.get('defaultFeePaise')}>
            {(p) => <MoneyInput id={p.id} invalid={p.invalid} value={fee} onChange={setFee} />}
          </Field>
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">
            {t('services.fields', { n: fields.length })}
          </legend>
          {fields.map((f, i) => (
            <div
              key={i}
              className="grid items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_140px_auto_auto]"
            >
              <Field label={t('services.fieldLabel')} error={errs.get(`fields.${i}.label`)}>
                {(p) => (
                  <Input
                    id={p.id}
                    value={f.label}
                    maxLength={40}
                    onChange={(e) =>
                      setFields((x) =>
                        x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)),
                      )
                    }
                  />
                )}
              </Field>
              <Field label={t('services.fieldType')}>
                {(p) => (
                  <Select
                    id={p.id}
                    value={f.type}
                    onChange={(e) =>
                      setFields((x) =>
                        x.map((y, j) =>
                          j === i ? { ...y, type: e.target.value as FieldDraft['type'] } : y,
                        ),
                      )
                    }
                  >
                    {CUSTOM_FIELD_TYPES.map((ty) => (
                      <option key={ty} value={ty}>
                        {tk(`fieldType.${ty}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="pb-2">
                <Checkbox
                  label={t('common.required')}
                  checked={f.required}
                  onChange={(v) =>
                    setFields((x) => x.map((y, j) => (j === i ? { ...y, required: v } : y)))
                  }
                />
              </div>
              <Button
                variant="ghost"
                aria-label={t('checklist.remove', { n: i + 1 })}
                onClick={() => setFields((x) => x.filter((_, j) => j !== i))}
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
              {f.type === 'select' ? (
                <Field
                  label={t('services.options')}
                  help={t('services.optionsHelp')}
                  error={errs.get(`fields.${i}.options`)}
                  className="sm:col-span-4"
                >
                  {(p) => (
                    <Input
                      id={p.id}
                      value={f.options}
                      onChange={(e) =>
                        setFields((x) =>
                          x.map((y, j) => (j === i ? { ...y, options: e.target.value } : y)),
                        )
                      }
                    />
                  )}
                </Field>
              ) : null}
            </div>
          ))}
          {fields.length < 8 ? (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              icon={<Plus aria-hidden className="size-4" />}
              onClick={() =>
                setFields((x) => [...x, { label: '', type: 'text', required: false, options: '' }])
              }
            >
              {t('services.addField')}
            </Button>
          ) : null}
        </fieldset>
        {errs.formError && isApiError(errs.formError, 'QUOTA_EXCEEDED') ? (
          <UpgradeNotice error={errs.formError} />
        ) : null}
        {errs.formMessage && !isApiError(errs.formError, 'QUOTA_EXCEEDED') ? (
          <Alert tone="danger">
            {Object.keys(errs.fields).length ? t('error.VALIDATION_FAILED') : errs.formMessage}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
