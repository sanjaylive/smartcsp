'use client';

import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Mail, Phone, WalletMinimal } from 'lucide-react';
import { otpRequestSchema } from '@csp2all/shared';
import { useBrand } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { LanguageToggle } from '@/components/toggles';
import { Alert, Button, Checkbox, Field, Input } from '@/components/ui';
import { OtpInput } from '@/components/otp-input';
import { api, isApiError } from '@/lib/api';
import { routeAfterAuth } from '@/lib/auth';
import { errorMessage, qk } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { Me, OtpChallenge } from '@/lib/types';

type Mode = 'register' | 'signin';
type Channel = 'email' | 'phone';

function BrandMark() {
  const brand = useBrand();
  return (
    <Link href="/" className="inline-flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-9 place-items-center overflow-hidden rounded-lg bg-brand text-on-brand"
      >
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="" className="size-full object-contain" />
        ) : (
          <WalletMinimal className="size-5" strokeWidth={2.4} />
        )}
      </span>
      <span className="text-lg font-extrabold tracking-tight">{brand.name}</span>
    </Link>
  );
}

function useCountdown(target: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return target ? Math.max(0, Math.ceil((target - now) / 1000)) : 0;
}

function InfoPanel({ mode }: { mode: Mode }) {
  const { t } = useI18n();
  const brand = useBrand();
  const next = [
    'landing.start.2',
    'landing.start.3',
    'landing.start.4',
    'landing.start.5',
  ] as const;
  return (
    <aside className="hidden flex-col justify-center border-l border-border bg-brand-bg px-10 py-12 lg:flex">
      <div className="max-w-sm">
        <h2 className="text-2xl font-extrabold tracking-tight">
          {t('auth.panel.welcome', { brand: brand.name })}
        </h2>
        <p className="mt-2 text-fg-muted">{t('auth.panel.welcomeSub')}</p>
        {mode === 'register' ? (
          <>
            <div className="mt-8">
              <p className="text-sm font-bold">{t('auth.panel.needTitle')}</p>
              <p className="mt-1 text-[15px] text-fg-muted">{t('auth.panel.need')}</p>
            </div>
            <div className="mt-6">
              <p className="text-sm font-bold">{t('auth.panel.nextTitle')}</p>
              <ul className="mt-2 space-y-2">
                {next.map((k) => (
                  <li key={k} className="flex items-center gap-2.5 text-[15px]">
                    <Check className="size-4 shrink-0 text-brand" />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <ul className="mt-8 space-y-2.5">
            {[t('landing.hero.chip1'), t('landing.hero.chip2'), t('landing.hero.chip3')].map(
              (c) => (
                <li key={c} className="flex items-center gap-2.5 font-semibold">
                  <Check className="size-4 shrink-0 text-brand" />
                  {c}
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}

function AuthForm({ mode }: { mode: Mode }) {
  const { t } = useI18n();
  const brand = useBrand();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = params.get('next');
  const [channel, setChannel] = useState<Channel>('email');
  const [phoneSignIn, setPhoneSignIn] = useState(false);
  const [step, setStep] = useState<'enter' | 'otp'>('enter');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const expiresIn = useCountdown(expiresAt);
  const resendIn = useCountdown(resendAt);
  const identity = channel === 'phone' ? `+91 ${phone}` : email;

  useEffect(() => {
    if (params.get('expired')) return;
    api<Me>('/v1/auth/me', { noAuthRedirect: true })
      .then((me) => router.replace(routeAfterAuth(me, next)))
      .catch(() => undefined);
  }, [params, router, next]);

  useEffect(() => {
    api<{ phoneSignIn?: boolean }>('/v1/public/config', { noAuthRedirect: true })
      .then((c) => setPhoneSignIn(!!c.phoneSignIn))
      .catch(() => undefined);
  }, []);

  const requestCode = useCallback(
    async (isResend: boolean) => {
      setError(null);
      setBusy(true);
      try {
        const path = channel === 'phone' ? '/v1/auth/phone/request' : '/v1/auth/otp/request';
        const body = channel === 'phone' ? { phone, consent: true } : { email, consent: true };
        const c = await api<OtpChallenge>(path, { method: 'POST', body, noAuthRedirect: true });
        setChallenge(c);
        setExpiresAt(Date.now() + c.expiresInSeconds * 1000);
        setResendAt(Date.now() + c.resendAfterSeconds * 1000);
        setCode('');
        setStep('otp');
        setNotice(
          isResend
            ? t('login.resent')
            : t(channel === 'phone' ? 'auth.phone.sent' : 'auth.email.sent'),
        );
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

  const submitEnter = async (e: FormEvent) => {
    e.preventDefault();
    setIdError(null);
    setConsentError(null);
    if (!consent) {
      setConsentError(t('login.consentRequired'));
      return;
    }
    if (channel === 'phone') {
      if (!/^[6-9]\d{9}$/.test(phone)) {
        setIdError(t('auth.phone.invalid'));
        return;
      }
    } else if (!otpRequestSchema.safeParse({ email, consent }).success) {
      setIdError(t('login.emailInvalid'));
      return;
    }
    await requestCode(false);
  };

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
        router.replace(routeAfterAuth(me, next));
      } catch (e) {
        setBusy(false);
        setCode('');
        if (isApiError(e, 'OTP_INVALID') && typeof e.details.attemptsRemaining === 'number') {
          setError(t('login.invalidAttempts', { n: e.details.attemptsRemaining }));
        } else setError(errorMessage(t, e));
      }
    },
    [challenge, channel, email, phone, next, qc, router, t],
  );

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const title =
    mode === 'register'
      ? t('auth.create.title', { brand: brand.name })
      : t('auth.signin.title', { brand: brand.name });
  const sub = mode === 'register' ? t('auth.create.sub') : t('auth.signin.sub');

  return (
    <div className="w-full max-w-md">
      {params.get('expired') ? (
        <Alert tone="warning" className="mb-5">
          {t('error.SESSION_EXPIRED')}
        </Alert>
      ) : null}

      {step === 'enter' ? (
        <form onSubmit={submitEnter} noValidate className="flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-fg-muted">{sub}</p>
          </div>

          {phoneSignIn && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1" role="tablist">
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
                    'min-h-9 rounded-md text-sm font-semibold transition',
                    channel === c ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {t(c === 'phone' ? 'auth.phone.tab' : 'auth.email.tab')}
                </button>
              ))}
            </div>
          )}

          {channel === 'phone' ? (
            <Field
              label={t('auth.phone.label')}
              help={t('auth.phone.help')}
              error={idError}
              required
            >
              {({ id, describedBy, invalid }) => (
                <div className="flex items-stretch gap-2">
                  <span className="inline-flex items-center rounded-lg border border-border bg-surface-muted px-3 text-[15px] font-semibold text-fg-muted">
                    +91
                  </span>
                  <Input
                    id={id}
                    type="tel"
                    autoComplete="tel"
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
            <Field
              label={t('auth.email.label')}
              help={t('auth.email.help')}
              error={idError}
              required
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  autoFocus
                />
              )}
            </Field>
          )}

          <div>
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
            {consentError ? (
              <p role="alert" className="mt-1 text-[13px] font-medium text-danger">
                {consentError}
              </p>
            ) : null}
          </div>

          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" size="lg" loading={busy}>
            {t('auth.email.send')}
          </Button>

          <p className="text-center text-sm text-fg-muted">
            {mode === 'register' ? t('auth.create.haveAccount') : t('auth.signin.noAccount')}{' '}
            <Link
              href={mode === 'register' ? '/login' : '/register'}
              className="font-bold text-brand underline-offset-2 hover:underline"
            >
              {mode === 'register' ? t('landing.cta.signin') : t('landing.cta.create')}
            </Link>
          </p>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify(code);
          }}
          className="flex flex-col gap-5"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-brand-bg text-brand">
              {channel === 'phone' ? (
                <Phone aria-hidden className="size-5" />
              ) : (
                <Mail aria-hidden className="size-5" />
              )}
            </span>
            <h1 className="text-xl font-extrabold tracking-tight">{t('auth.otp.title')}</h1>
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
              {t('auth.otp.help', { email: identity })}{' '}
              {expiresIn > 0 ? (
                <span className="money">{t('login.expiresIn', { time: mmss(expiresIn) })}</span>
              ) : (
                <span className="font-semibold text-danger">{t('error.OTP_EXPIRED')}</span>
              )}
            </p>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" size="lg" loading={busy} disabled={code.length !== 6}>
            {t('auth.otp.verify')}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => void requestCode(true)}
              disabled={resendIn > 0 || busy}
              aria-live="polite"
            >
              {resendIn > 0 ? t('auth.otp.resendIn', { seconds: resendIn }) : t('auth.otp.resend')}
            </Button>
            <Button
              variant="ghost"
              icon={<ArrowLeft aria-hidden className="size-4" />}
              onClick={() => {
                setStep('enter');
                setError(null);
                setNotice(null);
                setCode('');
              }}
            >
              {t(channel === 'phone' ? 'auth.phone.change' : 'auth.otp.changeEmail')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AuthPage({ mode }: { mode: Mode }) {
  const { t } = useI18n();
  return (
    <div className="mk grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      <a href="#auth" className="skip-link">
        {t('a11y.skip')}
      </a>
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-4">
          <BrandMark />
          <LanguageToggle />
        </header>
        <main id="auth" className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <Suspense>
            <AuthForm mode={mode} />
          </Suspense>
        </main>
        <footer className="px-5 py-6">
          <nav
            aria-label={t('a11y.legal')}
            className="flex justify-center gap-5 text-sm text-fg-muted"
          >
            <Link className="hover:text-fg" href="/terms">
              {t('auth.email.terms')}
            </Link>
            <Link className="hover:text-fg" href="/privacy">
              {t('auth.email.privacy')}
            </Link>
            <Link className="hover:text-fg" href="/">
              {t('landing.nav.howItWorks')}
            </Link>
          </nav>
        </footer>
      </div>
      <InfoPanel mode={mode} />
    </div>
  );
}
