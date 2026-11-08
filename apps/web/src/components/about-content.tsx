'use client';

import Link from 'next/link';
import { ArrowRight, HeartHandshake, Languages, ShieldCheck, WifiOff } from 'lucide-react';
import { MarketingShell, PageHero } from '@/components/marketing-chrome';
import { HeroIllustration } from '@/components/landing-art';
import { Reveal } from '@/components/landing-motion';
import { useBrand } from '@/lib/brand';
import { useI18n } from '@/lib/i18n';

export function AboutContent() {
  const brand = useBrand();
  const { t } = useI18n();

  const values = [
    {
      icon: HeartHandshake,
      t: 'Built for the counter',
      d: 'Every screen is designed for a busy shop: big buttons, quick entry, and nothing you do not need.',
    },
    {
      icon: ShieldCheck,
      t: 'Privacy by design',
      d: 'Aadhaar and card numbers are masked as you type. Full numbers, PINs and OTPs are never stored.',
    },
    {
      icon: WifiOff,
      t: 'Works when the network does not',
      d: 'Keep recording offline. Everything syncs as soon as you are back online.',
    },
    {
      icon: Languages,
      t: 'In your language',
      d: 'Use it in Hindi or English, on any phone or computer you already own.',
    },
  ];

  return (
    <MarketingShell>
      <PageHero
        eyebrow="About us"
        title={`Why we built ${brand.name}`}
        sub="Lakhs of CSP, Bank Mitra and Seva Kendra counters serve India's villages and towns every day — most still run on a paper diary. We want to give them a simple, trustworthy tool instead."
      />

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-20">
        <Reveal>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-fg">Our story</h2>
          <div className="mt-5 space-y-4 text-lg leading-relaxed text-fg-muted">
            <p>
              A counter operator handles cash withdrawals, money transfers, PAN and Aadhaar work,
              recharges and bills — often for dozens of customers a day. At closing time, matching
              the cash drawer to a handwritten register can take an hour, and small mistakes add up.
            </p>
            <p>
              {brand.name} records each service in seconds, keeps the cashbook balanced as you go,
              and reminds customers about pending dues on WhatsApp. It is an independent tool that
              sits alongside the bank and government portals you already use — it never touches the
              money itself.
            </p>
          </div>
        </Reveal>
        <Reveal delay={150}>
          <HeroIllustration className="mx-auto h-auto w-full max-w-lg" />
        </Reveal>
      </section>

      <section className="border-y border-border/60 bg-surface/50 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-brand">
              What we stand for
            </p>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg">
              Simple, safe and always yours
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => {
              const Icon = v.icon;
              return (
                <Reveal key={v.t} delay={i * 100} className="pro-card p-6">
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-bg text-brand">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-extrabold text-fg">{v.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{v.d}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <Reveal className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-brand p-8 text-on-brand sm:flex-row sm:items-center sm:p-12">
          <div>
            <h2 className="font-display text-3xl font-extrabold">
              Ready to put away the paper diary?
            </h2>
            <p className="mt-2 opacity-90">Start free in two minutes. No documents needed.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/register"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-6 font-bold text-[#9a2f1e] transition hover:scale-[1.03]"
            >
              {t('landing.cta.create')} <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-h-12 items-center rounded-xl border border-white/40 px-6 font-bold transition hover:bg-white/10"
            >
              Talk to us
            </Link>
          </div>
        </Reveal>
      </section>
    </MarketingShell>
  );
}
