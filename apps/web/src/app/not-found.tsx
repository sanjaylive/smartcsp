'use client';

import Link from 'next/link';
import { ArrowRight, SearchX } from 'lucide-react';
import { PublicShell } from '@/components/toggles';
import { useI18n } from '@/lib/i18n';
import { useBrand } from '@/lib/brand';

export default function NotFound() {
  const { t } = useI18n();
  const brand = useBrand();

  return (
    <PublicShell>
      <div className="pro-card flex flex-col items-center justify-center p-8 sm:p-14 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-brand-bg text-brand">
          <SearchX aria-hidden className="size-8" />
        </span>
        <span className="mt-6 rounded-full bg-surface-muted px-3 py-1 text-xs font-bold text-fg-muted uppercase tracking-wider">
          404 · Page Not Found
        </span>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
          {t('state.notFound')}
        </h1>
        <p className="mt-2 max-w-md text-sm text-fg-muted">{t('state.notFoundHelp')}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-strong px-6 text-sm font-bold text-on-brand shadow-md shadow-brand/20 transition hover:shadow-brand/35"
          >
            <span>Back to {brand.name}</span>
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/contact"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-bold text-fg transition hover:bg-surface-muted"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
