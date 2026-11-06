'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { AdminBrand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button, Callout, Checkbox, Field, FormError, Input, Loading, Mono } from '@/components/ui';
import { api, isApiError } from '@/lib/api';
import { meQueryKey, useMeQuery } from '@/lib/session';

type Step =
  | { kind: 'email' }
  | { kind: 'code'; email: string; challengeId: string; resendAt: number }
  | { kind: 'enroll' }
  | { kind: 'verify' };

const REASONS: Record<string, string> = {
  expired: 'Your admin session ended after 30 minutes of inactivity. Sign in again to continue.',
  mfa: 'Two-factor verification is required before you can use the admin console.',
  signin: 'Please sign in to continue.',
  signedout: 'You have been signed out.',
};

function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login')
    ? raw
    : '/';
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const me = useMeQuery();
  const [step, setStep] = useState<Step | null>(null);
  const next = safeNext(params.get('next'));
  const reason = params.get('reason');

  // Resume where the session is: verified → console; signed in but MFA pending → TOTP step.
  useEffect(() => {
    if (step) return;
    if (me.isPending) return;
    if (me.data?.mfaVerified) router.replace(next);
    else if (me.data) setStep({ kind: me.data.mfaEnrolled ? 'verify' : 'enroll' });
    else setStep({ kind: 'email' });
  }, [me.isPending, me.data, step, router, next]);

  const done = async () => {
    await qc.invalidateQueries({ queryKey: meQueryKey });
    await qc.fetchQuery({
      queryKey: meQueryKey,
      queryFn: () => api('/v1/admin/auth/me', { silentAuth: true }),
    });
    router.replace(next);
  };

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
        <AdminBrand />
        <ThemeToggle />
      </header>
      <div className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <h1 className="text-lg font-semibold">Platform admin sign-in</h1>
            <p className="mt-1 text-[13px] text-fg-muted">
              This console is for CSP2All staff only. Shop owners sign in at the shop portal.
            </p>
            <div className="mt-4 flex flex-col gap-4">
              {reason && REASONS[reason] && (step?.kind === 'email' || reason === 'mfa') && (
                <Callout tone="info">{REASONS[reason]}</Callout>
              )}
              {!step && <Loading label="Checking session…" />}
              {step?.kind === 'email' && (
                <EmailStep
                  onSent={(email, challengeId, resendAfter) =>
                    setStep({
                      kind: 'code',
                      email,
                      challengeId,
                      resendAt: Date.now() + resendAfter * 1000,
                    })
                  }
                />
              )}
              {step?.kind === 'code' && (
                <CodeStep
                  step={step}
                  onBack={() => setStep({ kind: 'email' })}
                  onResent={(challengeId, resendAfter) =>
                    setStep({ ...step, challengeId, resendAt: Date.now() + resendAfter * 1000 })
                  }
                  onVerified={(mfa) => setStep({ kind: mfa === 'ENROLL' ? 'enroll' : 'verify' })}
                />
              )}
              {step?.kind === 'enroll' && <EnrollStep onDone={done} />}
              {step?.kind === 'verify' && (
                <TotpForm
                  onDone={done}
                  intro="Enter the 6-digit code from your authenticator app."
                />
              )}
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-fg-muted">
            Sessions end after 30 minutes of inactivity. All admin actions are audited.
          </p>
        </div>
      </div>
    </main>
  );
}

function EmailStep({
  onSent,
}: {
  onSent: (email: string, challengeId: string, resendAfter: number) => void;
}) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ challengeId: string; resendAfterSeconds: number }>(
        '/v1/admin/auth/otp/request',
        { method: 'POST', body: { email, consent: true }, silentAuth: true },
      );
      onSent(email.trim().toLowerCase(), r.challengeId, r.resendAfterSeconds);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const emailErr = isApiError(error) ? error.field('email') : undefined;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Field label="Work email" required error={emailErr}>
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@csp2all.in"
            autoFocus
          />
        )}
      </Field>
      <Checkbox
        checked={consent}
        onChange={setConsent}
        label="I am an authorised CSP2All administrator and accept that my actions are audited."
      />
      {error && !emailErr ? <FormError error={error} /> : null}
      <Button
        type="submit"
        variant="primary"
        loading={busy}
        disabled={!email || !consent}
        icon={<Mail className="size-4" aria-hidden />}
      >
        Email me a sign-in code
      </Button>
    </form>
  );
}

function CodeStep({
  step,
  onBack,
  onResent,
  onVerified,
}: {
  step: Extract<Step, { kind: 'code' }>;
  onBack: () => void;
  onResent: (challengeId: string, resendAfter: number) => void;
  onVerified: (mfa: 'ENROLL' | 'VERIFY') => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const wait = Math.max(0, Math.ceil((step.resendAt - now) / 1000));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ mfa: 'ENROLL' | 'VERIFY' }>('/v1/admin/auth/otp/verify', {
        method: 'POST',
        body: { challengeId: step.challengeId, email: step.email, code },
        silentAuth: true,
      });
      onVerified(r.mfa);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  const resend = async () => {
    setError(null);
    try {
      const r = await api<{ challengeId: string; resendAfterSeconds: number }>(
        '/v1/admin/auth/otp/request',
        { method: 'POST', body: { email: step.email, consent: true }, silentAuth: true },
      );
      onResent(r.challengeId, r.resendAfterSeconds);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <p className="text-[13px] text-fg-muted">
        If <strong className="text-fg">{step.email}</strong> is an admin account, a 6-digit code is
        on its way. It expires in 10 minutes.
      </p>
      <Field label="Email code" required>
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="tabular text-center text-lg tracking-[0.4em]"
            autoFocus
          />
        )}
      </Field>
      <FormError error={error} />
      <Button
        type="submit"
        variant="primary"
        loading={busy}
        disabled={code.length !== 6}
        icon={<KeyRound className="size-4" aria-hidden />}
      >
        Verify code
      </Button>
      <div className="flex items-center justify-between text-[13px]">
        <button type="button" onClick={onBack} className="font-medium text-brand hover:underline">
          Use a different email
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={wait > 0}
          className="font-medium text-brand hover:underline disabled:text-fg-muted disabled:no-underline"
        >
          {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );
}

function EnrollStep({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ secret: string; otpauthUri: string }>('/v1/admin/auth/totp/setup', {
      method: 'POST',
      body: {},
      silentAuth: true,
    }).then(setSetup, setError);
  }, []);
  if (error) return <FormError error={error} />;
  if (!setup) return <Loading label="Preparing two-factor setup…" />;
  const grouped = setup.secret.match(/.{1,4}/g)?.join(' ') ?? setup.secret;
  return (
    <div className="flex flex-col gap-3">
      <Callout
        tone="brand"
        icon={<ShieldCheck className="size-4" aria-hidden />}
        title="Set up two-factor authentication"
      >
        Admin accounts require an authenticator app (Google Authenticator, Microsoft Authenticator,
        1Password, etc.). Scan the QR code, then enter the 6-digit code it shows.
      </Callout>
      <div className="flex flex-col items-center gap-3 rounded-md border border-line bg-white p-4">
        <QRCodeSVG
          value={setup.otpauthUri}
          size={176}
          marginSize={1}
          role="img"
          aria-label="QR code for your authenticator app"
          data-testid="totp-qr"
        />
      </div>
      <div className="text-[13px]">
        <p className="text-fg-muted">
          Can’t scan? Enter this key manually (time-based, SHA-1, 6 digits):
        </p>
        <p className="mt-1 break-all" data-testid="totp-secret" data-secret={setup.secret}>
          <Mono>{grouped}</Mono>
        </p>
      </div>
      <TotpForm
        onDone={onDone}
        intro="Enter the code from your app to finish enrolment."
        icon={<Smartphone className="size-4" aria-hidden />}
      />
    </div>
  );
}

function TotpForm({
  onDone,
  intro,
  icon,
}: {
  onDone: () => void;
  intro: string;
  icon?: React.ReactNode;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/v1/admin/auth/totp/verify', { method: 'POST', body: { code }, silentAuth: true });
      onDone();
    } catch (err) {
      setError(err);
      setCode('');
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <p className="text-[13px] text-fg-muted">{intro}</p>
      <Field label="Authenticator code" required>
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="tabular text-center text-lg tracking-[0.4em]"
            autoFocus
          />
        )}
      </Field>
      <FormError error={error} />
      <Button
        type="submit"
        variant="primary"
        loading={busy}
        disabled={code.length !== 6}
        icon={icon ?? <ShieldCheck className="size-4" aria-hidden />}
      >
        Verify and continue
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginInner />
    </Suspense>
  );
}
