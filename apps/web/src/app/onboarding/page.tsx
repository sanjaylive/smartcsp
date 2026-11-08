'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Store } from 'lucide-react';
import { getService, shopSetupSchema, type ServiceCode } from '@csp2all/shared';
import { PublicShell } from '@/components/toggles';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { QueryState } from '@/components/query-state';
import { ServiceIcon, useServiceLabel } from '@/components/service';
import { api } from '@/lib/api';
import { qk, useFormErrors, zodToFieldErrors } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { INDIAN_STATES } from '@/lib/constants';
import { cn } from '@/lib/cn';
import type { OnboardingState } from '@/lib/types';

interface ShopForm {
  shopName: string;
  ownerName: string;
  contactPhone: string;
  state: string;
  district: string;
  address: string;
  preferredLanguage: 'en' | 'hi';
}

const emptyShop: ShopForm = {
  shopName: '',
  ownerName: '',
  contactPhone: '',
  state: '',
  district: '',
  address: '',
  preferredLanguage: 'en',
};

export default function OnboardingPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['onboarding'],
    queryFn: () => api<OnboardingState>('/v1/onboarding'),
  });
  const [step, setStep] = useState<'SHOP' | 'SERVICES'>('SHOP');
  const [shop, setShop] = useState<ShopForm>({ ...emptyShop, preferredLanguage: locale });
  const [services, setServices] = useState<ServiceCode[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const errs = useFormErrors();
  const label = useServiceLabel();
  const { tk } = useI18n();

  useEffect(() => {
    const d = q.data;
    if (!d) return;
    if (d.step === 'DONE' && d.completedTenantId) {
      router.replace('/app');
      return;
    }
    if (d.shop) {
      const s = d.shop as Partial<ShopForm>;
      setShop({
        ...emptyShop,
        ...s,
        contactPhone: (s.contactPhone as string | null) ?? '',
        address: (s.address as string | null) ?? '',
      });
    }
    if (d.services?.length) setServices(d.services);
    if (d.step === 'SERVICES') setStep('SERVICES');
  }, [q.data, router]);

  const set = <K extends keyof ShopForm>(k: K, v: ShopForm[K]) =>
    setShop((s) => ({ ...s, [k]: v }));

  const saveShop = async (e: FormEvent) => {
    e.preventDefault();
    errs.clear();
    const body = {
      shopName: shop.shopName,
      ownerName: shop.ownerName,
      contactPhone: shop.contactPhone.trim() || null,
      state: shop.state,
      district: shop.district,
      address: shop.address.trim() || null,
      preferredLanguage: shop.preferredLanguage,
      timezone: 'Asia/Kolkata',
    };
    const r = shopSetupSchema.safeParse(body);
    if (!r.success) {
      errs.setFields(zodToFieldErrors(r.error));
      return;
    }
    setBusy(true);
    try {
      await api('/v1/onboarding/shop', { method: 'PUT', body });
      if (shop.preferredLanguage !== locale) setLocale(shop.preferredLanguage);
      setStep('SERVICES');
      window.scrollTo({ top: 0 });
    } catch (err) {
      errs.fromError(err);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    errs.clear();
    if (services.length === 0) {
      errs.setFields({ services: [t('onboarding.selectOne')] });
      return;
    }
    setBusy(true);
    try {
      await api('/v1/onboarding/services', { method: 'PUT', body: { services } });
      setCreating(true);
      await api('/v1/onboarding/complete', { method: 'POST' });
      qc.clear();
      await qc.invalidateQueries({ queryKey: qk.me });
      router.replace('/app');
    } catch (err) {
      setCreating(false);
      errs.fromError(err);
      setBusy(false);
    }
  };

  return (
    <PublicShell wide>
      <div className="mx-auto max-w-3xl">
        {/* Step indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>{t('onboarding.step', { current: step === 'SHOP' ? 1 : 2, total: 2 })}</span>
            <span>
              {step === 'SHOP' ? t('onboarding.shop.title') : t('onboarding.services.title')}
            </span>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                step === 'SHOP' ? 'bg-brand' : 'bg-emerald-500',
              )}
            />
            <div
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                step === 'SERVICES' ? 'bg-brand' : 'bg-slate-200 dark:bg-slate-800',
              )}
            />
          </div>
        </div>

        <QueryState query={q}>
          {(data) =>
            step === 'SHOP' ? (
              <form
                onSubmit={saveShop}
                noValidate
                className="pro-card flex flex-col gap-6 p-6 sm:p-8"
              >
                <div className="flex items-center gap-3.5 border-b border-slate-200/60 pb-5 dark:border-slate-800/60">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-bg text-brand">
                    <Store aria-hidden className="size-5" />
                  </span>
                  <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                      {t('onboarding.shop.title')}
                    </h1>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Configure your center details to personalize receipts and customer reports.
                    </p>
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label={t('onboarding.shop.shopName')}
                    required
                    error={errs.get('shopName')}
                  >
                    {(p) => (
                      <Input
                        id={p.id}
                        aria-describedby={p.describedBy}
                        aria-invalid={p.invalid || undefined}
                        value={shop.shopName}
                        onChange={(e) => set('shopName', e.target.value)}
                        autoComplete="organization"
                      />
                    )}
                  </Field>
                  <Field
                    label={t('onboarding.shop.ownerName')}
                    required
                    error={errs.get('ownerName')}
                  >
                    {(p) => (
                      <Input
                        id={p.id}
                        aria-describedby={p.describedBy}
                        aria-invalid={p.invalid || undefined}
                        value={shop.ownerName}
                        onChange={(e) => set('ownerName', e.target.value)}
                        autoComplete="name"
                      />
                    )}
                  </Field>
                  <Field
                    label={t('onboarding.shop.state')}
                    optionalLabel={t('common.optional')}
                    error={errs.get('state')}
                  >
                    {(p) => (
                      <Select
                        id={p.id}
                        aria-describedby={p.describedBy}
                        aria-invalid={p.invalid || undefined}
                        value={shop.state}
                        onChange={(e) => set('state', e.target.value)}
                      >
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
                    {(p) => (
                      <Input
                        id={p.id}
                        aria-describedby={p.describedBy}
                        aria-invalid={p.invalid || undefined}
                        value={shop.district}
                        onChange={(e) => set('district', e.target.value)}
                      />
                    )}
                  </Field>
                  <Field
                    label={t('onboarding.shop.phone')}
                    optionalLabel={t('common.optional')}
                    help={t('onboarding.shop.phoneHelp')}
                    badge={<Badge tone="warning">{t('common.unverified')}</Badge>}
                    error={errs.get('contactPhone')}
                  >
                    {(p) => (
                      <Input
                        id={p.id}
                        aria-describedby={p.describedBy}
                        aria-invalid={p.invalid || undefined}
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={10}
                        value={shop.contactPhone}
                        onChange={(e) => set('contactPhone', e.target.value.replace(/\D/g, ''))}
                      />
                    )}
                  </Field>
                  <Field
                    label={t('onboarding.shop.language')}
                    error={errs.get('preferredLanguage')}
                  >
                    {(p) => (
                      <Select
                        id={p.id}
                        value={shop.preferredLanguage}
                        onChange={(e) => set('preferredLanguage', e.target.value as 'en' | 'hi')}
                      >
                        <option value="en">English</option>
                        <option value="hi">हिंदी</option>
                      </Select>
                    )}
                  </Field>
                  <Field
                    label={t('onboarding.shop.address')}
                    optionalLabel={t('common.optional')}
                    error={errs.get('address')}
                    className="sm:col-span-2"
                  >
                    {(p) => (
                      <Textarea
                        id={p.id}
                        aria-describedby={p.describedBy}
                        aria-invalid={p.invalid || undefined}
                        value={shop.address}
                        onChange={(e) => set('address', e.target.value)}
                        rows={2}
                      />
                    )}
                  </Field>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('onboarding.timezoneNote')}
                </p>
                {errs.formMessage && Object.keys(errs.fields).length === 0 ? (
                  <Alert tone="danger">{errs.formMessage}</Alert>
                ) : null}
                <div className="flex justify-end pt-2">
                  <Button type="submit" size="lg" loading={busy}>
                    {t('common.continue')}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="pro-card flex flex-col gap-6 p-6 sm:p-8">
                <div className="border-b border-slate-200/60 pb-5 dark:border-slate-800/60">
                  <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                    {t('onboarding.services.title')}
                  </h1>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {data.startingPlan.enabledServiceLimit !== null
                      ? t('onboarding.limit', {
                          plan: data.startingPlan.name,
                          limit: data.startingPlan.enabledServiceLimit,
                        })
                      : t('onboarding.noLimit', { plan: data.startingPlan.name })}
                  </p>
                </div>
                <Alert tone="warning" title={t('onboarding.authorityTitle')}>
                  <span className="inline-flex items-start gap-2">
                    {t('onboarding.services.help')}
                  </span>
                </Alert>
                <div className="flex items-center justify-between">
                  <p
                    className="text-sm font-semibold text-slate-900 dark:text-white"
                    aria-live="polite"
                  >
                    {t('onboarding.services.selected', { count: services.length })}
                    {data.startingPlan.enabledServiceLimit !== null
                      ? ` / ${data.startingPlan.enabledServiceLimit}`
                      : ''}
                  </p>
                </div>
                <div
                  role="group"
                  aria-label={t('onboarding.services.title')}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {data.availableServices.map((code) => {
                    const on = services.includes(code);
                    const full =
                      data.startingPlan.enabledServiceLimit !== null &&
                      services.length >= data.startingPlan.enabledServiceLimit;
                    const def = getService(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={!on && full}
                        onClick={() =>
                          setServices((s) => (on ? s.filter((x) => x !== code) : [...s, code]))
                        }
                        className={cn(
                          'relative flex min-h-24 items-start gap-3.5 rounded-2xl border p-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
                          on
                            ? 'border-brand bg-brand-bg shadow-sm ring-1 ring-brand/30'
                            : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 dark:hover:border-slate-700',
                        )}
                      >
                        <ServiceIcon code={code} size="lg" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-slate-900 dark:text-white">
                            {label(code)}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            {tk(def?.descriptionKey ?? '')}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded-md border text-white transition-all',
                            on
                              ? 'border-brand bg-brand'
                              : 'border-slate-300 bg-transparent dark:border-slate-700',
                          )}
                        >
                          {on ? <Check className="size-3.5 stroke-[3]" /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {errs.get('services') ? (
                  <p role="alert" className="font-medium text-danger">
                    {errs.get('services')}
                  </p>
                ) : null}
                {errs.formMessage && !errs.get('services') ? (
                  <Alert tone="danger">{errs.formMessage}</Alert>
                ) : null}
                <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200/60 pt-5 dark:border-slate-800/60">
                  <Button variant="outline" onClick={() => setStep('SHOP')} disabled={busy}>
                    {t('common.back')}
                  </Button>
                  <Button size="lg" onClick={finish} loading={busy}>
                    {creating ? t('onboarding.creating') : t('onboarding.finish')}
                  </Button>
                </div>
              </div>
            )
          }
        </QueryState>
      </div>
    </PublicShell>
  );
}
