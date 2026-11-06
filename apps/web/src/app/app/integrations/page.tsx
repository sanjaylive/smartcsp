'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CircleX, FlaskConical, PlugZap } from 'lucide-react';
import { formatDateTime, type ServiceCode } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, usePermissions } from '@/lib/hooks';
import type { IntegrationsOverview } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  PageHeader,
  tableCls,
} from '@/components/ui';
import { QueryState } from '@/components/query-state';
import { useServiceLabel } from '@/components/service';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

interface Ops {
  items: {
    id: string;
    recordId: string;
    mode: string;
    status: string;
    providerRef: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }[];
  exceptions: { id: string; operationId: string; kind: string; createdAt: string }[];
}

export default function IntegrationsPage() {
  const { t, tk } = useI18n();
  const { can, ctx } = usePermissions();
  const q = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api<IntegrationsOverview>('/v1/integrations'),
  });
  const ops = useQuery({
    queryKey: ['provider-ops'],
    queryFn: () => api<Ops>('/v1/provider-operations'),
  });
  return (
    <>
      <PageHeader title={t('nav.integrations')} description={t('integrations.help')} />
      <QueryState query={q}>
        {(d) => (
          <div className="flex flex-col gap-6">
            <Alert tone="info">{t('integrations.notice')}</Alert>
            {d.providers.map((p) => (
              <div key={p.provider} className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader
                    title={
                      <span className="flex items-center gap-2">
                        <PlugZap aria-hidden className="size-5" /> {t('integrations.pay2all')}
                      </span>
                    }
                    actions={
                      <Badge tone={p.mode === 'SIMULATOR' ? 'warning' : 'neutral'}>
                        {tk(`connectorMode.${p.mode}`)}
                      </Badge>
                    }
                  />
                  <div className="flex flex-col gap-4 p-5">
                    <Alert tone="warning" title={t('integrations.liveUnavailable')}>
                      <span data-testid="live-unavailable">{t('integrations.liveReason')}</span>
                    </Alert>
                    <div>
                      <h3 className="mb-2 font-bold">{t('integrations.readiness')}</h3>
                      <ul className="flex flex-col gap-2" data-testid="readiness-list">
                        {(Array.isArray(p.missing) ? (p.missing as string[]) : []).map((m) => (
                          <li key={m} className="flex items-start gap-2 text-sm">
                            <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
                            <span>
                              <span className="sr-only">{t('integrations.missing')}: </span>
                              {m}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="text-sm text-fg-muted">
                      {t('integrations.lastHealth')}:{' '}
                      {p.lastHealthAt
                        ? `${formatDateTime(p.lastHealthAt, ctx?.tenant.timezone)} · ${p.lastHealthStatus ?? ''}`
                        : '—'}
                    </p>
                  </div>
                </Card>
                <SimulatorCard
                  p={p}
                  planAllows={d.planAllowsConnector}
                  canManage={can('integrations.manage')}
                />
              </div>
            ))}
            <Card>
              <CardHeader
                title={t('integrations.operations')}
                description={t('integrations.operationsHelp')}
              />
              <QueryState query={ops}>
                {(o) =>
                  o.items.length === 0 ? (
                    <EmptyState
                      icon={<Activity aria-hidden className="size-6" />}
                      title={t('integrations.noOps')}
                    />
                  ) : (
                    <div className={tableCls.wrap}>
                      <table className={tableCls.table}>
                        <thead>
                          <tr>
                            <th className={tableCls.th}>{t('common.date')}</th>
                            <th className={tableCls.th}>{t('integrations.mode')}</th>
                            <th className={tableCls.th}>{t('common.status')}</th>
                            <th className={tableCls.th}>{t('integrations.providerRef')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.items.map((x) => (
                            <tr key={x.id}>
                              <td className={tableCls.td}>
                                {formatDateTime(x.createdAt, ctx?.tenant.timezone)}
                              </td>
                              <td className={tableCls.td}>{tk(`connectorMode.${x.mode}`)}</td>
                              <td className={tableCls.td}>
                                <Badge
                                  tone={
                                    x.status === 'CONFIRMED'
                                      ? 'success'
                                      : x.status === 'FAILED'
                                        ? 'danger'
                                        : 'warning'
                                  }
                                >
                                  {tk(`connectorStatus.${x.status}`)}
                                </Badge>
                              </td>
                              <td className={cn(tableCls.td, 'money')}>{x.providerRef ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                }
              </QueryState>
            </Card>
          </div>
        )}
      </QueryState>
    </>
  );
}

function SimulatorCard({
  p,
  planAllows,
  canManage,
}: {
  p: IntegrationsOverview['providers'][number];
  planAllows: boolean;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const label = useServiceLabel();
  const [services, setServices] = useState<ServiceCode[]>(p.enabledServices);
  useEffect(() => setServices(p.enabledServices), [p.enabledServices]);
  const configure = useMutation({
    mutationFn: (mode: 'DISABLED' | 'SIMULATOR') =>
      api('/v1/integrations/pay2all', { method: 'PUT', body: { mode, enabledServices: services } }),
    onSuccess: () => {
      toast('success', t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const health = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; detail?: string }>('/v1/integrations/pay2all/health', { method: 'POST' }),
    onSuccess: (r) => {
      toast(
        r.ok ? 'success' : 'error',
        r.detail ?? (r.ok ? t('integrations.healthOk') : t('integrations.healthFail')),
      );
      void qc.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  return (
    <Card className="border-2 border-dashed border-warning/60">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <FlaskConical aria-hidden className="size-5 text-warning" />{' '}
            {t('integrations.simulator')}
          </span>
        }
        description={t('integrations.simulatorHelp')}
      />
      <div className="flex flex-col gap-4 p-5">
        <Alert tone="warning" title={t('integrations.noMoneyTitle')}>
          <span className="inline-flex items-start gap-2" data-testid="simulator-label">
            {t('integrations.noMoney')}
          </span>
        </Alert>
        {!p.simulatorAvailable ? (
          <p className="text-sm text-fg-muted">{t('integrations.simulatorOff')}</p>
        ) : null}
        {!planAllows ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-fg-muted">{t('integrations.planRequired')}</p>
            <ButtonLink href="/app/subscription" variant="secondary">
              {t('plan.upgrade')}
            </ButtonLink>
          </div>
        ) : null}
        {canManage && planAllows && p.simulatorAvailable ? (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">
                {t('integrations.servicesForSimulator')}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {p.supportedServices.map((s) => (
                  <Checkbox
                    key={s}
                    label={label(s)}
                    checked={services.includes(s)}
                    onChange={(v) => setServices((x) => (v ? [...x, s] : x.filter((y) => y !== s)))}
                  />
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              {p.mode === 'SIMULATOR' ? (
                <>
                  <Button
                    onClick={() => configure.mutate('SIMULATOR')}
                    loading={configure.isPending}
                  >
                    {t('common.save')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => configure.mutate('DISABLED')}
                    loading={configure.isPending}
                  >
                    {t('integrations.disable')}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => configure.mutate('SIMULATOR')}
                  loading={configure.isPending}
                  icon={<FlaskConical aria-hidden className="size-4" />}
                >
                  {t('integrations.enableSimulator')}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => health.mutate()}
                loading={health.isPending}
                icon={<Activity aria-hidden className="size-4" />}
              >
                {t('integrations.healthCheck')}
              </Button>
            </div>
          </>
        ) : null}
        {!canManage ? <p className="text-sm text-fg-muted">{t('integrations.viewOnly')}</p> : null}
      </div>
    </Card>
  );
}
