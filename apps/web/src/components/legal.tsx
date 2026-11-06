'use client';

import { PublicShell } from './toggles';
import { Alert } from './ui';
import { useI18n, type Key } from '@/lib/i18n';

export function LegalPage({
  title,
  sections,
}: {
  title: Key;
  sections: Array<{ h: Key; p: Key }>;
}) {
  const { t } = useI18n();
  return (
    <PublicShell>
      <article className="card p-6">
        <h1 className="text-3xl font-extrabold tracking-tight">{t(title)}</h1>
        <Alert tone="warning" className="mt-4" title={t('legal.templateTitle')}>
          <span className="inline-flex items-start gap-2">{t('legal.templateBody')}</span>
        </Alert>
        <div className="mt-6 flex flex-col gap-5">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-bold">{t(s.h)}</h2>
              <p className="mt-1 text-[15px] text-fg-muted">{t(s.p)}</p>
            </section>
          ))}
        </div>
      </article>
    </PublicShell>
  );
}
