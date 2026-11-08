'use client';

/*
 * One page for sign-in and sign-up:
 *   1. email (or phone)  →  2. OTP
 *   existing account     →  dashboard
 *   new account          →  3. shop details  →  4. services  →  dashboard
 * The shop/services steps reuse the resumable onboarding draft on the API, so a user who leaves
 * half-way lands back on the right step the next time they verify.
 */

import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  Store,
  UserCheck,
} from 'lucide-react';
import { otpRequestSchema, shopSetupSchema, type ServiceCode } from '@csp2all/shared';
import { useBrand } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { Alert, Button, Checkbox, Field, Input } from '@/components/ui';
import { OtpInput } from '@/components/otp-input';
import { ServiceIcon, useServiceLabel } from '@/components/service';
import { BrandMark } from '@/components/marketing-chrome';
import { LanguageToggle, ThemeToggle } from '@/components/toggles';
import { IPhoneFrame, PhoneAppScreen } from '@/components/phone-frame';
import { api, isApiError } from '@/lib/api';
import { routeAfterAuth } from '@/lib/auth';
import { errorMessage, qk } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { Me, OnboardingState, OtpChallenge } from '@/lib/types';

export type Mode = 'register' | 'signin';
type Channel = 'email' | 'phone';
type Step = 'identify' | 'otp' | 'shop' | 'services';

function useCountdown(target: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return target ? Math.max(0, Math.ceil((target - now) / 1000)) : 0;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Progress shown once we know this is a new account. */
function Steps({ step }: { step: Step }) {
  const items = [
    { k: 'otp', label: 'Verify' },
    { k: 'shop', label: 'Shop' },
    { k: 'services', label: 'Services' },
  ] as const;
  const at = step === 'identify' ? 0 : items.findIndex((i) => i.k === step);
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Sign-up progress">
      {items.map((it, i) => {
        const done = i < at;
        const current = i === at;
        return (
          <li key={it.k} className="flex flex-1 items-center gap-2">
            <span
              aria-current={current ? 'step' : undefined}
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors',
                done && 'bg-brand text-on-brand',
                current && 'bg-brand-bg text-brand ring-2 ring-brand',
                !done && !current && 'bg-surface-muted text-fg-muted',
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn('text-xs font-semibold', current ? 'text-fg' : 'text-fg-muted')}>
              {it.label}
            </span>
            {i < items.length - 1 && (
              <span className={cn('h-0.5 flex-1 rounded', done ? 'bg-brand' : 'bg-border')} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AuthFlow() {
  const { t, locale } = useI18n();
  const brand = useBrand();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const label = useServiceLabel();
  const next = params.get('next');

  const [step, setStep] = useState<Step>('identify');
  const [isNew, setIsNew] = useState(false);
  const [channel, setChannel] = useState<Channel>('email');
  const [phoneSignIn, setPhoneSignIn] = useState(false);

  // step 1
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);

  // step 2
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const expiresIn = useCountdown(expiresAt);
  const resendIn = useCountdown(resendAt);

  // step 3
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [shopErrors, setShopErrors] = useState<Record<string, string>>({});

  // step 4
  const [draft, setDraft] = useState<OnboardingState | null>(null);
  const [services, setServices] = useState<ServiceCode[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const identity = channel === 'phone' ? `+91 ${phone}` : email;

  /** Load (or start) the onboarding draft and move to the right step. */
  const startOnboarding = useCallback(async (me?: Me) => {
    setIsNew(true);
    const d = await api<OnboardingState>('/v1/onboarding');
    setDraft(d);
    const s = (d.shop ?? {}) as Record<string, string | null | undefined>;
    if (s.shopName) setShopName(s.shopName);
    setOwnerName((v) => s.ownerName ?? (v || me?.user.displayName || ''));
    if (s.contactPhone) setMobile(s.contactPhone);
    setServices(d.services ?? []);
    setStep(d.step === 'SERVICES' && d.shop ? 'services' : 'shop');
  }, []);

  // Already signed in? Continue where they left off.
  useEffect(() => {
    if (params.get('expired')) return;
    api<Me>('/v1/auth/me', { noAuthRedirect: true })
      .then((me) =>
        me.onboarding ? startOnboarding(me) : router.replace(routeAfterAuth(me, next)),
      )
      .catch(() => undefined);
  }, [params, router, next, startOnboarding]);

  useEffect(() => {
    api<{ phoneSignIn?: boolean }>('/v1/public/config', { noAuthRedirect: true })
      .then((c) => setPhoneSignIn(!!c.phoneSignIn))
      .catch(() => undefined);
  }, []);

  /* ------------------------------------------------------------ step 1 → 2 */
  const requestCode = useCallback(
    async (isResend: boolean) => {
      setError(null);
      setBusy(true);
      try {
        const path = channel === 'phone' ? '/v1/auth/phone/request' : '/v1/auth/otp/request';
        const body = channel === 'phone' ? { phone, consent: true } : { email, consent: true };
        const c = await api<OtpChallenge>(path, { method: 'POST', body, noAuthRedirect: true });
        setChallenge(c);
        if (typeof c.exists === 'boolean') setIsNew(!c.exists);
        setExpiresAt(Date.now() + c.expiresInSeconds * 1000);
        setResendAt(Date.now() + c.resendAfterSeconds * 1000);
        setCode('');
        setStep('otp');
        setNotice(isResend ? t('login.resent') : null);
      } catch (e) {
        if (isApiError(e, 'OTP_RESEND_COOLDOWN')) {
          const wait = Number(e.details.retryAfterSeconds ?? 30);
          setResendAt(Date.now() + wait * 1000);
          setError(t('error.OTP_RESEND_COOLDOWN'));
        } else if (isApiError(e) && (e.fields.email || e.fields.phone)) {
          setIdError((e.fields.email ?? e.fields.phone)?.[0] ?? null);
        } else setError(errorMessage(t, e));
      } finally {
        setBusy(false);
      }
    },
    [channel, email, phone, t],
  );

  const submitIdentify = (e: FormEvent) => {
    e.preventDefault();
    setIdError(null);
    setError(null);
    if (channel === 'phone') {
      if (!/^[6-9]\d{9}$/.test(phone)) return setIdError(t('auth.phone.invalid'));
    } else if (!otpRequestSchema.safeParse({ email, consent: true }).success) {
      return setIdError(t('login.emailInvalid'));
    }
    if (!consent) return setError(t('login.consentRequired'));
    void requestCode(false);
  };

  /* ------------------------------------------------------------ step 2 → dashboard | 3 */
  const verify = useCallback(
    async (value: string) => {
      if (!challenge || value.length !== 6) return;
      setBusy(true);
      setError(null);
      try {
        const path = channel === 'phone' ? '/v1/auth/phone/verify' : '/v1/auth/otp/verify';
        const body =
          channel === 'phone'
            ? { challengeId: challenge.challengeId, phone, code: value, client: 'web' }
            : { challengeId: challenge.challengeId, email, code: value, client: 'web' };
        const me = await api<Me>(path, { method: 'POST', body, noAuthRedirect: true });
        qc.clear();
        qc.setQueryData(qk.me, me);
        if (me.onboarding) {
          if (channel === 'phone') setMobile(phone);
          await startOnboarding(me);
          setBusy(false);
          return;
        }
        router.replace(routeAfterAuth(me, next));
      } catch (e) {
        setBusy(false);
        setCode('');
        if (isApiError(e, 'OTP_INVALID') && typeof e.details.attemptsRemaining === 'number') {
          setError(t('login.invalidAttempts', { n: e.details.attemptsRemaining }));
        } else setError(errorMessage(t, e));
      }
    },
    [challenge, channel, email, phone, next, qc, router, t, startOnboarding],
  );

  /* ------------------------------------------------------------ step 3 → 4 */
  const submitShop = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = {
      shopName: shopName.trim(),
      ownerName: ownerName.trim(),
      contactPhone: mobile.trim() || null,
      address: null,
      preferredLanguage: locale === 'hi' ? 'hi' : 'en',
      timezone: 'Asia/Kolkata',
    };
    const parsed = shopSetupSchema.safeParse(body);
    const errs: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
    if (!mobile.trim()) errs.contactPhone = 'Enter your 10-digit mobile number';
    setShopErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await api('/v1/onboarding/shop', { method: 'PUT', body: parsed.data });
      setStep('services');
    } catch (err) {
      if (isApiError(err) && Object.keys(err.fields).length) {
        setShopErrors(
          Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, v[0] ?? ''])),
        );
      } else setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------ step 4 → dashboard */
  const limit = draft?.startingPlan.enabledServiceLimit ?? null;
  const finish = async () => {
    setError(null);
    if (services.length === 0) return setError('Choose at least one service you offer.');
    setBusy(true);
    try {
      await api('/v1/onboarding/services', { method: 'PUT', body: { services } });
      await api('/v1/onboarding/complete', { method: 'POST' });
      await qc.invalidateQueries({ queryKey: qk.me });
      router.replace('/app');
    } catch (err) {
      setBusy(false);
      setError(errorMessage(t, err));
    }
  };

  const back = (to: Step) => () => {
    setError(null);
    setNotice(null);
    setStep(to);
  };

  /* ------------------------------------------------------------ render */
  return (
    <div className="w-full max-w-lg">
      {params.get('expired') && step === 'identify' ? (
        <Alert tone="warning" className="mb-5">
          {t('error.SESSION_EXPIRED')}
        </Alert>
      ) : null}

      {isNew && step !== 'identify' && <Steps step={step} />}

      <div
        key={step}
        className="animate-rise rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8"
      >
        {step === 'identify' && (
          <form onSubmit={submitIdentify} noValidate className="flex flex-col gap-5">
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
                Welcome to {brand.name}
              </h1>
              <p className="mt-1.5 text-sm text-fg-muted">
                Sign in or create your free account. We&apos;ll send a one-time code — no password
                needed.
              </p>
            </div>

            {phoneSignIn && (
              <div
                className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1"
                role="tablist"
              >
                {(['email', 'phone'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={channel === c}
                    onClick={() => {
                      setChannel(c);
                      setIdError(null);
                      setError(null);
                    }}
                    className={cn(
                      'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition',
                      channel === c
                        ? 'bg-surface text-fg shadow-sm'
                        : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    {c === 'phone' ? <Phone className="size-4" /> : <Mail className="size-4" />}
                    {t(c === 'phone' ? 'auth.phone.tab' : 'auth.email.tab')}
                  </button>
                ))}
              </div>
            )}

            {channel === 'phone' ? (
              <Field label={t('auth.phone.label')} error={idError} required>
                {({ id, describedBy, invalid }) => (
                  <div className="flex items-stretch gap-2">
                    <span className="inline-flex items-center rounded-lg border border-border bg-surface-muted px-3 text-[15px] font-semibold text-fg-muted">
                      +91
                    </span>
                    <Input
                      id={id}
                      type="tel"
                      autoComplete="tel-national"
                      inputMode="numeric"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                      autoFocus
                    />
                  </div>
                )}
              </Field>
            ) : (
              <Field label={t('auth.email.label')} error={idError} required>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                    autoFocus
                  />
                )}
              </Field>
            )}

            <Checkbox
              checked={consent}
              onChange={setConsent}
              label={
                <span>
                  {t('login.consentPrefix')}{' '}
                  <Link
                    href="/terms"
                    target="_blank"
                    className="font-semibold text-brand underline underline-offset-2"
                  >
                    {t('auth.email.terms')}
                  </Link>{' '}
                  {t('login.and')}{' '}
                  <Link
                    href="/privacy"
                    target="_blank"
                    className="font-semibold text-brand underline underline-offset-2"
                  >
                    {t('auth.email.privacy')}
                  </Link>
                  .
                </span>
              }
            />

            {error ? <Alert tone="danger">{error}</Alert> : null}

            <Button type="submit" size="lg" loading={busy}>
              Continue <ArrowRight className="size-4" />
            </Button>

            <p className="flex items-center justify-center gap-1.5 text-xs text-fg-muted">
              <ShieldCheck className="size-3.5 text-emerald-600" /> New here? Your account is
              created after you verify.
            </p>
          </form>
        )}

        {step === 'otp' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verify(code);
            }}
            className="flex flex-col gap-5"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-bg text-brand">
                {isNew ? <Sparkles className="size-5" /> : <UserCheck className="size-5" />}
              </span>
              <div>
                <h1 className="font-display text-xl font-extrabold tracking-tight text-fg sm:text-2xl">
                  {isNew ? 'Verify to create your account' : 'Welcome back'}
                </h1>
                <p className="mt-1 text-sm text-fg-muted">
                  Enter the 6-digit code sent to <strong className="text-fg">{identity}</strong>
                </p>
              </div>
            </div>

            {notice ? <Alert tone="success">{notice}</Alert> : null}

            <div className="flex flex-col gap-2">
              <p id="otp-label" className="text-sm font-semibold">
                {t('auth.otp.label')}
              </p>
              <OtpInput
                labelId="otp-label"
                value={code}
                disabled={busy}
                invalid={!!error}
                describedBy="otp-help"
                onChange={(v) => {
                  setCode(v);
                  if (v.length === 6) void verify(v);
                }}
              />
              <p id="otp-help" className="text-[13px] text-fg-muted">
                {expiresIn > 0 ? (
                  <span className="money">{t('login.expiresIn', { time: mmss(expiresIn) })}</span>
                ) : (
                  <span className="font-semibold text-danger">{t('error.OTP_EXPIRED')}</span>
                )}
              </p>
            </div>

            {error ? <Alert tone="danger">{error}</Alert> : null}

            <Button type="submit" size="lg" loading={busy} disabled={code.length !== 6}>
              {isNew ? 'Verify & continue' : 'Verify & sign in'}
            </Button>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="ghost"
                icon={<ArrowLeft aria-hidden className="size-4" />}
                onClick={back('identify')}
              >
                {t(channel === 'phone' ? 'auth.phone.change' : 'auth.otp.changeEmail')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void requestCode(true)}
                disabled={resendIn > 0 || busy}
                aria-live="polite"
              >
                {resendIn > 0
                  ? t('auth.otp.resendIn', { seconds: resendIn })
                  : t('auth.otp.resend')}
              </Button>
            </div>
          </form>
        )}

        {step === 'shop' && (
          <form onSubmit={submitShop} noValidate className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-bg text-brand">
                <Store className="size-5" />
              </span>
              <div>
                <h1 className="font-display text-xl font-extrabold tracking-tight text-fg sm:text-2xl">
                  Tell us about your shop
                </h1>
                <p className="mt-1 text-sm text-fg-muted">
                  This appears on your receipts. You can change it later.
                </p>
              </div>
            </div>

            <Field label="Shop name" error={shopErrors.shopName} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="e.g. Sharma Seva Kendra"
                  autoComplete="organization"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  autoFocus
                />
              )}
            </Field>
            <Field label="Owner name" error={shopErrors.ownerName} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  autoComplete="name"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>
            <Field label="Mobile number" error={shopErrors.contactPhone} required>
              {({ id, describedBy, invalid }) => (
                <div className="flex items-stretch gap-2">
                  <span className="inline-flex items-center rounded-lg border border-border bg-surface-muted px-3 text-[15px] font-semibold text-fg-muted">
                    +91
                  </span>
                  <Input
                    id={id}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                  />
                </div>
              )}
            </Field>
            {error ? <Alert tone="danger">{error}</Alert> : null}

            <Button type="submit" size="lg" loading={busy}>
              Continue <ArrowRight className="size-4" />
            </Button>
          </form>
        )}

        {step === 'services' && draft && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="font-display text-xl font-extrabold tracking-tight text-fg sm:text-2xl">
                Which services do you offer?
              </h1>
              <p className="mt-1 text-sm text-fg-muted">
                Pick everything you do at your counter.
                {limit !== null
                  ? ` The ${draft.startingPlan.name} plan includes up to ${limit}.`
                  : ''}
              </p>
            </div>

            <div
              role="group"
              aria-label="Services"
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
            >
              {draft.availableServices.map((code) => {
                const on = services.includes(code);
                const full = limit !== null && services.length >= limit;
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
                      'relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45',
                      on
                        ? 'border-brand bg-brand-bg text-fg ring-1 ring-brand'
                        : 'border-border bg-surface text-fg hover:border-brand/40',
                    )}
                  >
                    {on && (
                      <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-brand text-on-brand">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                    <ServiceIcon code={code} />
                    <span className="leading-tight">
                      {code === 'CUSTOM' ? 'Other services' : label(code)}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-sm font-semibold text-fg-muted" aria-live="polite">
              {services.length} selected{limit !== null ? ` of ${limit}` : ''}
            </p>

            {error ? <Alert tone="danger">{error}</Alert> : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="ghost"
                icon={<ArrowLeft aria-hidden className="size-4" />}
                onClick={back('shop')}
                disabled={busy}
              >
                Back
              </Button>
              <Button size="lg" onClick={finish} loading={busy} disabled={services.length === 0}>
                Open my dashboard <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SidePanel() {
  const brand = useBrand();
  return (
    <aside className="relative hidden items-center justify-center overflow-hidden border-l border-border/70 bg-surface/60 px-10 py-16 lg:flex">
      <div className="bg-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="relative flex flex-col items-center">
        <div className="relative">
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-bg"
          />
          <div className="animate-float relative w-[270px]">
            <IPhoneFrame>
              <PhoneAppScreen />
            </IPhoneFrame>
          </div>
        </div>
        <p className="relative mt-10 max-w-sm text-center font-display text-xl font-extrabold text-fg">
          Every record, cash balance and due — in one place.
        </p>
        <p className="relative mt-2 max-w-sm text-center text-sm text-fg-muted">
          Join counters across India running on {brand.name}. Free to start.
        </p>
      </div>
    </aside>
  );
}

/** `mode` only affects the URL users arrive from; the flow is identical for both. */
export function AuthPage(_props: { mode?: Mode }) {
  const { t } = useI18n();
  return (
    <div className="mk grid min-h-dvh lg:grid-cols-[1fr_0.9fr]">
      <a href="#auth" className="skip-link">
        {t('a11y.skip')}
      </a>
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-4 sm:px-8">
          <BrandMark />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>
        <main id="auth" className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <Suspense>
            <AuthFlow />
          </Suspense>
        </main>
        <footer className="px-5 py-6">
          <nav
            aria-label={t('a11y.legal')}
            className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-fg-muted"
          >
            <Link className="hover:text-fg" href="/terms">
              {t('auth.email.terms')}
            </Link>
            <Link className="hover:text-fg" href="/privacy">
              {t('auth.email.privacy')}
            </Link>
            <Link className="hover:text-fg" href="/contact">
              Contact us
            </Link>
          </nav>
        </footer>
      </div>
      <SidePanel />
    </div>
  );
}
