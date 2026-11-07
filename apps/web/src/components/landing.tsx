'use client';

import Link from 'next/link';
import { ArrowRight, Check, Minus, Plus, WalletMinimal } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useBrand } from '@/lib/brand';
import { LanguageToggle } from '@/components/toggles';

/* ----------------------------------------------------------------- shared bits */

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

function Btn({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'outline';
}) {
  const cls =
    variant === 'primary'
      ? 'bg-brand text-on-brand hover:bg-brand-strong'
      : 'border border-border bg-surface text-fg hover:bg-surface-muted';
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-bold transition ${cls}`}
    >
      {children}
    </Link>
  );
}

function Header() {
  const { t } = useI18n();
  const nav = [
    ['#work', t('landing.nav.features')],
    ['#pricing', t('landing.nav.pricing')],
    ['#faq', t('landing.nav.faq')],
  ] as const;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <BrandMark />
        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {nav.map(([href, label]) => (
            <a key={href} href={href} className="text-sm font-semibold text-fg-muted hover:text-fg">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-fg-muted hover:text-fg sm:inline-flex"
          >
            {t('landing.cta.signin')}
          </Link>
          <Btn href="/login">{t('landing.cta.start')}</Btn>
        </div>
      </div>
    </header>
  );
}

/* ----------------------------------------------------------------- product screens (demo data) */

function DemoTag() {
  const { t } = useI18n();
  return (
    <span className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fg-muted">
      {t('landing.demo')}
    </span>
  );
}

function Chip({ tone, children }: { tone: 'success' | 'warning'; children: React.ReactNode }) {
  const cls = tone === 'success' ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning';
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

/* A faithful, legible recreation of the daily dashboard. */
function DashboardScreen() {
  const { t } = useI18n();
  const brand = useBrand();
  const stats = [
    [t('landing.mock.collections'), '₹18,240'],
    [t('landing.mock.cashInHand'), '₹7,650'],
    [t('landing.mock.pendingDues'), '₹430'],
  ] as const;
  const rows = [
    [t('landing.mock.aeps'), 'Geeta', '₹5,000', 'success'],
    [t('landing.mock.dmt'), 'Ramesh', '₹2,500', 'success'],
    [t('landing.mock.pan'), 'Sita', '₹107', 'warning'],
  ] as const;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_24px_60px_-28px_rgba(34,32,29,0.45)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="grid size-6 place-items-center rounded bg-brand text-on-brand">
            <WalletMinimal className="size-3.5" />
          </span>
          {brand.name}
        </div>
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          {t('landing.mock.today')} · 07 Nov <DemoTag />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 p-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-bg px-3 py-2.5">
            <p className="text-[11px] font-semibold text-fg-muted">{label}</p>
            <p className="mt-0.5 text-lg font-extrabold tracking-tight">{value}</p>
          </div>
        ))}
      </div>
      <div className="px-4 pb-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
          {t('landing.mock.recent')}
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <tbody>
              {rows.map(([svc, who, amt, tone], i) => (
                <tr key={svc} className={i ? 'border-t border-border' : ''}>
                  <td className="px-3 py-2.5 font-semibold">{svc}</td>
                  <td className="px-3 py-2.5 text-fg-muted">{who}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{amt}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Chip tone={tone as 'success' | 'warning'}>
                      {t(tone === 'success' ? 'landing.mock.success' : 'landing.mock.pending')}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ScreenFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-[0_20px_50px_-32px_rgba(34,32,29,0.45)]">
      {children}
    </div>
  );
}

function RecordScreen() {
  const { t } = useI18n();
  const fields = [
    [t('landing.screen.service'), t('landing.mock.aeps')],
    [t('landing.screen.amount'), '₹5,000'],
    [t('landing.screen.mobile'), '98765 43210'],
    [t('landing.screen.account'), '•••• 1234'],
  ] as const;
  return (
    <ScreenFrame>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-bold">{t('landing.screen.newRecord')}</p>
        <DemoTag />
      </div>
      <div className="space-y-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <p className="text-[11px] font-semibold text-fg-muted">{label}</p>
            <div className="mt-0.5 flex items-center rounded-lg border border-border bg-bg px-3 py-2 text-sm font-semibold">
              {value}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex min-h-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-on-brand">
        {t('landing.screen.save')}
      </div>
    </ScreenFrame>
  );
}

function CashbookScreen() {
  const { t } = useI18n();
  const lines = [
    [t('landing.mock.aeps'), '+ ₹5,000', true],
    [t('landing.mock.dmt'), '− ₹2,500', false],
    [t('landing.screen.expense'), '− ₹200', false],
  ] as const;
  return (
    <ScreenFrame>
      <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="text-[11px] font-semibold text-fg-muted">{t('landing.mock.cashInHand')}</p>
          <p className="text-2xl font-extrabold tracking-tight">₹7,650</p>
        </div>
        <DemoTag />
      </div>
      <div className="space-y-1.5">
        {lines.map(([label, amt, up]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2 font-semibold">
              {up ? (
                <Plus className="size-3.5 text-success" />
              ) : (
                <Minus className="size-3.5 text-warning" />
              )}
              {label}
            </span>
            <span className={`font-bold ${up ? 'text-success' : 'text-fg'}`}>{amt}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-bg px-3 py-2 text-sm font-bold">
        <span>{t('landing.screen.expectedInDrawer')}</span>
        <span>₹7,650</span>
      </div>
    </ScreenFrame>
  );
}

function DuesScreen() {
  const { t } = useI18n();
  return (
    <ScreenFrame>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-bold">{t('landing.screen.dues')}</p>
        <DemoTag />
      </div>
      {[
        ['Geeta', '₹430'],
        ['Ramesh', '₹1,200'],
      ].map(([who, amt], i) => (
        <div
          key={who}
          className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-border' : ''}`}
        >
          <span className="grid size-9 place-items-center rounded-full bg-brand-bg font-bold text-brand">
            {who[0]}
          </span>
          <span className="flex-1 font-semibold">{who}</span>
          <span className="font-extrabold text-warning">{amt}</span>
          <span className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-on-brand">
            {t('landing.screen.collect')}
          </span>
        </div>
      ))}
    </ScreenFrame>
  );
}

/* ----------------------------------------------------------------- sections */

function Hero() {
  const { t } = useI18n();
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-20">
        <div>
          <h1 className="text-[2.1rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            {t('landing.hero.title')}{' '}
            <span className="text-brand">{t('landing.hero.titleEm')}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-fg-muted">{t('landing.hero.sub')}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Btn href="/login">
              {t('landing.cta.start')}
              <ArrowRight className="size-4" />
            </Btn>
            <Btn href="#work" variant="outline">
              {t('landing.seeHow')}
            </Btn>
          </div>
          <p className="mt-4 text-sm font-semibold text-fg-muted">{t('landing.hero.note')}</p>
        </div>
        <div>
          <DashboardScreen />
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const { t } = useI18n();
  const facts = [
    [t('landing.stats.s1v'), t('landing.stats.s1l')],
    [t('landing.stats.s4v'), t('landing.stats.s4l')],
    [t('landing.stats.s3v'), t('landing.stats.s3l')],
  ] as const;
  return (
    <section className="border-b border-border bg-brand-bg">
      <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6 sm:grid-cols-3">
        {facts.map(([v, l]) => (
          <div key={l} className="flex items-baseline justify-center gap-2 text-center">
            <span className="text-xl font-extrabold text-brand">{v}</span>
            <span className="text-sm font-semibold text-fg">{l}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Workflow({
  n,
  screen,
  peach,
  flip,
}: {
  n: string;
  screen: React.ReactNode;
  peach?: boolean;
  flip?: boolean;
}) {
  const { t, tk } = useI18n();
  return (
    <section className={peach ? 'bg-brand-bg' : ''}>
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
        <div className={flip ? 'md:order-2' : ''}>
          <h2 className="text-3xl font-extrabold tracking-tight">
            {tk(`landing.feat.${n}.title`)}
          </h2>
          <p className="mt-3 text-lg text-fg-muted">{tk(`landing.feat.${n}.body`)}</p>
          <p className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand">
            <Check className="size-4" />
            {t(`landing.work.${n}` as 'landing.work.1')}
          </p>
        </div>
        <div className={flip ? 'md:order-1' : ''}>{screen}</div>
      </div>
    </section>
  );
}

function Faq() {
  const { t, tk } = useI18n();
  const qa = ['1', '2', '3', '4', '5', '6'] as const;
  return (
    <section id="faq" className="border-t border-border">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">
          {t('landing.faq.title')}
        </h2>
        <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-surface">
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
      </div>
    </section>
  );
}

function CtaBand() {
  const { t } = useI18n();
  return (
    <section id="pricing" className="border-t border-border bg-brand">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-on-brand">
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-4xl">
          {t('landing.final.title')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-on-brand/85">{t('landing.pricing.sub')}</p>
        <Link
          href="/login"
          className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-lg bg-surface px-6 text-base font-bold text-fg transition hover:bg-surface-muted"
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
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <BrandMark />
          <p className="mt-2 max-w-xs text-sm text-fg-muted">{t('landing.footer.tagline')}</p>
        </div>
        <nav className="flex flex-wrap gap-5 text-sm font-semibold text-fg-muted">
          <Link href="/terms" className="hover:text-fg">
            {t('auth.email.terms')}
          </Link>
          <Link href="/privacy" className="hover:text-fg">
            {t('auth.email.privacy')}
          </Link>
          <Link href="/login" className="hover:text-fg">
            {t('landing.cta.signin')}
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl">{t('landing.footer.independent')}</p>
          <p>
            © {new Date().getFullYear()} {brand.name}
          </p>
        </div>
      </div>
    </footer>
  );
}

export function LandingContent() {
  const { t } = useI18n();
  return (
    <div className="mk flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        {t('a11y.skip')}
      </a>
      <Header />
      <main id="main" className="flex-1">
        <Hero />
        <TrustStrip />
        <div id="work">
          <Workflow n="1" screen={<RecordScreen />} />
          <Workflow n="2" screen={<CashbookScreen />} peach flip />
          <Workflow n="3" screen={<DuesScreen />} />
        </div>
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}
