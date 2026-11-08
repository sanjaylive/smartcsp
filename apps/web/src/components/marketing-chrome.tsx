'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Mail, Menu, Phone, WalletMinimal, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useBrand } from '@/lib/brand';
import { LanguageToggle, ThemeToggle } from '@/components/toggles';

/** Every public page linked from the footer. Keep in sync with app/sitemap.ts. */
export const POLICY_LINKS = [
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/refund-policy', label: 'Refund & Cancellation' },
  { href: '/shipping-policy', label: 'Delivery Policy' },
  { href: '/disclaimer', label: 'Disclaimer' },
] as const;

export function BrandMark() {
  const brand = useBrand();
  return (
    <Link href="/" className="group inline-flex items-center gap-3">
      <span
        aria-hidden
        className="grid size-10 place-items-center overflow-hidden rounded-xl bg-brand text-on-brand shadow-md shadow-brand/20 transition-transform duration-200 group-hover:scale-105"
      >
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="" className="size-full object-contain p-1" />
        ) : (
          <WalletMinimal className="size-5.5" strokeWidth={2.4} />
        )}
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight text-fg">
        {brand.name}
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const nav = [
    ['/#features', t('landing.nav.features')],
    ['/#simulator', t('landing.nav.howItWorks')],
    ['/#faq', t('landing.nav.faq')],
    ['/about', 'About'],
    ['/contact', 'Contact'],
  ] as const;

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandMark />

        <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
          {nav.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? 'page' : undefined}
              className="text-[14px] font-semibold text-fg-muted transition-colors hover:text-fg aria-[current=page]:text-brand"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageToggle className="border border-border/80 bg-surface/70" />
          <ThemeToggle className="hidden border border-border/80 bg-surface/70 sm:inline-flex" />
          <Link
            href="/login"
            className="hidden rounded-xl px-4 py-2.5 text-sm font-bold text-fg-muted transition-colors hover:bg-surface hover:text-fg sm:inline-flex"
          >
            {t('landing.cta.signin')}
          </Link>
          <Link
            href="/register"
            className="hidden min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-on-brand shadow-md shadow-brand/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-strong sm:inline-flex"
          >
            <span>{t('landing.cta.create')}</span>
            <ArrowRight className="size-4" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid size-11 place-items-center rounded-xl border border-border/80 bg-surface text-fg lg:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="animate-rise border-t border-border/70 bg-surface lg:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col px-4 py-3 sm:px-6">
            {nav.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-2 py-3 text-base font-semibold text-fg hover:bg-surface-muted"
              >
                {label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/70 pt-3">
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border text-sm font-bold text-fg"
              >
                {t('landing.cta.signin')}
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand text-sm font-bold text-on-brand"
              >
                {t('landing.cta.create')}
              </Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  const brand = useBrand();
  const year = new Date().getFullYear();

  const cols = [
    {
      title: 'Product',
      links: [
        { href: '/#features', label: t('landing.nav.features') },
        { href: '/#simulator', label: t('landing.nav.howItWorks') },
        { href: '/#faq', label: t('landing.nav.faq') },
        { href: '/register', label: t('landing.cta.create') },
        { href: '/login', label: t('landing.cta.signin') },
      ],
    },
    {
      title: 'Company',
      links: [
        { href: '/about', label: 'About us' },
        { href: '/contact', label: 'Contact us' },
      ],
    },
    { title: 'Policies', links: POLICY_LINKS },
  ];

  return (
    <footer className="border-t border-border/70 bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <BrandMark />
          <p className="mt-3 max-w-xs text-sm text-fg-muted">{t('landing.footer.tagline')}</p>
          <div className="mt-5 space-y-2 text-sm">
            {brand.supportEmail && (
              <a
                href={`mailto:${brand.supportEmail}`}
                className="flex items-center gap-2 text-fg-muted hover:text-fg"
              >
                <Mail className="size-4 text-brand" /> {brand.supportEmail}
              </a>
            )}
            {brand.supportPhone && (
              <a
                href={`tel:${brand.supportPhone.replace(/\s+/g, '')}`}
                className="flex items-center gap-2 text-fg-muted hover:text-fg"
              >
                <Phone className="size-4 text-brand" /> {brand.supportPhone}
              </a>
            )}
          </div>
        </div>

        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-xs font-bold uppercase tracking-widest text-fg">{c.title}</p>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-fg-muted transition hover:text-brand">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border/60 bg-surface-muted/40 py-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="max-w-2xl">{t('landing.footer.independent')}</p>
          <p>
            © {year} {brand.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Header + footer shell shared by the homepage and every public information page. */
export function MarketingShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mk flex min-h-dvh flex-col bg-bg text-fg">
      <a href="#main" className="skip-link">
        {t('a11y.skip')}
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/** Page title band used at the top of inner pages. */
export function PageHero({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-surface/50">
      <div className="bg-grid absolute inset-0 opacity-40" aria-hidden />
      <div aria-hidden className="absolute -right-24 -top-24 size-72 rounded-full bg-brand-bg" />
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <p className="animate-rise text-xs font-bold uppercase tracking-widest text-brand">
          {eyebrow}
        </p>
        <h1
          className="animate-rise mt-3 max-w-3xl font-display text-4xl font-extrabold tracking-tight text-fg sm:text-5xl"
          style={{ animationDelay: '80ms' }}
        >
          {title}
        </h1>
        {sub && (
          <div
            className="animate-rise mt-4 max-w-2xl text-lg text-fg-muted"
            style={{ animationDelay: '160ms' }}
          >
            {sub}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
