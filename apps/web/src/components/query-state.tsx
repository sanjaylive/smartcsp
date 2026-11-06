'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Lock, RefreshCw, SearchX } from 'lucide-react';
import { ApiError, isApiError } from '@/lib/api';
import { errorMessage } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Alert, Button, ButtonLink, Skeleton } from './ui';

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <span className="sr-only" role="status">
        {t('common.loading')}
      </span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/** Uniform error presentation: permission denied, plan required, quota, suspended, not found, retry. */
export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  if (isApiError(error, 'PERMISSION_DENIED') || isApiError(error, 'FORBIDDEN')) {
    return (
      <Alert tone="warning" title={t('state.permissionTitle')}>
        <p className="flex items-center gap-2">
          <Lock aria-hidden className="size-4" />
          {t('common.permissionDenied')}
        </p>
      </Alert>
    );
  }
  if (isApiError(error, 'ENTITLEMENT_REQUIRED') || isApiError(error, 'QUOTA_EXCEEDED')) {
    return <UpgradeNotice error={error as ApiError} />;
  }
  if (isApiError(error, 'TENANT_SUSPENDED')) {
    return (
      <Alert tone="danger" title={t('banner.suspendedTitle')}>
        {t('banner.suspended')}
      </Alert>
    );
  }
  if (isApiError(error, 'NOT_FOUND')) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <SearchX aria-hidden className="size-8 text-fg-muted" />
        <p className="text-base font-semibold">{t('state.notFound')}</p>
        <p className="max-w-md text-sm text-fg-muted">{t('state.notFoundHelp')}</p>
        <ButtonLink href="/app" variant="outline">
          {t('nav.dashboard')}
        </ButtonLink>
      </div>
    );
  }
  return (
    <Alert
      tone="danger"
      title={t('common.error')}
      action={
        onRetry ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            icon={<RefreshCw aria-hidden className="size-4" />}
          >
            {t('common.retry')}
          </Button>
        ) : null
      }
    >
      {errorMessage(t, error)}
      {isApiError(error) && error.requestId ? (
        <span className="mt-1 block text-xs text-fg-muted">
          {t('state.requestId', { id: error.requestId })}
        </span>
      ) : null}
    </Alert>
  );
}

export function UpgradeNotice({ error }: { error?: ApiError }) {
  const { t } = useI18n();
  const metric =
    (error?.details?.metric as string | undefined) ??
    (error?.details?.entitlement as string | undefined);
  const quota = error?.code === 'QUOTA_EXCEEDED';
  return (
    <Alert
      tone="warning"
      title={quota ? t('quota.title') : t('upgrade.featureTitle')}
      action={
        <ButtonLink href="/app/subscription" variant="primary">
          {t('plan.upgrade')}
        </ButtonLink>
      }
    >
      <p data-testid={quota ? 'quota-reached' : 'entitlement-required'}>
        {quota ? t('plan.quotaReached', { item: t(metricKey(metric)) }) : t('upgrade.featureBody')}
      </p>
      {quota && error?.details?.limit !== undefined ? (
        <p className="mt-1 text-sm text-fg-muted">
          {t('quota.limit', { limit: String(error.details.limit) })}
        </p>
      ) : null}
    </Alert>
  );
}

function metricKey(m: string | undefined) {
  switch (m) {
    case 'RECORDS_CREATED':
      return 'quota.metric.records' as const;
    case 'STAFF':
      return 'quota.metric.staff' as const;
    case 'SERVICES':
      return 'quota.metric.services' as const;
    case 'CUSTOM_SERVICES':
      return 'quota.metric.customServices' as const;
    case 'STORAGE':
      return 'quota.metric.storage' as const;
    default:
      return 'quota.metric.generic' as const;
  }
}

export function QueryState<T>({
  query,
  children,
  rows,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  rows?: number;
}) {
  if (query.isPending) return <LoadingBlock rows={rows} />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => query.refetch()} />;
  return <>{children(query.data as T)}</>;
}
