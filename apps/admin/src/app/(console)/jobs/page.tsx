'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import { Guard } from '@/components/guard';
import { useToast } from '@/components/toast';
import { Button, Card, Empty, PageHeader, QueryState, Stat, Table, Td, Th } from '@/components/ui';
import { get, post } from '@/lib/api';
import { dt, humanize, shortId } from '@/lib/format';
import type { JobsResponse } from '@/lib/types';

export default function JobsPage() {
  return (
    <Guard perm="jobs.manage" what="background jobs">
      <JobsInner />
    </Guard>
  );
}

function JobsInner() {
  const q = useQuery({
    queryKey: ['jobs'],
    queryFn: () => get<JobsResponse>('/v1/admin/jobs'),
    refetchInterval: 30_000,
  });
  const qc = useQueryClient();
  const toast = useToast();
  const retryJob = useMutation({
    mutationFn: (id: string) => post(`/v1/admin/jobs/${encodeURIComponent(id)}/retry`),
    onSuccess: () => {
      toast.success('Job queued for retry.');
      void qc.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const retryOutbox = useMutation({
    mutationFn: (id: string) => post(`/v1/admin/outbox/${id}/retry`),
    onSuccess: () => {
      toast.success('Outbox event re-queued.');
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <>
      <PageHeader
        title="Background jobs"
        description="Queue health, failed jobs and failed outbox events (emails, notifications, reconciliation). Retrying is safe: handlers are idempotent."
      />
      <QueryState query={q}>
        {(d) => (
          <div className="flex flex-col gap-4">
            {Object.keys(d.queues).length === 0 ? (
              <Card>
                <Empty title="Queue counts unavailable">
                  The API is running jobs inline (QUEUE_DRIVER=inline) or Redis is unreachable.
                </Empty>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {Object.entries(d.queues).map(([k, v]) => (
                  <Stat
                    key={k}
                    label={humanize(k)}
                    value={v}
                    tone={k === 'failed' && v ? 'danger' : undefined}
                  />
                ))}
              </div>
            )}

            <Card title={`Failed jobs (${d.failedJobs.length})`} bodyClassName="p-0">
              {d.failedJobs.length === 0 ? (
                <Empty title="No failed jobs" />
              ) : (
                <Table label="Failed jobs">
                  <thead>
                    <tr>
                      <Th>Job</Th>
                      <Th>Tenant</Th>
                      <Th>Failed reason</Th>
                      <Th className="text-right">Attempts</Th>
                      <Th>Queued</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.failedJobs.map((j) => (
                      <tr key={j.id}>
                        <Td>
                          <div className="font-medium">{j.name}</div>
                          <div className="font-mono text-[11px] text-fg-muted">{j.id}</div>
                        </Td>
                        <Td className="font-mono text-[12px]">{shortId(j.tenantId)}</Td>
                        <Td className="max-w-[360px] text-xs text-danger">
                          {j.failedReason ?? '—'}
                        </Td>
                        <Td className="tabular text-right">{j.attemptsMade}</Td>
                        <Td className="whitespace-nowrap">{dt(j.timestamp)}</Td>
                        <Td className="text-right">
                          <Button
                            size="sm"
                            icon={<RotateCw className="size-3.5" aria-hidden />}
                            loading={retryJob.isPending && retryJob.variables === j.id}
                            onClick={() => retryJob.mutate(j.id)}
                          >
                            Retry
                          </Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card title={`Failed outbox events (${d.failedOutbox.length})`} bodyClassName="p-0">
              {d.failedOutbox.length === 0 ? (
                <Empty title="No failed outbox events" />
              ) : (
                <Table label="Failed outbox events">
                  <thead>
                    <tr>
                      <Th>Event</Th>
                      <Th>Tenant</Th>
                      <Th>Last error</Th>
                      <Th className="text-right">Attempts</Th>
                      <Th>Created</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.failedOutbox.map((o) => (
                      <tr key={o.id}>
                        <Td>
                          <div className="font-medium">{o.type}</div>
                          <div className="font-mono text-[11px] text-fg-muted">{o.id}</div>
                        </Td>
                        <Td className="font-mono text-[12px]">{shortId(o.tenantId)}</Td>
                        <Td className="max-w-[360px] text-xs text-danger">{o.lastError ?? '—'}</Td>
                        <Td className="tabular text-right">{o.attempts}</Td>
                        <Td className="whitespace-nowrap">{dt(o.createdAt)}</Td>
                        <Td className="text-right">
                          <Button
                            size="sm"
                            icon={<RotateCw className="size-3.5" aria-hidden />}
                            loading={retryOutbox.isPending && retryOutbox.variables === o.id}
                            onClick={() => retryOutbox.mutate(o.id)}
                          >
                            Retry
                          </Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        )}
      </QueryState>
    </>
  );
}
