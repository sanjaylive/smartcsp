'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, Store } from 'lucide-react';
import { PublicShell } from '@/components/toggles';
import { Alert, Badge, Button, ButtonLink } from '@/components/ui';
import { QueryState } from '@/components/query-state';
import { api } from '@/lib/api';
import { errorMessage, qk, useMe } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { Me } from '@/lib/types';

export default function SelectShop() {
  const { t, tk } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Starts a fresh onboarding draft for an additional shop; existing shops are untouched. */
  const startNewShop = async () => {
    setBusy('new');
    setError(null);
    try {
      await api('/v1/onboarding/new-shop', { method: 'POST' });
      qc.removeQueries({ queryKey: ['onboarding'] });
      router.push('/onboarding');
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(null);
    }
  };

  const choose = async (tenantId: string) => {
    setBusy(tenantId);
    setError(null);
    try {
      const res = await api<Me>('/v1/auth/select-tenant', { method: 'POST', body: { tenantId } });
      qc.clear();
      qc.setQueryData(qk.me, res);
      router.replace('/app');
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(null);
    }
  };

  return (
    <PublicShell>
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">{t('auth.tenant.title')}</h1>
      <p className="mb-6 text-fg-muted">{t('selectShop.help')}</p>
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <QueryState query={me}>
        {(data) => (
          <ul className="flex flex-col gap-3">
            {data.tenants.map((m) => (
              <li key={m.tenantId}>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => choose(m.tenantId)}
                  className="pro-card flex w-full items-center gap-4 p-4 text-left disabled:opacity-60"
                >
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-bg text-brand-strong dark:text-fg">
                    <Store aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{m.name}</span>
                    <span className="block text-sm text-fg-muted">
                      {[m.district, m.state].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Badge tone="brand">{tk(`role.${m.role}`)}</Badge>
                    {m.tenantStatus !== 'ACTIVE' ? (
                      <Badge tone="danger">{tk(`tenantStatus.${m.tenantStatus}`)}</Badge>
                    ) : null}
                    {m.status === 'INVITED' ? (
                      <Badge tone="info">{t('selectShop.invited')}</Badge>
                    ) : null}
                  </span>
                  <ChevronRight aria-hidden className="size-5 text-fg-muted" />
                </button>
              </li>
            ))}
            <li>
              {data.tenants.length === 0 ? (
                <ButtonLink
                  href="/onboarding"
                  variant="outline"
                  className="w-full"
                  icon={<Plus aria-hidden className="size-4" />}
                >
                  {t('selectShop.create')}
                </ButtonLink>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  loading={busy === 'new'}
                  icon={<Plus aria-hidden className="size-4" />}
                  onClick={startNewShop}
                >
                  {t('selectShop.createAnother')}
                </Button>
              )}
            </li>
          </ul>
        )}
      </QueryState>
    </PublicShell>
  );
}
