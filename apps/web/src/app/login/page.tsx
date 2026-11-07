'use client';

import { Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpenCheck,
  Mail,
  Phone,
  ShieldCheck,
  WalletMinimal,
  WifiOff,
} from 'lucide-react';
import { otpRequestSchema } from '@csp2all/shared';
import { useBrand } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { LanguageToggle, ThemeToggle } from '@/components/toggles';
import { Alert, Button, Checkbox, Field, Input } from '@/components/ui';
import { OtpInput } from '@/components/otp-input';
import { api, isApiError } from '@/lib/api';
import { routeAfterAuth } from '@/lib/auth';
import { errorMessage, qk } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { Me, OtpChallenge } from '@/lib/types';

function BrandMark({ onBrand }: { onBrand?: boolean }) {
  const brand = useBrand();
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 font-display">
      <span
        aria-hidden
        className={
          onBrand
            ? 'grid size-9 place-items-center overflow-hidden rounded-xl bg-on-brand/15 text-on-brand'
            : 'grid size-9 place-items-center overflow-hidden rounded-xl bg-brand text-on-brand shadow-[0_6px_20px_-6px_var(--brand)]'
        }
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

/* Split layout: branded panel on the left, the auth card on the right. */
function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const chips = [
    [WifiOff, t('landing.hero.chip1')],
    [BookOpenCheck, t('landing.hero.chip2')],
    [ShieldCheck, t('landing.hero.chip3')],
  ] as const;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <a href="#auth" className="skip-link">
        {t('a11y.skip')}
      </a>
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-on-brand lg:flex">
        <div aria-hidden className="aurora aurora-on-brand" />
        <div aria-hidden className="bg-grid absolute inset-0 opacity-20" />
        <div className="relative">
          <BrandMark onBrand />
        </div>
        <div className="relative">
          <h2 className="font-display text-4xl font-extrabold leading-[1.1] tracking-tight">
            {t('landing.hero.title')} {t('landing.hero.titleEm')}
          </h2>
          <p className="mt-4 max-w-md text-on-brand/85">{t('landing.hero.sub')}</p>
          <ul className="mt-8 flex flex-col gap-3">
            {chips.map(([Icon, label]) => (
              <li key={label} className="flex items-center gap-3 font-semibold">
                <span className="grid size-9 place-items-center rounded-lg bg-on-brand/15">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative max-w-md text-sm text-on-brand/70">
          {t('landing.footer.independent')}
        </p>
      </aside>
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-4 lg:justify-end">
          <span className="lg:hidden">
            <BrandMark />
          </span>
          <div className="flex items-center gap-1.5">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>
        <main id="auth" className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
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
              {t('landing.nav.features')}
            </Link>
          </nav>
        </footer>
      </div>
    </div>
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

type Channel = 'email' | 'phone';

function LoginInner() {
  const { t } = useI18n();
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

  // Already signed in? Skip the form.
  useEffect(() => {
    if (params.get('expired')) return;
    api<Me>('/v1/auth/me', { noAuthRedirect: true })
      .then((me) => router.replace(routeAfterAuth(me, next)))
      .catch(() => undefined);
  }, [params, router, next]);

  // Offer phone sign-in only when the platform has it configured.
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
    } else {
      const r = otpRequestSchema.safeParse({ email, consent });
      if (!r.success) {
        setIdError(t('login.emailInvalid'));
        return;
      }
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

  const switchChannel = (c: Channel) => {
    setChannel(c);
    setIdError(null);
    setError(null);
  };

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="card p-6 shadow-[0_24px_60px_-28px_rgba(22,26,46,0.35)] sm:p-8">
      {params.get('expired') ? (
        <Alert tone="warning" className="mb-5">
          {t('error.SESSION_EXPIRED')}
        </Alert>
      ) : null}
      {step === 'enter' ? (
        <form onSubmit={submitEnter} noValidate className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-bg text-brand-strong dark:text-fg">
              {channel === 'phone' ? (
                <Phone aria-hidden className="size-5" />
              ) : (
                <Mail aria-hidden className="size-5" />
              )}
            </span>
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                {t('auth.email.title')}
              </h1>
              <p className="text-sm text-fg-muted">{t('login.subtitle')}</p>
            </div>
          </div>
          {phoneSignIn && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1" role="tablist">
              {(['email', 'phone'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={channel === c}
                  onClick={() => switchChannel(c)}
                  className={cn(
                    'min-h-9 rounded-lg text-sm font-semibold transition',
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
                  <span className="inline-flex items-center rounded-[10px] border border-border bg-surface-muted px-3 text-[15px] font-semibold text-fg-muted">
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
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-bg text-brand-strong dark:text-fg">
              <ShieldCheck aria-hidden className="size-5" />
            </span>
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              {t('auth.otp.title')}
            </h1>
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

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense>
        <LoginInner />
      </Suspense>
    </AuthShell>
  );
}
