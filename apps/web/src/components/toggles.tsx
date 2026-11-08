'use client';

import Link from 'next/link';
import { ArrowRight, Languages, Moon, Sun, WalletMinimal } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { isDark, useTheme } from '@/lib/theme';
import { useBrand } from '@/lib/brand';
import { cn } from '@/lib/cn';

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const next = locale === 'en' ? 'hi' : 'en';
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-sm font-semibold hover:bg-surface-muted',
        className,
      )}
      aria-label={t('toggle.language')}
      lang={next}
    >
      <Languages aria-hidden className="size-5" />
      <span>{next === 'hi' ? 'हिंदी' : 'English'}</span>
    </button>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(isDark(theme)), [theme]);
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-[10px] hover:bg-surface-muted',
        className,
      )}
      aria-label={dark ? t('toggle.light') : t('toggle.dark')}
      aria-pressed={dark}
    >
      {dark ? <Sun aria-hidden className="size-5" /> : <Moon aria-hidden className="size-5" />}
    </button>
  );
}

export function Logo({ href = '/', compact }: { href?: string; compact?: boolean }) {
  const brand = useBrand();
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2.5 font-extrabold tracking-tight"
    >
      <span
        aria-hidden
        className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand text-on-brand shadow-sm transition-transform duration-200 group-hover:scale-105"
      >
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="" className="size-full object-contain p-0.5" />
        ) : (
          <WalletMinimal className="size-5" strokeWidth={2.4} />
        )}
      </span>
      {!compact ? (
        <div className="flex items-center gap-1.5">
          <span className="font-display text-lg font-extrabold tracking-tight text-fg">
            {brand.name}
          </span>
          <span className="rounded-full bg-brand-bg px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-brand">
            PRO
          </span>
        </div>
      ) : (
        <span className="sr-only">{brand.name}</span>
      )}
    </Link>
  );
}

export function PublicShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  const brand = useBrand();

  return (
    <div className="mk flex min-h-dvh flex-col bg-bg text-fg">
      <a href="#main" className="skip-link">
        {t('a11y.skip')}
      </a>
      {/* Sticky Frosted Header matching Landing and Auth */}
      <header className="sticky top-0 z-50 border-b border-border/70 bg-bg/85 backdrop-blur-xl transition-colors">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav aria-label="Quick" className="hidden items-center gap-6 md:flex">
            <Link
              href="/"
              className="text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
            >
              Home
            </Link>
            <Link
              href="/#simulator"
              className="text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
            >
              How It Works
            </Link>
            <Link
              href="/contact"
              className="text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
            >
              Contact Us
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle className="border border-border/80 bg-surface/70" />
            <ThemeToggle className="border border-border/80 bg-surface/70" />
            <Link
              href="/login"
              className="hidden rounded-xl px-3.5 py-2 text-sm font-bold text-fg-muted transition-colors hover:bg-surface hover:text-fg sm:inline-flex"
            >
              {t('landing.cta.signin')}
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-strong px-4 text-xs font-bold text-on-brand shadow-md shadow-brand/20 transition hover:shadow-brand/35"
            >
              <span>{t('landing.cta.create')}</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container with subtle ambient backdrop */}
      <main id="main" className="relative flex-1 overflow-hidden">
        <div className="pro-radial-glow opacity-50" aria-hidden />
        <div
          className={cn(
            'relative mx-auto w-full px-4 py-12 sm:px-6 lg:px-8',
            wide ? 'max-w-7xl' : 'max-w-4xl',
          )}
        >
          {children}
        </div>
      </main>

      {/* Modern Pro Footer */}
      <footer className="border-t border-border/70 bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <Logo />
            <p className="mt-2 max-w-sm text-xs font-medium text-fg-muted">
              {t('landing.footer.tagline')}
            </p>
          </div>
          <nav className="flex flex-wrap gap-6 text-sm font-semibold text-fg-muted">
            <Link href="/terms" className="transition hover:text-fg">
              {t('auth.email.terms')}
            </Link>
            <Link href="/privacy" className="transition hover:text-fg">
              {t('auth.email.privacy')}
            </Link>
            <Link href="/contact" className="transition hover:text-fg">
              Contact Us
            </Link>
            <Link href="/login" className="transition hover:text-fg">
              {t('landing.cta.signin')}
            </Link>
          </nav>
        </div>
        <div className="border-t border-border/60 bg-surface-muted/40 py-5">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p className="max-w-2xl">{t('landing.footer.independent')}</p>
            <p>
              © {new Date().getFullYear()} {brand.name}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
