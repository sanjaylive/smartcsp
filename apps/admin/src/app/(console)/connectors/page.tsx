'use client';

import { useQuery } from '@tanstack/react-query';
import { PlugZap } from 'lucide-react';
import Link from 'next/link';
import { Guard } from '@/components/guard';
import {
  Badge,
  Callout,
  Card,
  Empty,
  PageHeader,
  QueryState,
  Stat,
  StatusBadge,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { get } from '@/lib/api';
import { dt, humanize, shortId } from '@/lib/format';
import type { ConnectorsResponse } from '@/lib/types';

/** Missing prerequisites for a live Pay2All connector — mirrors docs/PAY2ALL_READINESS.md ("Missing"). */
const PAY2ALL_PREREQUISITES = [
  'Official API documentation: sandbox/production base URLs, endpoints, request/response schemas, error codes',
  'Authentication and request-signing specification',
  'Service catalogue and per-service semantics, limits and fees',
  'Idempotency guarantees and an authoritative transaction status-query endpoint',
  'Webhook/callback specification: events, signature scheme, retry policy, IP ranges',
  'Settlement, commission and reversal/refund report formats for reconciliation',
  'Sandbox and production credentials; IP allow-listing requirements',
  'Contract, onboarding/certification steps and regulatory approvals',
];

export default function ConnectorsPage() {
  return (
    <Guard perm="connectors.manage" what="connectors">
      <ConnectorsInner />
    </Guard>
  );
}

function ConnectorsInner() {
  const q = useQuery({
    queryKey: ['connectors'],
    queryFn: () => get<ConnectorsResponse>('/v1/admin/connectors'),
    refetchInterval: 60_000,
  });
  return (
    <>
      <PageHeader
        title="Connectors & health"
        description="Provider connector configuration across shops, operation outcomes, reconciliation exceptions and incoming webhooks."
      />
      <QueryState query={q}>
        {(d) => (
          <div className="flex flex-col gap-4">
            {!d.pay2all.liveAvailable && (
              <Callout
                tone="warning"
                icon={<PlugZap className="size-4" aria-hidden />}
                title="Pay2All live connector is disabled"
              >
                <p>{d.pay2all.reason}</p>
                <p className="mt-1.5 font-medium">Missing prerequisites:</p>
                <ul className="list-disc pl-5">
                  {PAY2ALL_PREREQUISITES.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs">
                  Until then shops can only use DISABLED (manual records) or SIMULATOR mode. No real
                  money moves through CSP2All.
                </p>
              </Callout>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              {Object.keys(d.operationsByStatus).length === 0 ? (
                <Stat label="Provider operations" value={0} />
              ) : (
                Object.entries(d.operationsByStatus).map(([k, v]) => (
                  <Stat
                    key={k}
                    label={`Operations · ${humanize(k)}`}
                    value={v}
                    tone={
                      k === 'UNKNOWN' || k === 'FAILED' ? (v ? 'warning' : undefined) : undefined
                    }
                  />
                ))
              )}
              <Stat
                label="Open exceptions"
                value={d.openExceptions.length}
                tone={d.openExceptions.length ? 'warning' : 'success'}
              />
            </div>

            <Card title={`Connector configurations (${d.configs.length})`} bodyClassName="p-0">
              {d.configs.length === 0 ? (
                <Empty title="No shop has configured a connector" />
              ) : (
                <Table label="Connector configurations">
                  <thead>
                    <tr>
                      <Th>Tenant</Th>
                      <Th>Provider</Th>
                      <Th>Mode</Th>
                      <Th>Services</Th>
                      <Th>Credentials</Th>
                      <Th>Health</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.configs.map((c) => (
                      <tr key={c.id}>
                        <Td>
                          <Link
                            href={`/tenants/${c.tenantId}`}
                            className="font-mono text-[12px] text-brand hover:underline"
                          >
                            {shortId(c.tenantId)}
                          </Link>
                        </Td>
                        <Td>{c.provider}</Td>
                        <Td>
                          <StatusBadge status={c.mode} />
                        </Td>
                        <Td className="text-xs">
                          {c.enabledServices.map(humanize).join(', ') || '—'}
                        </Td>
                        <Td className="font-mono text-[11px] text-fg-muted">
                          {c.credentialsMasked && typeof c.credentialsMasked === 'object'
                            ? Object.entries(c.credentialsMasked as Record<string, string>)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(', ')
                            : '—'}
                          {c.keyVersion != null && ` (key v${c.keyVersion})`}
                        </Td>
                        <Td>
                          {c.lastHealthStatus ? (
                            <StatusBadge status={c.lastHealthStatus} />
                          ) : (
                            <span className="text-fg-muted">—</span>
                          )}
                          <div className="text-xs text-fg-muted">{dt(c.lastHealthAt)}</div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card title="Open reconciliation exceptions" bodyClassName="p-0">
              {d.openExceptions.length === 0 ? (
                <Empty title="No open exceptions">
                  Every provider operation matches the provider’s records.
                </Empty>
              ) : (
                <Table label="Reconciliation exceptions">
                  <thead>
                    <tr>
                      <Th>Raised</Th>
                      <Th>Tenant</Th>
                      <Th>Kind</Th>
                      <Th>Operation</Th>
                      <Th>Details</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.openExceptions.map((e) => (
                      <tr key={e.id}>
                        <Td className="whitespace-nowrap">{dt(e.createdAt)}</Td>
                        <Td>
                          <Link
                            href={`/tenants/${e.tenantId}`}
                            className="font-mono text-[12px] text-brand hover:underline"
                          >
                            {shortId(e.tenantId)}
                          </Link>
                        </Td>
                        <Td>
                          <Badge tone="warning">{humanize(e.kind)}</Badge>
                        </Td>
                        <Td className="font-mono text-[12px]">{shortId(e.operationId)}</Td>
                        <Td className="max-w-[360px] truncate font-mono text-[11px] text-fg-muted">
                          {e.details ? JSON.stringify(e.details) : '—'}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card title="Recent webhook receipts" bodyClassName="p-0">
              {d.recentWebhooks.length === 0 ? (
                <Empty title="No webhooks received" />
              ) : (
                <Table label="Webhook receipts">
                  <thead>
                    <tr>
                      <Th>Received</Th>
                      <Th>Provider</Th>
                      <Th>Delivery ID</Th>
                      <Th>Signature</Th>
                      <Th>Status</Th>
                      <Th>Error</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.recentWebhooks.map((w) => (
                      <tr key={w.id}>
                        <Td className="whitespace-nowrap">{dt(w.receivedAt)}</Td>
                        <Td>{w.provider}</Td>
                        <Td className="font-mono text-[11px]">{w.deliveryId}</Td>
                        <Td>
                          {w.signatureValid ? (
                            <Badge tone="success">Valid</Badge>
                          ) : (
                            <Badge tone="danger">Invalid</Badge>
                          )}
                        </Td>
                        <Td>
                          <StatusBadge status={w.status} />
                        </Td>
                        <Td className="text-xs text-danger">{w.error ?? ''}</Td>
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
