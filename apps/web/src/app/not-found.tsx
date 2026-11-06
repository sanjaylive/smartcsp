'use client';

import { SearchX } from 'lucide-react';
import { PublicShell } from '@/components/toggles';
import { ButtonLink } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <PublicShell>
      <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <SearchX aria-hidden className="size-10 text-fg-muted" />
        <h1 className="text-2xl font-extrabold">{t('state.notFound')}</h1>
        <p className="text-fg-muted">{t('state.notFoundHelp')}</p>
        <ButtonLink href="/">{t('app.name')}</ButtonLink>
      </div>
    </PublicShell>
  );
}
