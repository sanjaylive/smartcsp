'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Eye, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { use, useState } from 'react';
import type { Entitlements } from '@csp2all/shared';
import { useConfirm } from '@/components/dialog';
import { Can } from '@/components/guard';
import { useToast } from '@/components/toast';
import {
  Badge,
  Button,
  Callout,
  Card,
  DescList,
  Empty,
  PageHeader,
  QueryState,
  StatusBadge,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { del, get, post } from '@/lib/api';
import { bytes, dt, ENTITLEMENT_LABELS, entitlementValue, humanize, shortId } from '@/lib/format';
import { useCan } from '@/lib/session';
import type { TenantDetail } from '@/lib/types';
import { ChangePlanDialog, OverrideDialog, StartSupportDialog, UsageDialog } from './dialogs';

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => get<TenantDetail>(`/v1/admin/tenants/${id}`),
  });
  return (
    <QueryState query={q} loadingLabel="Loading tenant…">
      {(t) => <TenantView t={t} />}
    </QueryState>
  );
}

function TenantView({ t }: { t: TenantDetail }) {
  const id = t.tenant.id;
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const [confirm, confirmDialog] = useConfirm();
  const [dialog, setDialog] = useState<null | 'plan' | 'override' | 'usage' | 'support'>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['tenant', id] });
    void qc.invalidateQueries({ queryKey: ['tenants'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
  };

  const revoke = useMutation({
    mutationFn: (overrideId: string) =>
      del(`/v1/admin/tenants/${id}/entitlement-overrides/${overrideId}`),
    onSuccess: () => {
      toast.success('Override revoked. The plan value applies again.');
      refresh();
    },
  });

  const status = t.tenant.status;
  const activeOverrides = t.overrides.filter(
    (o) => !o.revokedAt && (!o.expiresAt || new Date(o.expiresAt) > new Date()),
  );
  const overrideFor = (k: keyof Entitlements) => activeOverrides.find((o) => o.key === k);

  return (
    <>
      <PageHeader
        back={{ href: '/tenants', label: 'Tenants' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span data-testid="tenant-name">{t.tenant.name}</span>
            <span data-testid="tenant-status">
              <StatusBadge status={status} />
            </span>
          </span>
        }
        description={
          <>
            Owner {t.tenant.ownerDisplayName} · {t.tenant.district}, {t.tenant.state} ·{' '}
            <span className="font-mono text-[12px]">{id}</span>
          </>
        }
        actions={
          <>
            <Can perm="support.access">
              <Button
                icon={<Eye className="size-4" aria-hidden />}
                onClick={() => setDialog('support')}
              >
                Start support session
              </Button>
            </Can>
            <Can perm="tenants.manage">
              {status === 'ACTIVE' && (
                <Button
                  variant="warning"
                  icon={<Ban className="size-4" aria-hidden />}
                  onClick={() =>
                    confirm({
                      title: `Suspend ${t.tenant.name}?`,
                      description:
                        'Staff of this shop lose access immediately. Their data is kept. The shop is notified with your reason.',
                      confirmLabel: 'Suspend shop',
                      tone: 'warning',
                      reasonMin: 5,
                      reasonLabel: 'Reason (shown to the shop and audited)',
                      onConfirm: async (reason) => {
                        await post(`/v1/admin/tenants/${id}/status`, {
                          status: 'SUSPENDED',
                          reason,
                        });
                        toast.success('Shop suspended.');
                        refresh();
                      },
                    })
                  }
                >
                  Suspend
                </Button>
              )}
              {status === 'SUSPENDED' && (
                <Button
                  variant="primary"
                  icon={<RotateCcw className="size-4" aria-hidden />}
                  onClick={() =>
                    confirm({
                      title: `Restore ${t.tenant.name}?`,
                      description: 'Staff regain access immediately. The shop is notified.',
                      confirmLabel: 'Restore shop',
                      reasonMin: 5,
                      reasonLabel: 'Reason (shown to the shop and audited)',
                      onConfirm: async (reason) => {
                        await post(`/v1/admin/tenants/${id}/status`, { status: 'ACTIVE', reason });
                        toast.success('Shop restored.');
                        refresh();
                      },
                    })
                  }
                >
                  Restore
                </Button>
              )}
              {status !== 'PENDING_DELETION' && (
                <Button
                  variant="danger"
                  icon={<Trash2 className="size-4" aria-hidden />}
                  onClick={() =>
                    confirm({
                      title: 'Request tenant deletion',
                      description:
                        'This suspends the shop now and schedules permanent deletion after the retention window (per the deletion runbook). It cannot be undone from this console.',
                      body: (
                        <Callout tone="danger" title="Destructive action">
                          All records, customers and ledgers of <strong>{t.tenant.name}</strong>{' '}
                          will be purged once the retention window ends.
                        </Callout>
                      ),
                      confirmLabel: 'Request deletion',
                      tone: 'danger',
                      reasonMin: 10,
                      typeToConfirm: t.tenant.name,
                      onConfirm: async (reason) => {
                        await post(`/v1/admin/tenants/${id}/deletion-request`, {
                          reason,
                          confirmName: t.tenant.name,
                        });
                        toast.success('Deletion requested. The shop is now pending deletion.');
                        refresh();
                      },
                    })
                  }
                >
                  Request deletion
                </Button>
              )}
            </Can>
          </>
        }
      />

      {t.tenant.statusReason && status !== 'ACTIVE' && (
        <div className="mb-4">
          <Callout
            tone={status === 'PENDING_DELETION' ? 'danger' : 'warning'}
            title={status === 'PENDING_DELETION' ? 'Pending deletion' : 'Suspended'}
          >
            Reason: {t.tenant.statusReason}
          </Callout>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card
            title="Subscription"
            id="subscription"
            actions={
              <Can perm="subscriptions.manage">
                <Button size="sm" onClick={() => setDialog('plan')} disabled={!t.subscription}>
                  Change plan
                </Button>
              </Can>
            }
          >
            {t.subscription ? (
              <DescList
                items={[
                  [
                    'Plan',
                    <span key="p" data-testid="tenant-plan">
                      <strong>{t.subscription.planName}</strong>{' '}
                      <span className="text-fg-muted">({t.subscription.planCode})</span>
                    </span>,
                  ],
                  ['Status', <StatusBadge key="s" status={t.subscription.status} />],
                  ['Billing cycle', humanize(t.subscription.billingCycle)],
                  [
                    'Current period',
                    `${dt(t.subscription.currentPeriodStart)} → ${dt(t.subscription.currentPeriodEnd)}`,
                  ],
                  ...(t.subscription.graceEndsAt
                    ? ([['Grace ends', dt(t.subscription.graceEndsAt)]] as [string, string][])
                    : []),
                  ...(t.subscription.scheduledChangeAt
                    ? ([
                        [
                          'Scheduled change',
                          `${humanize(t.subscription.scheduledBillingCycle)} plan change on ${dt(t.subscription.scheduledChangeAt)}`,
                        ],
                      ] as [string, string][])
                    : []),
                ]}
              />
            ) : (
              <Empty title="No subscription" />
            )}
          </Card>

          <Card
            title="Entitlements"
            id="entitlements"
            actions={
              <Can perm="subscriptions.manage">
                <Button
                  size="sm"
                  icon={<Plus className="size-3.5" aria-hidden />}
                  onClick={() => setDialog('override')}
                  disabled={!t.subscription}
                >
                  Add override
                </Button>
              </Can>
            }
            bodyClassName="p-0"
          >
            <Table label="Effective entitlements">
              <thead>
                <tr>
                  <Th>Entitlement</Th>
                  <Th>Effective value</Th>
                  <Th>Source</Th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(ENTITLEMENT_LABELS) as (keyof Entitlements)[]).map((k) => {
                  const o = overrideFor(k);
                  return (
                    <tr key={k}>
                      <Td>{ENTITLEMENT_LABELS[k]}</Td>
                      <Td className="tabular font-medium">
                        {entitlementValue(k, t.entitlements[k])}
                      </Td>
                      <Td>
                        {o ? (
                          <Badge tone="brand">
                            Override{o.expiresAt ? ` until ${dt(o.expiresAt)}` : ''}
                          </Badge>
                        ) : (
                          <span className="text-xs text-fg-muted">Plan</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <div className="border-t border-line p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Override history
              </h3>
              {t.overrides.length === 0 ? (
                <p className="text-[13px] text-fg-muted">
                  No overrides. This shop gets exactly what its plan includes.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5" data-testid="override-list">
                  {t.overrides.map((o) => {
                    const active = activeOverrides.includes(o);
                    return (
                      <li
                        key={o.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-2.5 py-1.5 text-[13px]"
                        data-testid="override-row"
                        data-active={active}
                      >
                        <div>
                          <strong>{ENTITLEMENT_LABELS[o.key] ?? o.key}</strong> →{' '}
                          {entitlementValue(o.key, o.value)}{' '}
                          {active ? (
                            <Badge tone="success">Active</Badge>
                          ) : (
                            <Badge>{o.revokedAt ? 'Revoked' : 'Expired'}</Badge>
                          )}
                          <div className="text-xs text-fg-muted">
                            {o.reason} · set {dt(o.createdAt)}
                            {o.expiresAt && ` · expires ${dt(o.expiresAt)}`}
                            {o.revokedAt && ` · revoked ${dt(o.revokedAt)}`}
                          </div>
                        </div>
                        {active && can('subscriptions.manage') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              confirm({
                                title: `Revoke ${ENTITLEMENT_LABELS[o.key]} override?`,
                                description:
                                  'The value from the shop’s plan applies again immediately.',
                                confirmLabel: 'Revoke override',
                                tone: 'danger',
                                onConfirm: () => revoke.mutateAsync(o.id),
                              })
                            }
                          >
                            Revoke
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>

          <Card title="Members" bodyClassName="p-0">
            {t.members.length === 0 ? (
              <Empty title="No members" />
            ) : (
              <Table label="Members">
                <thead>
                  <tr>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th>Last sign-in</Th>
                  </tr>
                </thead>
                <tbody>
                  {t.members.map((m) => (
                    <tr key={m.id}>
                      <Td>{m.email}</Td>
                      <Td>{humanize(m.role)}</Td>
                      <Td>
                        <StatusBadge status={m.status} />
                      </Td>
                      <Td>{dt(m.lastLoginAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Subscription events" bodyClassName="p-0">
            {t.subscriptionEvents.length === 0 ? (
              <Empty title="No events yet" />
            ) : (
              <Table label="Subscription events">
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Event</Th>
                    <Th>Actor</Th>
                    <Th>Details</Th>
                  </tr>
                </thead>
                <tbody>
                  {t.subscriptionEvents.map((e) => (
                    <tr key={e.id}>
                      <Td className="whitespace-nowrap">{dt(e.createdAt)}</Td>
                      <Td>{humanize(e.type)}</Td>
                      <Td>{humanize(e.actorType)}</Td>
                      <Td className="max-w-[320px] truncate font-mono text-[11px] text-fg-muted">
                        {e.data ? JSON.stringify(e.data) : '—'}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Shop profile">
            <DescList
              items={[
                ['Owner', t.tenant.ownerDisplayName],
                [
                  'Phone',
                  t.tenant.contactPhone
                    ? `${t.tenant.contactPhone}${t.tenant.contactPhoneVerified ? ' (verified)' : ''}`
                    : '—',
                ],
                ['Location', `${t.tenant.district}, ${t.tenant.state}`],
                ['Timezone', t.tenant.timezone],
                ['Created', dt(t.tenant.createdAt)],
              ]}
            />
          </Card>

          <Card
            title={`Usage · ${t.usage.periodKey}`}
            id="usage"
            actions={
              <Can perm="subscriptions.manage">
                <Button size="sm" onClick={() => setDialog('usage')}>
                  Adjust usage
                </Button>
              </Can>
            }
          >
            <DescList
              items={[
                [
                  'Records this month',
                  <span
                    key="r"
                    className="tabular"
                    data-testid="usage-records"
                  >{`${t.usage.recordsThisPeriod} / ${entitlementValue('monthlyRecordLimit', t.entitlements.monthlyRecordLimit)}`}</span>,
                ],
                [
                  'Staff',
                  `${t.usage.staff} / ${entitlementValue('staffLimit', t.entitlements.staffLimit)}`,
                ],
                [
                  'Enabled services',
                  `${t.usage.enabledServices} / ${entitlementValue('enabledServiceLimit', t.entitlements.enabledServiceLimit)}`,
                ],
                [
                  'Custom services',
                  `${t.usage.customServices} / ${t.entitlements.customServiceLimit}`,
                ],
                ['Storage', `${bytes(t.usage.storageBytes)} / ${t.entitlements.storageLimitMb} MB`],
              ]}
            />
            <p className="mt-2 text-xs text-fg-muted">Period in {t.usage.periodTimezone}.</p>
          </Card>

          <Card title="Services">
            {t.services.length === 0 ? (
              <p className="text-[13px] text-fg-muted">No services selected.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {t.services.map((s) => (
                  <li key={s.code}>
                    <Badge tone={s.enabled ? 'brand' : 'neutral'}>
                      {humanize(s.code)}
                      {!s.enabled && ' (off)'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Connector">
            {t.connector ? (
              <DescList
                items={[
                  ['Mode', <StatusBadge key="m" status={t.connector.mode} />],
                  ['Services', t.connector.enabledServices.map(humanize).join(', ') || '—'],
                  [
                    'Health',
                    `${t.connector.lastHealthStatus ?? '—'} · ${dt(t.connector.lastHealthAt)}`,
                  ],
                ]}
              />
            ) : (
              <p className="text-[13px] text-fg-muted">
                Not configured (manual record-keeping only).
              </p>
            )}
          </Card>

          <Card title="Support sessions" bodyClassName="p-0">
            {t.supportSessions.length === 0 ? (
              <p className="p-4 text-[13px] text-fg-muted">
                No support access has been used for this shop.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {t.supportSessions.map((s) => {
                  const active = !s.endedAt && new Date(s.expiresAt) > new Date();
                  return (
                    <li key={s.id} className="px-4 py-2 text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px]">{shortId(s.id)}</span>
                        {active ? (
                          <Badge tone="warning">Active</Badge>
                        ) : (
                          <Badge>{s.endedAt ? 'Ended' : 'Expired'}</Badge>
                        )}
                      </div>
                      <div className="text-fg-muted">{s.reason}</div>
                      <div className="text-xs text-fg-muted">
                        {dt(s.startedAt)} → {dt(s.endedAt ?? s.expiresAt)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {confirmDialog}
      {dialog === 'plan' && t.subscription && (
        <ChangePlanDialog tenant={t} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog === 'override' && (
        <OverrideDialog tenant={t} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog === 'usage' && (
        <UsageDialog tenant={t} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog === 'support' && (
        <StartSupportDialog
          tenantId={id}
          tenantName={t.tenant.name}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
