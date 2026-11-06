'use client';

import Link from 'next/link';
import { Languages, Moon, Sun } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { isDark, useTheme } from '@/lib/theme';
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
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg font-extrabold tracking-tight"
    >
      <span
        aria-hidden
        className="inline-flex size-9 items-center justify-center rounded-xl bg-brand text-on-brand text-sm"
      >
        C2
      </span>
      {!compact ? (
        <span className="text-lg">CSP2All</span>
      ) : (
        <span className="sr-only">CSP2All</span>
      )}
    </Link>
  );
}

export function PublicShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        {t('a11y.skip')}
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <Logo />
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main
        id="main"
        className={cn('mx-auto w-full flex-1 px-4 py-8', wide ? 'max-w-6xl' : 'max-w-xl')}
      >
        {children}
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl">{t('app.disclaimer')}</p>
          <nav aria-label={t('a11y.legal')} className="flex gap-4">
            <Link className="underline underline-offset-2" href="/terms">
              {t('auth.email.terms')}
            </Link>
            <Link className="underline underline-offset-2" href="/privacy">
              {t('auth.email.privacy')}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
