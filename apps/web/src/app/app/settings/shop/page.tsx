'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Globe, Lock, Palette, Store, Trash2 } from 'lucide-react';
import { shopProfileUpdateSchema } from '@csp2all/shared';
import { api, isApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, qk, useFormErrors, usePermissions, zodToFieldErrors } from '@/lib/hooks';
import { INDIAN_STATES } from '@/lib/constants';
import type { TenantProfile } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui';
import { QueryState } from '@/components/query-state';
import { useToast } from '@/components/ui/toast';

export default function ShopProfilePage() {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ['profile'],
    queryFn: () => api<TenantProfile>('/v1/tenant/profile'),
  });
  return (
    <>
      <PageHeader
        title={t('nav.shop')}
        description={t('shop.help')}
        icon={
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-bg text-brand-strong dark:text-fg">
            <Store aria-hidden className="size-6" />
          </span>
        }
      />
      <QueryState query={q}>
        {(p) => <ProfileForm key={p.version} p={p} reload={() => q.refetch()} />}
      </QueryState>
      <div className="mt-6">
        <DomainsSection />
      </div>
    </>
  );
}

interface DomainView {
  id: string;
  domain: string;
  status: string;
  verifiedAt: string | null;
  dns: { txt: { name: string; value: string }; a: { name: string; value: string } };
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-xs font-semibold text-fg-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-bg px-2 py-1.5 font-mono text-[12px]">
          {value}
        </code>
        <button
          type="button"
          aria-label="Copy"
          className="shrink-0 rounded-lg border border-border p-1.5 hover:bg-surface-muted"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <Check className="size-4 text-success" />
          ) : (
            <Copy className="size-4 text-fg-muted" />
          )}
        </button>
      </div>
    </div>
  );
}

function DomainsSection() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [domain, setDomain] = useState('');
  const q = useQuery({
    queryKey: ['domains'],
    queryFn: () => api<DomainView[]>('/v1/tenant/domains'),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['domains'] });
  const add = useMutation({
    mutationFn: () => api('/v1/tenant/domains', { method: 'POST', body: { domain } }),
    onSuccess: () => {
      setDomain('');
      invalidate();
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const verify = useMutation({
    mutationFn: (id: string) => api(`/v1/tenant/domains/${id}/verify`, { method: 'POST' }),
    onSuccess: () => {
      toast('success', t('domains.verified'));
      invalidate();
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/v1/tenant/domains/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (e) => toast('error', errorMessage(t, e)),
  });

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Globe aria-hidden className="size-5 text-brand" />
            {t('domains.title')}
          </span>
        }
        description={t('domains.help')}
      />
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (domain.trim()) add.mutate();
        }}
      >
        <Input
          value={domain}
          placeholder="shop.example.com"
          inputMode="url"
          autoComplete="off"
          onChange={(e) => setDomain(e.target.value)}
          aria-label={t('domains.add')}
        />
        <Button type="submit" loading={add.isPending} disabled={!domain.trim()}>
          {t('domains.add')}
        </Button>
      </form>
      <QueryState query={q}>
        {(list) =>
          list.length === 0 ? (
            <p className="mt-4 text-sm text-fg-muted">{t('domains.empty')}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {list.map((d) => (
                <li key={d.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{d.domain}</span>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          d.status === 'VERIFIED'
                            ? 'success'
                            : d.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {t(
                          d.status === 'VERIFIED'
                            ? 'domains.live'
                            : d.status === 'FAILED'
                              ? 'domains.failed'
                              : 'domains.pending',
                        )}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={t('common.remove')}
                        icon={<Trash2 aria-hidden className="size-4" />}
                        onClick={() => remove.mutate(d.id)}
                      />
                    </div>
                  </div>
                  {d.status !== 'VERIFIED' && (
                    <div className="mt-3 flex flex-col gap-3">
                      <p className="text-[13px] text-fg-muted">{t('domains.dnsHelp')}</p>
                      <CopyField label={`TXT · ${d.dns.txt.name}`} value={d.dns.txt.value} />
                      <CopyField label={`A · ${d.dns.a.name}`} value={d.dns.a.value} />
                      <div>
                        <Button
                          size="sm"
                          loading={verify.isPending && verify.variables === d.id}
                          onClick={() => verify.mutate(d.id)}
                        >
                          {t('domains.verify')}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </Card>
  );
}

function ProfileForm({ p, reload }: { p: TenantProfile; reload: () => void }) {
  const { t, setLocale } = useI18n();
  const { ctx } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const errs = useFormErrors();
  const branding = !!ctx?.plan.entitlements.customBranding;
  const [f, setF] = useState({
    shopName: p.name,
    contactPhone: p.contactPhone ?? '',
    state: p.state ?? '',
    district: p.district ?? '',
    address: p.address ?? '',
    preferredLanguage: p.preferredLanguage,
    brandColor: p.brandColor ?? '#DC2626',
    receiptFooter: p.receiptFooter ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => setConflict(false), [p.version]);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    errs.clear();
    const body: Record<string, unknown> = {
      version: p.version,
      shopName: f.shopName,
      contactPhone: f.contactPhone || null,
      state: f.state,
      district: f.district,
      address: f.address.trim() || null,
      preferredLanguage: f.preferredLanguage,
    };
    if (branding) {
      body.brandColor = f.brandColor;
      body.receiptFooter = f.receiptFooter.trim() || null;
    }
    const r = shopProfileUpdateSchema.safeParse(body);
    if (!r.success) return errs.setFields(zodToFieldErrors(r.error));
    setBusy(true);
    try {
      await api('/v1/tenant/profile', { method: 'PATCH', body });
      toast('success', t('common.saved'));
      if (f.preferredLanguage !== p.preferredLanguage) setLocale(f.preferredLanguage);
      void qc.invalidateQueries({ queryKey: qk.context });
      reload();
    } catch (e) {
      if (isApiError(e, 'VERSION_CONFLICT')) setConflict(true);
      else errs.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader title={t('shop.details')} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label={t('onboarding.shop.shopName')} required error={errs.get('shopName')}>
            {(x) => (
              <Input
                id={x.id}
                aria-invalid={x.invalid || undefined}
                aria-describedby={x.describedBy}
                value={f.shopName}
                onChange={(e) => set('shopName', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('shop.owner')}>
            {(x) => <Input id={x.id} value={p.ownerDisplayName} disabled />}
          </Field>
          <Field
            label={t('onboarding.shop.phone')}
            optionalLabel={t('common.optional')}
            badge={
              p.contactPhoneVerified ? (
                <Badge tone="success">{t('shop.verified')}</Badge>
              ) : (
                <Badge tone="warning">{t('common.unverified')}</Badge>
              )
            }
            help={t('onboarding.shop.phoneHelp')}
            error={errs.get('contactPhone')}
          >
            {(x) => (
              <Input
                id={x.id}
                aria-invalid={x.invalid || undefined}
                aria-describedby={x.describedBy}
                inputMode="numeric"
                maxLength={10}
                value={f.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value.replace(/\D/g, ''))}
              />
            )}
          </Field>
          <Field label={t('onboarding.shop.language')}>
            {(x) => (
              <Select
                id={x.id}
                value={f.preferredLanguage}
                onChange={(e) => set('preferredLanguage', e.target.value)}
              >
                <option value="en">English</option>
                <option value="hi">हिंदी</option>
              </Select>
            )}
          </Field>
          <Field
            label={t('onboarding.shop.state')}
            optionalLabel={t('common.optional')}
            error={errs.get('state')}
          >
            {(x) => (
              <Select id={x.id} value={f.state} onChange={(e) => set('state', e.target.value)}>
                <option value="">{t('form.choose')}</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label={t('onboarding.shop.district')}
            optionalLabel={t('common.optional')}
            error={errs.get('district')}
          >
            {(x) => (
              <Input
                id={x.id}
                aria-invalid={x.invalid || undefined}
                value={f.district}
                onChange={(e) => set('district', e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t('onboarding.shop.address')}
            optionalLabel={t('common.optional')}
            error={errs.get('address')}
            className="sm:col-span-2"
          >
            {(x) => (
              <Textarea
                id={x.id}
                rows={2}
                value={f.address}
                onChange={(e) => set('address', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('onboarding.shop.timezone')}>
            {(x) => <Input id={x.id} value={p.timezone} disabled />}
          </Field>
        </div>
      </Card>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title={t('shop.branding')} description={t('shop.brandingHelp')} />
          {branding ? (
            <div className="flex flex-col gap-4 p-5">
              <Field label={t('shop.brandColor')} error={errs.get('brandColor')}>
                {(x) => (
                  <div className="flex items-center gap-3">
                    <input
                      id={x.id}
                      type="color"
                      className="h-11 w-16 cursor-pointer rounded-lg border border-border bg-surface"
                      value={f.brandColor}
                      onChange={(e) => set('brandColor', e.target.value.toUpperCase())}
                    />
                    <span className="money text-sm">{f.brandColor}</span>
                  </div>
                )}
              </Field>
              <Field
                label={t('shop.receiptFooter')}
                optionalLabel={t('common.optional')}
                error={errs.get('receiptFooter')}
              >
                {(x) => (
                  <Textarea
                    id={x.id}
                    rows={2}
                    maxLength={200}
                    value={f.receiptFooter}
                    onChange={(e) => set('receiptFooter', e.target.value)}
                  />
                )}
              </Field>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 p-5">
              <p
                className="flex items-start gap-2 text-sm text-fg-muted"
                data-testid="branding-locked"
              >
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
                {t('shop.brandingLocked')}
              </p>
              <ButtonLink
                href="/app/subscription"
                variant="secondary"
                icon={<Palette aria-hidden className="size-4" />}
              >
                {t('plan.upgrade')}
              </ButtonLink>
            </div>
          )}
        </Card>
        {conflict ? (
          <Alert
            tone="warning"
            action={
              <Button size="sm" variant="outline" onClick={reload}>
                {t('common.reload')}
              </Button>
            }
          >
            {t('error.VERSION_CONFLICT')}
          </Alert>
        ) : null}
        {errs.formMessage && !Object.keys(errs.fields).length ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
        <Button size="lg" onClick={save} loading={busy}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
