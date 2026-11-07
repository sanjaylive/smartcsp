'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  HandCoins,
  Plus,
  Star,
  WalletMinimal,
  WifiOff,
} from 'lucide-react';
import { SERVICE_CODES } from '@csp2all/shared';
import { useI18n } from '@/lib/i18n';
import { useBrand } from '@/lib/brand';
import { ServiceIcon, useServiceLabel } from '@/components/service';
import { LanguageToggle, ThemeToggle } from '@/components/toggles';

function BrandMark() {
  const brand = useBrand();
  return (
    <Link href="/" className="inline-flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-9 place-items-center overflow-hidden rounded-xl bg-brand text-on-brand"
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

function Header() {
  const { t } = useI18n();
  const nav = [
    ['#features', t('landing.nav.features')],
    ['#services', t('landing.nav.services')],
    ['#pricing', t('landing.nav.pricing')],
    ['#faq', t('landing.nav.faq')],
  ] as const;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <BrandMark />
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {nav.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-fg-muted transition hover:text-fg"
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
            className="ml-1 hidden rounded-lg px-3 py-2 text-sm font-semibold text-fg-muted transition hover:text-fg sm:inline-flex"
          >
            {t('landing.cta.signin')}
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-bold text-on-brand transition hover:brightness-95"
          >
            {t('landing.cta.start')}
          </Link>
        </div>
      </div>
    </header>
  );
}

/* An honest, representative preview of the mobile app in a phone frame (not real shop data). */
function PhoneMock() {
  const { t } = useI18n();
  const brand = useBrand();
  const rows = [
    { icon: ArrowDownLeft, k: 'landing.mock.aeps', amt: '₹5,000', ok: true },
    { icon: ArrowUpRight, k: 'landing.mock.dmt', amt: '₹2,500', ok: true },
    { icon: ClipboardList, k: 'landing.mock.pan', amt: '₹107', ok: false },
  ] as const;
  return (
    <div className="relative mx-auto w-[270px]">
      <div className="rounded-[2.5rem] border-[10px] border-fg/90 bg-bg shadow-2xl dark:border-black">
        <div className="overflow-hidden rounded-[1.8rem]">
          {/* app header */}
          <div className="bg-brand px-4 pb-5 pt-4 text-on-brand">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{brand.name}</span>
              <span className="grid size-6 place-items-center rounded-full bg-on-brand/20 text-[11px] font-bold">
                R
              </span>
            </div>
            <p className="mt-3 text-xs text-on-brand/80">{t('landing.mock.collections')}</p>
            <p className="text-2xl font-extrabold tracking-tight">₹18,240</p>
            <div className="mt-3 flex gap-2">
              <div className="flex-1 rounded-xl bg-on-brand/15 px-2.5 py-1.5">
                <p className="text-[10px] text-on-brand/80">{t('landing.mock.cashInHand')}</p>
                <p className="text-sm font-bold">₹7,650</p>
              </div>
              <div className="flex-1 rounded-xl bg-on-brand/15 px-2.5 py-1.5">
                <p className="text-[10px] text-on-brand/80">{t('landing.mock.pendingDues')}</p>
                <p className="text-sm font-bold">₹430</p>
              </div>
            </div>
          </div>
          {/* list */}
          <div className="space-y-2 bg-surface p-3">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
              {t('landing.mock.recent')}
            </p>
            {rows.map((r) => (
              <div key={r.k} className="flex items-center gap-2.5 rounded-xl bg-bg px-2.5 py-2">
                <span className="grid size-8 place-items-center rounded-lg bg-surface-muted">
                  <r.icon className="size-4 text-fg-muted" />
                </span>
                <span className="flex-1 text-[13px] font-semibold">{t(r.k)}</span>
                <span className="text-[13px] font-bold">{r.amt}</span>
                <span
                  className={`size-2 rounded-full ${r.ok ? 'bg-success' : 'bg-warning'}`}
                  aria-hidden
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -right-3 top-28 hidden rounded-xl border border-border bg-surface px-3 py-2 shadow-lg sm:block">
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <WifiOff className="size-3.5 text-brand" />
          {t('landing.hero.chip1')}
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const { t } = useI18n();
  return (
    <section className="border-b border-border bg-surface">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-bg px-3 py-1 text-sm font-semibold text-brand-strong">
            <BadgeCheck className="size-4" aria-hidden />
            {t('landing.hero.badge')}
          </p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl">
            {t('landing.hero.title')}{' '}
            <span className="text-brand">{t('landing.hero.titleEm')}</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-fg-muted">{t('landing.hero.sub')}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand px-6 text-base font-bold text-on-brand transition hover:brightness-95"
            >
              {t('landing.cta.start')}
              <ArrowRight className="size-5" />
            </Link>
            <a
              href="#features"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border px-6 text-base font-bold text-fg transition hover:bg-surface-muted"
            >
              {t('landing.nav.features')}
            </a>
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-fg-muted">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            {t('landing.hero.chip1')}
            <span aria-hidden className="text-border">
              ·
            </span>
            {t('landing.hero.chip2')}
            <span aria-hidden className="text-border">
              ·
            </span>
            {t('landing.hero.note')}
          </p>
        </div>
        <div className="py-4">
          <PhoneMock />
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const { t } = useI18n();
  const stats = [
    ['landing.stats.s1v', 'landing.stats.s1l'],
    ['landing.stats.s2v', 'landing.stats.s2l'],
    ['landing.stats.s3v', 'landing.stats.s3l'],
    ['landing.stats.s4v', 'landing.stats.s4l'],
  ] as const;
  return (
    <section className="border-b border-border bg-bg">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 md:grid-cols-4">
        {stats.map(([v, l]) => (
          <div key={v} className="text-center">
            <p className="text-3xl font-extrabold tracking-tight text-brand">{t(v)}</p>
            <p className="mt-1 text-sm font-semibold text-fg-muted">{t(l)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Services() {
  const { t } = useI18n();
  const label = useServiceLabel();
  return (
    <section id="services" className="scroll-mt-20 border-b border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <SectionHead title={t('landing.services.title')} sub={t('landing.services.sub')} center />
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-3 gap-3 sm:grid-cols-5">
          {SERVICE_CODES.filter((c) => c !== 'CUSTOM').map((code) => (
            <div
              key={code}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-bg px-2 py-4 text-center"
            >
              <ServiceIcon code={code} />
              <span className="text-[13px] font-semibold leading-snug">{label(code)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Alternating feature rows, each with a small honest UI illustration. */
function Features() {
  const { t, tk } = useI18n();
  const rows = [
    { n: '1', visual: <RecordVisual /> },
    { n: '2', visual: <CashbookVisual /> },
    { n: '3', visual: <DuesVisual /> },
    { n: '6', visual: <OfflineVisual /> },
  ] as const;
  return (
    <section id="features" className="scroll-mt-20 bg-bg">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <SectionHead title={t('landing.feat.title')} sub={t('landing.feat.sub')} center />
        <div className="mt-14 flex flex-col gap-16">
          {rows.map((r, i) => (
            <div key={r.n} className="grid items-center gap-8 md:grid-cols-2">
              <div className={i % 2 ? 'md:order-2' : ''}>
                <h3 className="text-2xl font-extrabold tracking-tight">
                  {tk(`landing.feat.${r.n}.title`)}
                </h3>
                <p className="mt-3 text-lg text-fg-muted">{tk(`landing.feat.${r.n}.body`)}</p>
              </div>
              <div className={i % 2 ? 'md:order-1' : ''}>{r.visual}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function VisualFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-5 shadow-[0_18px_50px_-30px_rgba(22,26,46,0.4)]">
      {children}
    </div>
  );
}

function RecordVisual() {
  const { t } = useI18n();
  return (
    <VisualFrame>
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-bg text-brand-strong">
          <ClipboardList className="size-5" />
        </span>
        <span className="font-bold">{t('landing.mock.aeps')}</span>
      </div>
      <div className="mt-3 space-y-2">
        {['₹5,000', '9876543210', '1234'].map((v, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg bg-bg px-3 py-2 text-sm"
          >
            <span className="text-fg-muted">—</span>
            <span className="font-semibold">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 h-10 rounded-lg bg-brand" />
    </VisualFrame>
  );
}

function CashbookVisual() {
  const { t } = useI18n();
  const lines = [
    { k: 'landing.mock.aeps', v: '+ ₹5,000', up: true },
    { k: 'landing.mock.dmt', v: '− ₹2,500', up: false },
  ] as const;
  return (
    <VisualFrame>
      <div className="flex items-end justify-between border-b border-border pb-3">
        <div>
          <p className="text-xs text-fg-muted">{t('landing.mock.cashInHand')}</p>
          <p className="text-2xl font-extrabold">₹7,650</p>
        </div>
        <HandCoins className="size-6 text-brand" />
      </div>
      <div className="mt-3 space-y-2">
        {lines.map((l) => (
          <div
            key={l.k}
            className="flex items-center justify-between rounded-lg bg-bg px-3 py-2 text-sm"
          >
            <span className="font-semibold">{t(l.k)}</span>
            <span className={`font-bold ${l.up ? 'text-success' : 'text-danger'}`}>{l.v}</span>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

function DuesVisual() {
  const { t } = useI18n();
  return (
    <VisualFrame>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-brand-alt/20 font-bold text-brand-alt">
          G
        </span>
        <div className="flex-1">
          <p className="font-bold">Geeta</p>
          <p className="text-xs text-fg-muted">{t('landing.mock.pendingDues')}</p>
        </div>
        <p className="font-extrabold text-warning">₹430</p>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-9 flex-1 rounded-lg bg-brand" />
        <div className="h-9 w-20 rounded-lg border border-border" />
      </div>
    </VisualFrame>
  );
}

function OfflineVisual() {
  const { t } = useI18n();
  return (
    <VisualFrame>
      <div className="flex items-center justify-center gap-3 py-6">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-bg text-brand-strong">
          <WifiOff className="size-7" />
        </span>
        <ArrowRight className="size-6 text-fg-muted" />
        <span className="grid size-14 place-items-center rounded-2xl bg-success-bg text-success">
          <CheckCircle2 className="size-7" />
        </span>
      </div>
      <p className="text-center text-sm font-semibold text-fg-muted">{t('landing.mock.synced')}</p>
    </VisualFrame>
  );
}

function Pricing() {
  const { t } = useI18n();
  return (
    <section id="pricing" className="scroll-mt-20 border-y border-border bg-surface">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <SectionHead title={t('landing.pricing.title')} sub={t('landing.pricing.sub')} center />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <PlanCard
            name={t('landing.pricing.free.name')}
            price={t('landing.pricing.free.price')}
            per={t('landing.pricing.free.per')}
            desc={t('landing.pricing.free.desc')}
            feats={[
              'landing.pricing.free.f1',
              'landing.pricing.free.f2',
              'landing.pricing.free.f3',
            ]}
            cta={t('landing.cta.startFree')}
          />
          <PlanCard
            name={t('landing.pricing.growth.name')}
            price={t('landing.pricing.growth.price')}
            per={t('landing.pricing.growth.per')}
            desc={t('landing.pricing.growth.desc')}
            feats={[
              'landing.pricing.growth.f1',
              'landing.pricing.growth.f2',
              'landing.pricing.growth.f3',
              'landing.pricing.free.f1',
            ]}
            cta={t('landing.cta.start')}
            featured
          />
        </div>
        <p className="mt-6 text-center text-sm text-fg-muted">{t('landing.pricing.note')}</p>
      </div>
    </section>
  );
}

function PlanCard({
  name,
  price,
  per,
  desc,
  feats,
  cta,
  featured,
}: {
  name: string;
  price: string;
  per: string;
  desc: string;
  feats: string[];
  cta: string;
  featured?: boolean;
}) {
  const { t, tk } = useI18n();
  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-surface p-7 ${
        featured ? 'border-brand ring-1 ring-brand' : 'border-border'
      }`}
    >
      {featured && (
        <span className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-bold text-on-brand">
          <Star className="size-3" />
          {t('landing.pricing.popular')}
        </span>
      )}
      <h3 className="text-xl font-extrabold">{name}</h3>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-4xl font-extrabold tracking-tight">{price}</span>
        <span className="text-sm text-fg-muted">{per}</span>
      </div>
      <p className="mt-2 text-sm text-fg-muted">{desc}</p>
      <ul className="mt-5 flex-1 space-y-2.5">
        {feats.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-success" aria-hidden />
            <span>{tk(f)}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/login"
        className={`mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition ${
          featured
            ? 'bg-brand text-on-brand hover:brightness-95'
            : 'border border-border hover:bg-surface-muted'
        }`}
      >
        {cta}
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function Faq() {
  const { t, tk } = useI18n();
  const qa = ['1', '2', '3', '4', '5', '6'] as const;
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16">
      <SectionHead title={t('landing.faq.title')} center />
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
    <section className="bg-brand">
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-on-brand">
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-4xl">
          {t('landing.final.title')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-on-brand/85">{t('landing.final.sub')}</p>
        <Link
          href="/login"
          className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-surface px-6 text-base font-bold text-fg transition hover:brightness-95"
        >
          {t('landing.cta.start')}
          <ArrowRight className="size-5" />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useI18n();
  const brand = useBrand();
  const cols: Array<[string, Array<[string, string]>]> = [
    [
      t('landing.footer.product'),
      [
        ['#features', t('landing.nav.features')],
        ['#services', t('landing.nav.services')],
        ['#pricing', t('landing.nav.pricing')],
        ['#faq', t('landing.nav.faq')],
      ],
    ],
    [
      t('landing.footer.legalH'),
      [
        ['/terms', t('auth.email.terms')],
        ['/privacy', t('auth.email.privacy')],
        ['/login', t('landing.cta.signin')],
      ],
    ],
  ];
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <BrandMark />
          <p className="mt-3 max-w-xs text-sm text-fg-muted">{t('landing.footer.tagline')}</p>
        </div>
        {cols.map(([head, links]) => (
          <div key={head}>
            <p className="text-sm font-bold">{head}</p>
            <ul className="mt-3 space-y-2 text-sm text-fg-muted">
              {links.map(([href, label]) => (
                <li key={label}>
                  <Link href={href} className="hover:text-fg">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl">{t('landing.footer.independent')}</p>
          <p>
            © {new Date().getFullYear()} {brand.name}. {t('landing.footer.rights')}
          </p>
        </div>
      </div>
    </footer>
  );
}

function SectionHead({ title, sub, center }: { title: string; sub?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-lg text-fg-muted">{sub}</p>}
    </div>
  );
}

export function LandingContent() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <a href="#main" className="skip-link">
        {t('a11y.skip')}
      </a>
      <Header />
      <main id="main" className="flex-1">
        <Hero />
        <Stats />
        <Features />
        <Services />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
