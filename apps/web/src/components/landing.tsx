'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Fingerprint,
  HandCoins,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletMinimal,
  WifiOff,
} from 'lucide-react';
import { SERVICE_CODES } from '@csp2all/shared';
import { useI18n } from '@/lib/i18n';
import { ServiceIcon, useServiceLabel } from '@/components/service';
import { LanguageToggle, ThemeToggle } from '@/components/toggles';

const BRAND = 'Smart Outlet';

/* A compact wordmark built from the shared brand tokens (no CSP2All lockup here — this is public). */
function BrandMark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg font-display">
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand shadow-[0_6px_20px_-6px_var(--brand)]"
      >
        <WalletMinimal className="size-5" strokeWidth={2.4} />
      </span>
      <span className="text-lg font-extrabold tracking-tight">{BRAND}</span>
    </Link>
  );
}

function Header() {
  const { t } = useI18n();
  const nav = [
    ['#features', t('landing.nav.features')],
    ['#services', t('landing.nav.services')],
    ['#pricing', t('landing.nav.pricing')],
    ['#faq', t('landing.nav.faq')],
  ] as const;
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <BrandMark />
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {nav.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-fg-muted transition hover:bg-surface-muted hover:text-fg"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <LanguageToggle />
          <ThemeToggle />
          <Link
            href="/login"
            className="ml-1 hidden rounded-[10px] px-3 py-2 text-sm font-semibold text-fg-muted transition hover:text-fg sm:inline-flex"
          >
            {t('landing.cta.signin')}
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-brand px-3.5 text-sm font-semibold text-on-brand shadow-[0_8px_24px_-10px_var(--brand)] transition hover:brightness-110"
          >
            {t('landing.cta.start')}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* Honest, representative preview of the product — not real shop data. */
function ProductPreview() {
  const { t, tk } = useI18n();
  const rows = [
    {
      icon: ArrowDownLeft,
      k: 'landing.mock.aeps',
      amt: '₹5,000',
      ok: true,
      accent: 'text-success',
    },
    { icon: ArrowUpRight, k: 'landing.mock.dmt', amt: '₹2,500', ok: true, accent: 'text-success' },
    { icon: ClipboardList, k: 'landing.mock.pan', amt: '₹107', ok: false, accent: 'text-warning' },
  ] as const;
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand/25 via-brand-alt/20 to-transparent blur-2xl"
      />
      <div className="card overflow-hidden rounded-[1.5rem] p-0 ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-border bg-surface-muted/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-danger/70" />
            <span className="size-3 rounded-full bg-warning/70" />
            <span className="size-3 rounded-full bg-success/70" />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success">
            <CheckCircle2 className="size-3.5" />
            {t('landing.mock.synced')}
          </span>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {t('landing.mock.today')}
              </p>
              <p className="font-display text-3xl font-extrabold tracking-tight">₹18,240</p>
              <p className="text-xs text-fg-muted">{t('landing.mock.collections')}</p>
            </div>
            <div className="flex gap-2">
              <div className="rounded-xl border border-border bg-bg px-3 py-2 text-right">
                <p className="text-[11px] text-fg-muted">{t('landing.mock.cashInHand')}</p>
                <p className="money text-sm font-bold">₹7,650</p>
              </div>
              <div className="rounded-xl border border-border bg-bg px-3 py-2 text-right">
                <p className="text-[11px] text-fg-muted">{t('landing.mock.pendingDues')}</p>
                <p className="money text-sm font-bold text-warning">₹430</p>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t('landing.mock.recent')}
            </p>
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.k}
                  className="flex items-center gap-3 rounded-xl border border-border bg-bg px-3 py-2.5"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-surface-muted">
                    <r.icon className={`size-4 ${r.accent}`} />
                  </span>
                  <span className="flex-1 text-sm font-semibold">{tk(r.k)}</span>
                  <span className="money text-sm font-bold">{r.amt}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      r.ok ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'
                    }`}
                  >
                    {t(r.ok ? 'landing.mock.success' : 'landing.mock.pending')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-5 hidden animate-float rounded-2xl border border-border bg-surface px-4 py-3 shadow-lg sm:block">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-bg text-brand-strong">
            <WifiOff className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-bold">{t('landing.hero.chip1')}</p>
            <p className="text-[11px] text-fg-muted">{t('landing.mock.synced')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const { t } = useI18n();
  const chips = [
    [WifiOff, t('landing.hero.chip1')],
    [BookOpenCheck, t('landing.hero.chip2')],
    [ShieldCheck, t('landing.hero.chip3')],
  ] as const;
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="aurora" />
      <div aria-hidden className="bg-grid absolute inset-0 -z-10" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div className="animate-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-sm font-semibold text-brand-strong backdrop-blur">
            <Sparkles className="size-4" aria-hidden />
            {t('landing.hero.badge')}
          </p>
          <h1 className="mt-5 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            {t('landing.hero.title')}{' '}
            <span className="bg-gradient-to-r from-brand to-brand-alt bg-clip-text text-transparent">
              {t('landing.hero.titleEm')}
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-fg-muted">{t('landing.hero.sub')}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand px-6 text-base font-semibold text-on-brand shadow-[0_14px_40px_-12px_var(--brand)] transition hover:brightness-110"
            >
              {t('landing.cta.start')}
              <ArrowRight className="size-5" />
            </Link>
            <a
              href="#pricing"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-6 text-base font-semibold text-fg transition hover:bg-surface-muted"
            >
              {t('landing.cta.seePricing')}
            </a>
          </div>
          <p className="mt-4 text-sm text-fg-muted">{t('landing.hero.note')}</p>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
            {chips.map(([Icon, label]) => (
              <span key={label} className="inline-flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 text-brand" aria-hidden />
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="animate-rise [animation-delay:120ms]">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

function Services() {
  const { t } = useI18n();
  const label = useServiceLabel();
  return (
    <section id="services" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
      <SectionHead title={t('landing.services.title')} sub={t('landing.services.sub')} />
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SERVICE_CODES.filter((c) => c !== 'CUSTOM').map((code) => (
          <div
            key={code}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-card"
          >
            <ServiceIcon code={code} />
            <span className="text-sm font-semibold leading-snug">{label(code)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const { t, tk } = useI18n();
  const items = [
    [ClipboardList, '1'],
    [WalletMinimal, '2'],
    [HandCoins, '3'],
    [UsersRound, '4'],
    [FileSpreadsheet, '5'],
    [WifiOff, '6'],
  ] as const;
  return (
    <section id="features" className="scroll-mt-20 border-y border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <SectionHead title={t('landing.feat.title')} sub={t('landing.feat.sub')} />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([Icon, n]) => (
            <article
              key={n}
              className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-6 transition hover:shadow-card"
            >
              <div
                aria-hidden
                className="absolute right-0 top-0 size-24 translate-x-8 -translate-y-8 rounded-full bg-brand/10 blur-2xl transition group-hover:bg-brand/20"
              />
              <span className="grid size-11 place-items-center rounded-xl bg-brand-bg text-brand-strong">
                <Icon className="size-5.5" strokeWidth={2.1} />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold">
                {tk(`landing.feat.${n}.title`)}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                {tk(`landing.feat.${n}.body`)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t, tk } = useI18n();
  const steps = ['1', '2', '3'] as const;
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <SectionHead title={t('landing.how.title')} />
      <ol className="mt-10 grid gap-6 md:grid-cols-3">
        {steps.map((n, i) => (
          <li key={n} className="relative">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-brand font-display text-lg font-extrabold text-on-brand">
                {n}
              </span>
              {i < steps.length - 1 && (
                <span aria-hidden className="hidden h-px flex-1 bg-border md:block" />
              )}
            </div>
            <h3 className="mt-4 font-display text-xl font-bold">{tk(`landing.how.${n}.t`)}</h3>
            <p className="mt-1.5 text-fg-muted">{tk(`landing.how.${n}.d`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Pricing() {
  const { t } = useI18n();
  const free = {
    name: t('landing.pricing.free.name'),
    price: t('landing.pricing.free.price'),
    per: t('landing.pricing.free.per'),
    desc: t('landing.pricing.free.desc'),
    feats: ['landing.pricing.free.f1', 'landing.pricing.free.f2', 'landing.pricing.free.f3'],
  };
  const growth = {
    name: t('landing.pricing.growth.name'),
    price: t('landing.pricing.growth.price'),
    per: t('landing.pricing.growth.per'),
    desc: t('landing.pricing.growth.desc'),
    feats: [
      'landing.pricing.growth.f1',
      'landing.pricing.growth.f2',
      'landing.pricing.growth.f3',
      'landing.pricing.free.f1',
    ],
  };
  return (
    <section id="pricing" className="scroll-mt-20 border-y border-border bg-surface/40">
      <div className="mx-auto max-w-5xl px-4 py-16 lg:py-20">
        <SectionHead title={t('landing.pricing.title')} sub={t('landing.pricing.sub')} />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <PlanCard plan={free} cta={t('landing.cta.startFree')} />
          <PlanCard plan={growth} cta={t('landing.cta.start')} featured />
        </div>
        <p className="mt-6 text-center text-sm text-fg-muted">{t('landing.pricing.note')}</p>
      </div>
    </section>
  );
}

// uses tk() for dynamic feature keys
function PlanCard({
  plan,
  cta,
  featured,
}: {
  plan: { name: string; price: string; per: string; desc: string; feats: string[] };
  cta: string;
  featured?: boolean;
}) {
  const { t, tk } = useI18n();
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-7 ${
        featured
          ? 'border-brand bg-surface shadow-[0_20px_60px_-24px_var(--brand)]'
          : 'border-border bg-surface'
      }`}
    >
      {featured && (
        <span className="absolute -top-3 right-6 rounded-full bg-brand px-3 py-1 text-xs font-bold text-on-brand">
          {t('landing.pricing.popular')}
        </span>
      )}
      <h3 className="font-display text-xl font-bold">{plan.name}</h3>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-4xl font-extrabold tracking-tight">{plan.price}</span>
        <span className="text-sm text-fg-muted">{plan.per}</span>
      </div>
      <p className="mt-2 text-sm text-fg-muted">{plan.desc}</p>
      <ul className="mt-5 flex-1 space-y-2.5">
        {plan.feats.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-success" aria-hidden />
            <span>{tk(f)}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/login"
        className={`mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition ${
          featured
            ? 'bg-brand text-on-brand hover:brightness-110'
            : 'border border-border bg-surface hover:bg-surface-muted'
        }`}
      >
        {cta}
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function Security() {
  const { t } = useI18n();
  const points = [
    [Fingerprint, t('landing.security.p1')],
    [Lock, t('landing.security.p2')],
    [ShieldCheck, t('landing.security.p3')],
  ] as const;
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="grid items-center gap-10 rounded-3xl border border-border bg-gradient-to-br from-surface to-brand-bg/40 p-8 lg:grid-cols-2 lg:p-12">
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            {t('landing.security.title')}
          </h2>
          <p className="mt-3 max-w-lg text-fg-muted">{t('landing.security.body')}</p>
        </div>
        <ul className="space-y-3">
          {points.map(([Icon, label]) => (
            <li
              key={label}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface/80 px-4 py-3"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-brand-bg text-brand-strong">
                <Icon className="size-5" />
              </span>
              <span className="font-semibold">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  const { t, tk } = useI18n();
  const qa = ['1', '2', '3', '4', '5', '6'] as const;
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16">
      <SectionHead title={t('landing.faq.title')} />
      <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-surface">
        {qa.map((n) => (
          <details key={n} className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
              {tk(`landing.faq.q${n}`)}
              <Plus className="size-5 shrink-0 text-fg-muted transition group-open:rotate-45" />
            </summary>
            <p className="pb-4 text-fg-muted">{tk(`landing.faq.a${n}`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16">
      <div className="relative overflow-hidden rounded-3xl bg-brand px-6 py-14 text-center text-on-brand">
        <div aria-hidden className="aurora aurora-on-brand" />
        <h2 className="relative font-display text-2xl font-extrabold tracking-tight sm:text-4xl">
          {t('landing.final.title')}
        </h2>
        <p className="relative mx-auto mt-3 max-w-xl text-on-brand/85">{t('landing.final.sub')}</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-surface px-6 text-base font-semibold text-fg shadow-lg transition hover:brightness-105"
          >
            {t('landing.cta.start')}
            <ArrowRight className="size-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <BrandMark />
          <p className="mt-3 max-w-xs text-sm text-fg-muted">{t('landing.footer.tagline')}</p>
        </div>
        <div>
          <p className="text-sm font-bold">{t('landing.footer.product')}</p>
          <ul className="mt-3 space-y-2 text-sm text-fg-muted">
            <li>
              <a href="#features" className="hover:text-fg">
                {t('landing.nav.features')}
              </a>
            </li>
            <li>
              <a href="#services" className="hover:text-fg">
                {t('landing.nav.services')}
              </a>
            </li>
            <li>
              <a href="#pricing" className="hover:text-fg">
                {t('landing.nav.pricing')}
              </a>
            </li>
            <li>
              <a href="#faq" className="hover:text-fg">
                {t('landing.nav.faq')}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold">{t('landing.footer.legalH')}</p>
          <ul className="mt-3 space-y-2 text-sm text-fg-muted">
            <li>
              <Link href="/terms" className="hover:text-fg">
                {t('auth.email.terms')}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-fg">
                {t('auth.email.privacy')}
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-fg">
                {t('landing.cta.signin')}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl">{t('landing.footer.independent')}</p>
          <p>
            © {new Date().getFullYear()} {BRAND}. {t('landing.footer.rights')}
          </p>
        </div>
      </div>
    </footer>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-lg text-fg-muted">{sub}</p>}
    </div>
  );
}

export function LandingContent() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        {t('a11y.skip')}
      </a>
      <Header />
      <main id="main" className="flex-1">
        <Hero />
        <Services />
        <Features />
        <HowItWorks />
        <Pricing />
        <Security />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
