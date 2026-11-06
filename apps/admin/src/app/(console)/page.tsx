'use client';

import { useQuery } from '@tanstack/react-query';
import { Guard } from '@/components/guard';
import { Card, Empty, PageHeader, QueryState, Stat } from '@/components/ui';
import { get } from '@/lib/api';
import { humanize } from '@/lib/format';
import type { Overview } from '@/lib/types';

export default function OverviewPage() {
  return (
    <Guard perm="platform.view" what="the platform overview">
      <OverviewInner />
    </Guard>
  );
}

function OverviewInner() {
  const q = useQuery({
    queryKey: ['overview'],
    queryFn: () => get<Overview>('/v1/admin/overview'),
    refetchInterval: 60_000,
  });
  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Health and activity across all CSP2All shops. Figures refresh every minute."
      />
      <QueryState query={q}>
        {(o) => {
          const totalTenants = Object.values(o.tenants).reduce((a, b) => a + b, 0);
          return (
            <div className="flex flex-col gap-4" data-testid="overview">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Stat
                  label="Shops (tenants)"
                  value={totalTenants}
                  href="/tenants"
                  hint={`${o.newTenants30d} new in 30 days`}
                />
                <Stat
                  label="Active shops"
                  value={o.tenants.ACTIVE ?? 0}
                  tone="success"
                  href="/tenants?status=ACTIVE"
                />
                <Stat
                  label="Suspended"
                  value={o.tenants.SUSPENDED ?? 0}
                  tone={o.tenants.SUSPENDED ? 'warning' : undefined}
                  href="/tenants?status=SUSPENDED"
                />
                <Stat
                  label="Pending deletion"
                  value={o.tenants.PENDING_DELETION ?? 0}
                  tone={o.tenants.PENDING_DELETION ? 'danger' : undefined}
                  href="/tenants?status=PENDING_DELETION"
                />
                <Stat label="Users" value={o.users} />
                <Stat label="Records (30 days)" value={o.records30d} />
              </div>
              <h2 className="text-sm font-semibold">Needs attention</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <Stat
                  label="Payments to review"
                  value={o.pendingPayments}
                  tone={o.pendingPayments ? 'warning' : 'success'}
                  href="/payments"
                />
                <Stat
                  label="Failed emails (24h)"
                  value={o.failedEmails24h}
                  tone={o.failedEmails24h ? 'danger' : 'success'}
                  href="/emails?status=FAILED"
                />
                <Stat
                  label="Failed outbox events"
                  value={o.failedOutbox}
                  tone={o.failedOutbox ? 'danger' : 'success'}
                  href="/jobs"
                />
                <Stat
                  label="Reconciliation exceptions"
                  value={o.openReconciliationExceptions}
                  tone={o.openReconciliationExceptions ? 'warning' : 'success'}
                  href="/connectors"
                />
                <Stat
                  label="Active support sessions"
                  value={o.activeSupportSessions}
                  tone={o.activeSupportSessions ? 'info' : undefined}
                  href="/support"
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Subscriptions by plan">
                  {Object.keys(o.subscriptionsByPlan).length === 0 ? (
                    <Empty title="No subscriptions yet" />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {Object.entries(o.subscriptionsByPlan)
                        .sort((a, b) => b[1] - a[1])
                        .map(([code, count]) => {
                          const max = Math.max(...Object.values(o.subscriptionsByPlan));
                          return (
                            <li
                              key={code}
                              className="grid grid-cols-[120px_1fr_48px] items-center gap-2 text-[13px]"
                            >
                              <span className="font-medium">{code}</span>
                              <span className="h-2 rounded-full bg-muted" aria-hidden>
                                <span
                                  className="block h-2 rounded-full bg-brand"
                                  style={{ width: `${(count / max) * 100}%` }}
                                />
                              </span>
                              <span className="tabular text-right">{count}</span>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </Card>
                <Card title="Job queue">
                  {Object.keys(o.queues).length === 0 ? (
                    <Empty title="Queue counts unavailable">
                      The API runs jobs inline or the queue is unreachable.
                    </Empty>
                  ) : (
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {Object.entries(o.queues).map(([k, v]) => (
                        <div key={k} className="rounded-md bg-muted px-2 py-1.5">
                          <dt className="text-xs text-fg-muted">{humanize(k)}</dt>
                          <dd
                            className={`tabular text-lg font-semibold ${k === 'failed' && v ? 'text-danger' : ''}`}
                          >
                            {v}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </Card>
              </div>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
