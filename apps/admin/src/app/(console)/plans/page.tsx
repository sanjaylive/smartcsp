'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlayCircle, Upload } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '@/components/dialog';
import { Can, Guard } from '@/components/guard';
import { useToast } from '@/components/toast';
import {
  Badge,
  Button,
  Card,
  Empty,
  PageHeader,
  QueryState,
  Switch,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { get, patch, post } from '@/lib/api';
import { dt, formatINR, humanize, pct } from '@/lib/format';
import { useCan } from '@/lib/session';
import type { Plan } from '@/lib/types';
import { PublishVersionDialog } from './publish-dialog';

export default function PlansPage() {
  return (
    <Guard perm="platform.view" what="plans">
      <PlansInner />
    </Guard>
  );
}

function PlansInner() {
  const q = useQuery({
    queryKey: ['plans'],
    queryFn: () => get<{ items: Plan[] }>('/v1/admin/plans'),
  });
  const [publishing, setPublishing] = useState<Plan | null>(null);
  const [confirm, dialog] = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();
  const lifecycle = useMutation({
    mutationFn: () => post<Record<string, unknown>>('/v1/admin/subscriptions/run-lifecycle'),
    onSuccess: (r) => {
      toast.success(
        `Lifecycle processed${
          r
            ? `: ${Object.entries(r)
                .map(([k, v]) => `${humanize(k)} ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                .join(', ')}`
            : '.'
        }`,
      );
      void qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <PageHeader
        title="Plans"
        description="Plans are versioned. Publishing a new version never rewrites history: existing subscribers follow the policy you choose, and every version stays visible below."
        actions={
          <Can perm="subscriptions.manage">
            <Button
              icon={<PlayCircle className="size-4" aria-hidden />}
              loading={lifecycle.isPending}
              onClick={() =>
                confirm({
                  title: 'Run subscription lifecycle now?',
                  description:
                    'Processes trial endings, grace periods, expiries and scheduled plan changes that are due. It normally runs on a schedule; running it again is safe.',
                  confirmLabel: 'Run now',
                  onConfirm: () => lifecycle.mutateAsync(),
                })
              }
            >
              Run lifecycle
            </Button>
          </Can>
        }
      />
      <QueryState query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty title="No plans configured">Run the reference-data seed on the API.</Empty>
          ) : (
            <div className="flex flex-col gap-4">
              {d.items.map((p) => (
                <PlanCard key={p.id} plan={p} onPublish={() => setPublishing(p)} />
              ))}
            </div>
          )
        }
      </QueryState>
      {publishing && <PublishVersionDialog plan={publishing} onClose={() => setPublishing(null)} />}
      {dialog}
    </>
  );
}

function PlanCard({ plan, onPublish }: { plan: Plan; onPublish: () => void }) {
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const current = plan.versions.find((v) => v.id === plan.currentVersionId) ?? plan.versions[0];
  const subscribers = plan.versions.reduce((a, v) => a + v.subscribers, 0);
  const toggle = useMutation({
    mutationFn: (isActive: boolean) => patch(`/v1/admin/plans/${plan.code}`, { isActive }),
    onSuccess: (_r, isActive) => {
      toast.success(
        isActive
          ? `${plan.code} is available for new sign-ups and changes.`
          : `${plan.code} is hidden from new sign-ups and changes.`,
      );
      void qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Card
      id={`plan-${plan.code}`}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>{current?.name ?? plan.code}</span>
          <span className="font-mono text-xs text-fg-muted">{plan.code}</span>
          {plan.isDefault && <Badge tone="brand">Default plan</Badge>}
          {!plan.isActive && <Badge tone="warning">Inactive</Badge>}
          <Badge>
            {subscribers} subscriber{subscribers === 1 ? '' : 's'}
          </Badge>
        </span>
      }
      actions={
        <>
          {can('plans.manage') && (
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              Active
              <Switch
                checked={plan.isActive}
                disabled={toggle.isPending || (plan.isDefault && plan.isActive)}
                onChange={(v) => toggle.mutate(v)}
                label={`${plan.code} plan active`}
              />
            </label>
          )}
          <Can perm="plans.manage">
            <Button
              size="sm"
              variant="primary"
              icon={<Upload className="size-3.5" aria-hidden />}
              onClick={onPublish}
              data-testid={`publish-${plan.code}`}
            >
              Publish new version
            </Button>
          </Can>
        </>
      }
      bodyClassName="p-0"
    >
      {current && (
        <div className="grid gap-x-6 gap-y-1 border-b border-line px-4 py-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-fg-muted">Monthly</span>{' '}
            <strong className="tabular">{formatINR(current.monthlyPricePaise)}</strong>
          </div>
          <div>
            <span className="text-fg-muted">Annual</span>{' '}
            <strong className="tabular">{formatINR(current.annualPricePaise)}</strong>
          </div>
          <div>
            <span className="text-fg-muted">GST</span> {pct(current.taxRateBps)}{' '}
            {current.taxInclusive ? '(inclusive)' : '(extra)'}
          </div>
          <div>
            <span className="text-fg-muted">Trial / grace</span> {current.trialDays}d /{' '}
            {current.graceDays}d
          </div>
          {current.description && (
            <p className="text-fg-muted sm:col-span-2 lg:col-span-4">{current.description}</p>
          )}
        </div>
      )}
      <Table label={`${plan.code} version history`}>
        <thead>
          <tr>
            <Th>Version</Th>
            <Th>Name</Th>
            <Th className="text-right">Monthly</Th>
            <Th className="text-right">Annual</Th>
            <Th>Key limits</Th>
            <Th>Existing subscribers</Th>
            <Th className="text-right">Subscribers</Th>
            <Th>Published</Th>
          </tr>
        </thead>
        <tbody>
          {plan.versions.map((v) => (
            <tr
              key={v.id}
              data-testid={`version-row-${plan.code}`}
              className={v.id === plan.currentVersionId ? 'bg-brand-bg/40' : undefined}
            >
              <Td className="whitespace-nowrap">
                v{v.version}{' '}
                {v.id === plan.currentVersionId && (
                  <Badge tone="success" className="ml-1">
                    Current
                  </Badge>
                )}
                {v.isDemoDefault && (
                  <Badge tone="info" className="ml-1">
                    Demo default
                  </Badge>
                )}
              </Td>
              <Td>{v.name}</Td>
              <Td className="tabular text-right">{formatINR(v.monthlyPricePaise)}</Td>
              <Td className="tabular text-right">{formatINR(v.annualPricePaise)}</Td>
              <Td className="text-xs text-fg-muted">
                {v.entitlements.monthlyRecordLimit ?? '∞'} records/mo ·{' '}
                {v.entitlements.staffLimit ?? '∞'} staff ·{' '}
                {v.entitlements.enabledServiceLimit ?? '∞'} services
              </Td>
              <Td className="text-xs">{humanize(v.existingSubscribers)}</Td>
              <Td className="tabular text-right">{v.subscribers}</Td>
              <Td className="whitespace-nowrap text-xs">{dt(v.createdAt)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
