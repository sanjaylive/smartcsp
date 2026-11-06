'use client';

import { BookOpen, HandCoins, ShieldCheck, Users, Wallet, ArrowRight } from 'lucide-react';
import { SERVICE_CODES } from '@csp2all/shared';
import { PublicShell } from '@/components/toggles';
import { ButtonLink } from '@/components/ui';
import { ServiceIcon, useServiceLabel } from '@/components/service';
import { useI18n } from '@/lib/i18n';

export default function Landing() {
  const { t } = useI18n();
  const label = useServiceLabel();
  const features = [
    { icon: BookOpen, title: t('landing.f1.title'), body: t('landing.f1.body') },
    { icon: Wallet, title: t('landing.f2.title'), body: t('landing.f2.body') },
    { icon: HandCoins, title: t('landing.f3.title'), body: t('landing.f3.body') },
    { icon: Users, title: t('landing.f4.title'), body: t('landing.f4.body') },
  ];
  return (
    <PublicShell wide>
      <section className="grid items-center gap-10 py-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-bg px-3 py-1 text-sm font-semibold text-brand-strong dark:text-fg">
            <ShieldCheck aria-hidden className="size-4" />
            {t('landing.badge')}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{t('app.name')}</h1>
          <p className="mt-3 text-xl font-semibold text-fg">{t('app.tagline')}</p>
          <p className="mt-4 max-w-xl text-[17px] text-fg-muted">{t('landing.value')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink
              href="/login"
              className="min-h-12 px-6 text-base"
              icon={<ArrowRight aria-hidden className="size-5" />}
            >
              {t('landing.cta')}
            </ButtonLink>
          </div>
          <p className="mt-6 max-w-xl rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
            {t('app.disclaimer')}
          </p>
        </div>
        <div className="card grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
          {SERVICE_CODES.filter((c) => c !== 'CUSTOM').map((code) => (
            <div
              key={code}
              className="flex flex-col items-start gap-2 rounded-xl border border-border p-3"
            >
              <ServiceIcon code={code} />
              <span className="text-sm font-semibold leading-snug">{label(code)}</span>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="features" className="py-8">
        <h2 id="features" className="sr-only">
          {t('landing.featuresTitle')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="card p-5">
              <f.icon aria-hidden className="size-6 text-brand" />
              <h3 className="mt-3 font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-fg-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
