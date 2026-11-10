'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CircleX, FlaskConical, Hotel, Plane, PlugZap, Zap } from 'lucide-react';
import { formatDateTime, type ServiceCode } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, qk, usePermissions } from '@/lib/hooks';
import type { IntegrationsOverview } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Field,
  Input,
  EmptyState,
  PageHeader,
  tableCls,
} from '@/components/ui';
import { QueryState } from '@/components/query-state';
import { ServiceIcon, useServiceLabel } from '@/components/service';
import { CopyText } from '@/components/payment-collect';
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
              <Pay2AllCard
                key={p.provider}
                p={p}
                planAllows={d.planAllowsConnector}
                canManage={can('integrations.manage')}
                timezone={ctx?.tenant.timezone}
              />
            ))}
            <ComingSoon />
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

type ConnMode = 'DISABLED' | 'UAT' | 'LIVE' | 'SIMULATOR';

/**
 * Pay2All settings: connection (Offline / Test / Live), API token, which services run Live,
 * and the callback URL to paste into Pay2All.
 */
function Pay2AllCard({
  p,
  planAllows,
  canManage,
  timezone,
}: {
  p: IntegrationsOverview['providers'][number];
  planAllows: boolean;
  canManage: boolean;
  timezone?: string;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const label = useServiceLabel();
  const { ctx } = usePermissions();
  const [mode, setMode] = useState<ConnMode>(p.mode);
  const [token, setToken] = useState('');
  const [verifyId, setVerifyId] = useState('');
  const [services, setServices] = useState<ServiceCode[]>(p.enabledServices);
  const [balance, setBalance] = useState<string | null>(null);
  useEffect(() => {
    setMode(p.mode);
    setServices(p.enabledServices);
  }, [p.mode, p.enabledServices]);

  const shopServices = new Set(ctx?.services.filter((s) => s.selected).map((s) => s.code) ?? []);
  const rows: ServiceCode[] = [
    ...p.liveServices,
    ...p.pendingServices.filter((s) => !p.liveServices.includes(s)),
  ].filter((s) => shopServices.has(s) || p.liveServices.includes(s));
  const canLive = (s: ServiceCode) =>
    mode === 'SIMULATOR'
      ? p.supportedServices.includes(s)
      : mode === 'UAT'
        ? p.uatServices.includes(s)
        : mode === 'LIVE'
          ? p.liveServices.includes(s)
          : false;

  const save = useMutation({
    mutationFn: () =>
      api('/v1/integrations/pay2all', {
        method: 'PUT',
        body: {
          mode,
          enabledServices: services.filter(canLive),
          credentials: {
            ...(token.trim() ? { apiToken: token.trim() } : {}),
            ...(verifyId.trim() ? { verifyProviderId: verifyId.trim() } : {}),
          },
        },
      }),
    onSuccess: () => {
      toast('success', t('common.saved'));
      setToken('');
      void qc.invalidateQueries({ queryKey: ['integrations'] });
      void qc.invalidateQueries({ queryKey: qk.context });
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const health = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; detail?: string }>('/v1/integrations/pay2all/health', { method: 'POST' }),
    onSuccess: (r) => {
      setBalance(r.ok ? (r.detail ?? null) : null);
      toast(
        r.ok ? 'success' : 'error',
        r.detail ?? (r.ok ? t('integrations.healthOk') : t('integrations.healthFail')),
      );
      void qc.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });

  const modes: Array<{ v: ConnMode; title: string; text: string; icon: typeof PlugZap }> = [
    { v: 'DISABLED', title: 'Offline', text: 'Every service is recorded by hand', icon: CircleX },
    {
      v: 'UAT',
      title: 'Test (UAT)',
      text: 'Pay2All sandbox — recharge only, no money moves',
      icon: FlaskConical,
    },
    { v: 'LIVE', title: 'Live', text: 'Real transactions from your Pay2All wallet', icon: Zap },
    ...(p.simulatorAvailable
      ? [
          {
            v: 'SIMULATOR' as const,
            title: 'Simulator',
            text: 'Developers only — never calls Pay2All',
            icon: FlaskConical,
          },
        ]
      : []),
  ];
  const disabled = !canManage || !planAllows;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-black text-on-brand">
              P
            </span>
            Pay2All
          </span>
        }
        description="Recharge and bill payment straight from this app, paid from your own Pay2All wallet."
        actions={
          <Badge
            tone={p.mode === 'LIVE' ? 'success' : p.mode === 'DISABLED' ? 'neutral' : 'warning'}
          >
            {t(`connectorMode.${p.mode}` as never)}
          </Badge>
        }
      />
      <div className="flex flex-col gap-6 p-5">
        {!planAllows ? (
          <Alert
            tone="warning"
            title={t('integrations.planRequired')}
            action={
              <ButtonLink href="/app/subscription" variant="secondary">
                {t('plan.upgrade')}
              </ButtonLink>
            }
          />
        ) : null}

        <fieldset disabled={disabled}>
          <legend className="mb-2 text-sm font-bold">1. Connection</legend>
          <div
            role="radiogroup"
            aria-label="Connection"
            className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
          >
            {modes.map((m) => {
              const Icon = m.icon;
              const on = mode === m.v;
              return (
                <button
                  key={m.v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMode(m.v)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-60',
                    on
                      ? 'border-brand bg-brand-bg/60 ring-1 ring-brand'
                      : 'border-border hover:border-brand/40',
                  )}
                >
                  <Icon
                    aria-hidden
                    className={cn('mt-0.5 size-5 shrink-0', on ? 'text-brand' : 'text-fg-muted')}
                  />
                  <span>
                    <span className="block text-sm font-bold">{m.title}</span>
                    <span className="block text-xs text-fg-muted">{m.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {mode === 'UAT' || mode === 'LIVE' ? (
          <fieldset disabled={disabled} className="grid gap-4 lg:grid-cols-2">
            <legend className="mb-2 text-sm font-bold">2. Pay2All API token</legend>
            <Field
              label="API token"
              required={!p.hasCredentials}
              help={
                p.credentialsMasked?.apiToken
                  ? `Saved (${p.credentialsMasked.apiToken}). Enter a new token only to replace it.`
                  : 'Pay2All → Developer → API token. Stored encrypted; never shown again.'
              }
            >
              {(f) => (
                <Input
                  id={f.id}
                  type="password"
                  autoComplete="off"
                  aria-describedby={f.describedBy}
                  placeholder={p.hasCredentials ? '•••••••• (saved)' : 'Paste your API token'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Bank-verify provider ID"
              optionalLabel="optional"
              help="Only if Pay2All gave you a different provider_id for account verification (default 127)."
            >
              {(f) => (
                <Input
                  id={f.id}
                  inputMode="numeric"
                  placeholder={p.credentialsMasked?.verifyProviderId ?? '127'}
                  value={verifyId}
                  onChange={(e) => setVerifyId(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>
          </fieldset>
        ) : null}

        <fieldset disabled={disabled}>
          <legend className="mb-2 text-sm font-bold">
            {mode === 'UAT' || mode === 'LIVE' ? '3' : '2'}. Offline or Live, per service
          </legend>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {rows.map((s) => {
              const live = services.includes(s) && canLive(s);
              const pending = p.pendingServices.includes(s) && mode !== 'SIMULATOR';
              return (
                <li key={s} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <ServiceIcon code={s} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{label(s)}</span>
                    <span className="block text-xs text-fg-muted">
                      {pending
                        ? 'Live coming soon — Pay2All has not published this API yet'
                        : !canLive(s)
                          ? mode === 'UAT'
                            ? 'Pay2All test mode covers recharge only'
                            : 'Choose Test or Live above to enable'
                          : live
                            ? 'Sent to Pay2All when you save the record'
                            : 'Done on your portal, recorded here'}
                    </span>
                  </span>
                  <div
                    role="radiogroup"
                    aria-label={`${label(s)} mode`}
                    className="flex rounded-lg border border-border p-0.5"
                  >
                    {[false, true].map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        role="radio"
                        aria-checked={live === v}
                        disabled={v && (!canLive(s) || pending)}
                        onClick={() =>
                          setServices((x) =>
                            v ? [...new Set([...x, s])] : x.filter((y) => y !== s),
                          )
                        }
                        className={cn(
                          'min-h-8 rounded-md px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40',
                          live === v
                            ? v
                              ? 'bg-brand text-on-brand'
                              : 'bg-surface-muted text-fg'
                            : 'text-fg-muted',
                        )}
                      >
                        {v ? 'Live' : 'Offline'}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {p.callbackUrl && (p.mode === 'LIVE' || p.mode === 'UAT') ? (
          <div className="flex flex-col gap-2 rounded-xl bg-surface-muted/60 p-4 text-sm">
            <p className="font-bold">Callback URL for Pay2All</p>
            <p className="text-[13px] text-fg-muted">
              Paste this in Pay2All → Developer → API settings → Webhook URL, so pending recharges
              and bills update here by themselves. Keep it private.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs">{p.callbackUrl}</code>
              <CopyText text={p.callbackUrl} label="callback URL" />
            </div>
            <p className="text-[13px] text-fg-muted">
              If Pay2All asks for an IP whitelist, add this server’s public IP address.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {canManage ? (
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!planAllows}>
              {t('common.save')}
            </Button>
          ) : (
            <p className="text-sm text-fg-muted">{t('integrations.viewOnly')}</p>
          )}
          {canManage && p.mode !== 'DISABLED' ? (
            <Button
              variant="outline"
              onClick={() => health.mutate()}
              loading={health.isPending}
              icon={<Activity aria-hidden className="size-4" />}
            >
              Check connection
            </Button>
          ) : null}
          <span className="ml-auto text-xs text-fg-muted">
            {balance ??
              (p.lastHealthAt
                ? `${t('integrations.lastHealth')}: ${formatDateTime(p.lastHealthAt, timezone)} · ${p.lastHealthStatus ?? ''}`
                : '')}
          </span>
        </div>
      </div>
    </Card>
  );
}

/** Providers planned next — shown so owners know what's coming. */
function ComingSoon() {
  const items = [
    { title: 'Flight booking', text: 'Search and book domestic flights', icon: Plane },
    { title: 'Hotel booking', text: 'Rooms across India', icon: Hotel },
    { title: 'More providers', text: 'Connect other API partners', icon: PlugZap },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((i) => (
        <div
          key={i.title}
          className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-surface-muted text-fg-muted">
            <i.icon aria-hidden className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{i.title}</span>
            <span className="block text-xs text-fg-muted">{i.text}</span>
          </span>
          <Badge tone="neutral">Soon</Badge>
        </div>
      ))}
    </div>
  );
}
