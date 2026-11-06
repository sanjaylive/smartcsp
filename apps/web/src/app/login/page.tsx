'use client';

import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, ShieldCheck } from 'lucide-react';
import { otpRequestSchema } from '@csp2all/shared';
import { PublicShell } from '@/components/toggles';
import { Alert, Button, Checkbox, Field, Input } from '@/components/ui';
import { OtpInput } from '@/components/otp-input';
import { api, isApiError } from '@/lib/api';
import { routeAfterAuth } from '@/lib/auth';
import { errorMessage, qk } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { Me, OtpChallenge } from '@/lib/types';

function useCountdown(target: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return target ? Math.max(0, Math.ceil((target - now) / 1000)) : 0;
}

function LoginInner() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = params.get('next');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
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

  // Already signed in? Skip the form.
  useEffect(() => {
    if (params.get('expired')) return;
    api<Me>('/v1/auth/me', { noAuthRedirect: true })
      .then((me) => router.replace(routeAfterAuth(me, next)))
      .catch(() => undefined);
  }, [params, router, next]);

  const requestCode = useCallback(
    async (isResend: boolean) => {
      setError(null);
      setBusy(true);
      try {
        const c = await api<OtpChallenge>('/v1/auth/otp/request', {
          method: 'POST',
          body: { email, consent: true },
          noAuthRedirect: true,
        });
        setChallenge(c);
        setExpiresAt(Date.now() + c.expiresInSeconds * 1000);
        setResendAt(Date.now() + c.resendAfterSeconds * 1000);
        setCode('');
        setStep('otp');
        setNotice(isResend ? t('login.resent') : t('auth.email.sent'));
      } catch (e) {
        if (isApiError(e, 'OTP_RESEND_COOLDOWN')) {
          const wait = Number(e.details.retryAfterSeconds ?? 30);
          setResendAt(Date.now() + wait * 1000);
          setError(t('error.OTP_RESEND_COOLDOWN'));
        } else if (isApiError(e) && e.fields.email) {
          setEmailError(e.fields.email[0]);
        } else setError(errorMessage(t, e));
      } finally {
        setBusy(false);
      }
    },
    [email, t],
  );

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setConsentError(null);
    const r = otpRequestSchema.safeParse({ email, consent });
    if (!r.success) {
      for (const issue of r.error.issues) {
        if (issue.path[0] === 'email') setEmailError(t('login.emailInvalid'));
        if (issue.path[0] === 'consent') setConsentError(t('login.consentRequired'));
      }
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
        const me = await api<Me>('/v1/auth/otp/verify', {
          method: 'POST',
          body: { challengeId: challenge.challengeId, email, code: value, client: 'web' },
          noAuthRedirect: true,
        });
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
    [challenge, email, next, qc, router, t],
  );

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="card p-6 sm:p-8">
      {params.get('expired') ? (
        <Alert tone="warning" className="mb-5">
          {t('error.SESSION_EXPIRED')}
        </Alert>
      ) : null}
      {step === 'email' ? (
        <form onSubmit={submitEmail} noValidate className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-bg text-brand-strong dark:text-fg">
              <Mail aria-hidden className="size-5" />
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('auth.email.title')}</h1>
          </div>
          <Field
            label={t('auth.email.label')}
            help={t('auth.email.help')}
            error={emailError}
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
            <h1 className="text-2xl font-extrabold tracking-tight">{t('auth.otp.title')}</h1>
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
              {t('auth.otp.help', { email })}{' '}
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
              onClick={() => {
                setStep('email');
                setError(null);
                setNotice(null);
                setCode('');
              }}
            >
              {t('auth.otp.changeEmail')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <PublicShell>
      <Suspense>
        <LoginInner />
      </Suspense>
    </PublicShell>
  );
}
